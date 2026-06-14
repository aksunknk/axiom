"""Mimi バッチエンリッチタスク。"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import models
from database import SessionLocal
from llm.prompts import enrich_messages, normalize_enrichment, normalize_rationale, rationale_messages
from llm_client import chat_completion, DEFAULT_NANA_MODEL, extract_json_object

logger = logging.getLogger(__name__)

QUEUED = {"status": "queued", "data": None}
IDLE_JSON = "{}"
RETRYABLE_STATUSES = frozenset({"queued", "pending", "failed"})


@dataclass(frozen=True, slots=True)
class EnrichBatchResult:
    queued_before: int
    processed: int
    done: int
    requeued: int


async def _enrich_note(note: str) -> dict | None:
    content = await chat_completion(
        enrich_messages(note),
        max_tokens=512,
        temperature=0.1,
    )
    if not content:
        return None
    raw = extract_json_object(content)
    if not raw:
        return None
    return normalize_enrichment(raw)


def _log_enrich_status(raw: str | None) -> str | None:
    if not raw or raw == "{}":
        return None
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return "failed"
    if isinstance(data, dict):
        return data.get("status")
    return None


def _event_llm_status(payload_raw: str | None) -> str | None:
    if not payload_raw:
        return None
    try:
        payload = json.loads(payload_raw)
    except json.JSONDecodeError:
        return None
    llm = payload.get("llm")
    if isinstance(llm, dict):
        return llm.get("status")
    return None


def count_enrich_queue(days: int = 7) -> int:
    """バッチ対象（queued / pending / failed）の件数。"""
    db = SessionLocal()
    try:
        since = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=days)
        count = 0
        logs = (
            db.query(models.Log)
            .filter(models.Log.timestamp >= since)
            .all()
        )
        for log in logs:
            if not log.note.strip():
                continue
            status = _log_enrich_status(log.enrichment)
            if status in RETRYABLE_STATUSES:
                count += 1

        events = (
            db.query(models.Event)
            .filter(
                models.Event.timestamp >= since,
                models.Event.kind == "nottodo_purge",
            )
            .all()
        )
        for event in events:
            payload = json.loads(event.payload) if event.payload else {}
            note = payload.get("note")
            if not isinstance(note, str) or not note.strip():
                continue
            status = _event_llm_status(event.payload)
            if status is None or status in RETRYABLE_STATUSES:
                count += 1
        return count
    finally:
        db.close()


async def _apply_log_enrichment(log_id: int, note: str) -> bool:
    db = SessionLocal()
    try:
        data = await _enrich_note(note)
        log = db.get(models.Log, log_id)
        if not log:
            return False
        if data:
            log.enrichment = json.dumps(
                {"status": "done", "data": data},
                ensure_ascii=False,
            )
        else:
            log.enrichment = json.dumps(QUEUED, ensure_ascii=False)
        db.commit()
        return bool(data)
    except Exception:
        logger.exception("_apply_log_enrichment failed for log_id=%s", log_id)
        try:
            log = db.get(models.Log, log_id)
            if log:
                log.enrichment = json.dumps(QUEUED, ensure_ascii=False)
                db.commit()
        except Exception:
            db.rollback()
        return False
    finally:
        db.close()


async def _apply_event_enrichment(event_id: int, note: str) -> bool:
    db = SessionLocal()
    try:
        data = await _enrich_note(note)
        event = db.get(models.Event, event_id)
        if not event:
            return False
        payload = json.loads(event.payload) if event.payload else {}
        if data:
            payload["llm"] = {"status": "done", "data": data}
        else:
            payload["llm"] = QUEUED
        event.payload = json.dumps(payload, ensure_ascii=False)
        db.commit()
        return bool(data)
    except Exception:
        logger.exception("_apply_event_enrichment failed for event_id=%s", event_id)
        try:
            event = db.get(models.Event, event_id)
            if event:
                payload = json.loads(event.payload) if event.payload else {}
                payload["llm"] = QUEUED
                event.payload = json.dumps(payload, ensure_ascii=False)
                db.commit()
        except Exception:
            db.rollback()
        return False
    finally:
        db.close()


async def run_enrich_batch(days: int = 7) -> EnrichBatchResult:
    """キュー済みログ・イベントを一括エンリッチする。"""
    db = SessionLocal()
    try:
        since = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=days)
        log_jobs: list[tuple[int, str]] = []
        event_jobs: list[tuple[int, str]] = []

        for log in db.query(models.Log).filter(models.Log.timestamp >= since).all():
            note = log.note.strip()
            if not note:
                continue
            if _log_enrich_status(log.enrichment) in RETRYABLE_STATUSES:
                log_jobs.append((log.id, note))

        for event in (
            db.query(models.Event)
            .filter(
                models.Event.timestamp >= since,
                models.Event.kind == "nottodo_purge",
            )
            .all()
        ):
            payload = json.loads(event.payload) if event.payload else {}
            note = payload.get("note")
            if not isinstance(note, str) or not note.strip():
                continue
            status = _event_llm_status(event.payload)
            if status is None or status in RETRYABLE_STATUSES:
                event_jobs.append((event.id, note.strip()))

        queued_before = len(log_jobs) + len(event_jobs)
        done = 0
        requeued = 0

        for log_id, note in log_jobs:
            if await _apply_log_enrichment(log_id, note):
                done += 1
            else:
                requeued += 1

        for event_id, note in event_jobs:
            if await _apply_event_enrichment(event_id, note):
                done += 1
            else:
                requeued += 1

        return EnrichBatchResult(
            queued_before=queued_before,
            processed=queued_before,
            done=done,
            requeued=requeued,
        )
    finally:
        db.close()


async def generate_safe_mode_rationale(
    params: dict[str, int],
    *,
    integrity: int | None = None,
    integrity_delta: int | None = None,
    diagnosis: str | None = None,
) -> str | None:
    """Safe Mode 正当化テキスト + 最初の一手を生成する（Nana）。"""
    content = await chat_completion(
        rationale_messages(
            params,
            integrity=integrity,
            integrity_delta=integrity_delta,
            diagnosis=diagnosis,
        ),
        max_tokens=280,
        temperature=0.35,
        inject_mimi_baseline=False,
        model=DEFAULT_NANA_MODEL,
    )
    if not content:
        return None
    return normalize_rationale(content)
