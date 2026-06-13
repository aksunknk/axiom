"""バックグラウンド LLM タスク（結果整合性）。"""

from __future__ import annotations

import json
import logging

import models
from database import SessionLocal
from llm.prompts import enrich_messages, normalize_enrichment, rationale_messages
from llm_client import chat_completion, extract_json_object

logger = logging.getLogger(__name__)

PENDING = {"status": "pending", "data": None}
IDLE_JSON = "{}"


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


async def enrich_log_task(log_id: int, note: str) -> None:
    """COMMIT 後のログ note を構造化して logs.enrichment を更新する。"""
    db = SessionLocal()
    try:
        data = await _enrich_note(note)
        log = db.get(models.Log, log_id)
        if not log:
            return
        if data:
            log.enrichment = json.dumps(
                {"status": "done", "data": data},
                ensure_ascii=False,
            )
            db.commit()
        else:
            # パース不能・推論失敗時は更新をスキップ（pending を idle に戻す）
            log.enrichment = IDLE_JSON
            db.commit()
    except Exception:
        logger.exception("enrich_log_task failed for log_id=%s", log_id)
        try:
            log = db.get(models.Log, log_id)
            if log:
                log.enrichment = IDLE_JSON
                db.commit()
        except Exception:
            db.rollback()
    finally:
        db.close()


async def enrich_event_task(event_id: int, note: str) -> None:
    """nottodo_purge イベントの note を構造化して payload.llm を更新する。"""
    db = SessionLocal()
    try:
        data = await _enrich_note(note)
        event = db.get(models.Event, event_id)
        if not event:
            return
        payload = json.loads(event.payload) if event.payload else {}
        if data:
            payload["llm"] = {"status": "done", "data": data}
        else:
            payload.pop("llm", None)
        event.payload = json.dumps(payload, ensure_ascii=False)
        db.commit()
    except Exception:
        logger.exception("enrich_event_task failed for event_id=%s", event_id)
        try:
            event = db.get(models.Event, event_id)
            if event:
                payload = json.loads(event.payload) if event.payload else {}
                payload.pop("llm", None)
                event.payload = json.dumps(payload, ensure_ascii=False)
                db.commit()
        except Exception:
            db.rollback()
    finally:
        db.close()


async def generate_safe_mode_rationale(params: dict[str, int]) -> str | None:
    """Safe Mode 正当化テキストを生成する。"""
    content = await chat_completion(
        rationale_messages(params),
        max_tokens=200,
        temperature=0.3,
    )
    if not content:
        return None
    line = content.strip().splitlines()[0].strip()
    if not line.startswith("> [RATIONALE]"):
        line = f"> [RATIONALE] {line.lstrip('> ')}"
    return line[:220]
