"""LLM 関連 API ルータ。"""

from __future__ import annotations

import logging

import schemas
from fastapi import APIRouter, Query

from llm.tasks import (
    count_enrich_queue,
    generate_safe_mode_rationale,
    run_enrich_batch,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/llm", tags=["llm"])


@router.get("/enrich-queue", response_model=schemas.EnrichQueueResponse)
def enrich_queue(days: int = Query(7, ge=1, le=90)) -> schemas.EnrichQueueResponse:
    """バッチエンリッチ待ち件数。"""
    return schemas.EnrichQueueResponse(count=count_enrich_queue(days))


@router.post("/enrich-batch", response_model=schemas.EnrichBatchResponse)
async def enrich_batch(
    days: int = Query(7, ge=1, le=90),
) -> schemas.EnrichBatchResponse:
    """キュー済み note を Mimi で一括構造化する（手動トリガー）。"""
    result = await run_enrich_batch(days)
    return schemas.EnrichBatchResponse(
        queued_before=result.queued_before,
        processed=result.processed,
        done=result.done,
        requeued=result.requeued,
    )


@router.post(
    "/safe-mode-rationale",
    response_model=schemas.SafeModeRationaleResponse,
)
async def safe_mode_rationale(
    body: schemas.SafeModeRationaleRequest,
) -> schemas.SafeModeRationaleResponse:
    """Nana: Safe Mode 正当化 + 最初の一手（失敗時 rationale=null）。"""
    p = body.params
    params = {
        "cognitive_load": p.cognitive_load,
        "physical_energy": p.physical_energy,
        "mental_energy": p.mental_energy,
        "autonomy": p.autonomy,
        "entropy": p.entropy,
    }
    try:
        rationale = await generate_safe_mode_rationale(
            params,
            integrity=body.integrity,
            integrity_delta=body.integrity_delta,
            diagnosis=body.diagnosis,
        )
    except Exception:
        logger.exception("safe_mode_rationale failed")
        rationale = None
    return schemas.SafeModeRationaleResponse(rationale=rationale)
