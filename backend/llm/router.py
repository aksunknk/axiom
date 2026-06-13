"""LLM 関連 API ルータ。"""

from __future__ import annotations

import schemas
from fastapi import APIRouter

from llm_client import ping

router = APIRouter(prefix="/api/llm", tags=["llm"])


@router.get("/ping", response_model=schemas.LLMPingResponse)
async def llm_ping() -> schemas.LLMPingResponse:
    """Mimi（LM Studio / Gemma 12B Q4）の疎通確認。"""
    result = await ping()
    return schemas.LLMPingResponse(
        status=result.status,
        model=result.model,
        latency_ms=result.latency_ms,
        detail=result.detail,
    )
