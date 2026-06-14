"""LM Studio（OpenAI 互換）非同期通信クライアント — Mimi 推論基盤。"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from dataclasses import dataclass
from typing import Any

import httpx

from llm.mimi_core import MIMI_CORE_SYSTEM, build_system_prompt

logger = logging.getLogger(__name__)

LM_STUDIO_BASE = "http://localhost:1234/v1"
CHAT_COMPLETIONS_URL = f"{LM_STUDIO_BASE}/chat/completions"
MODELS_URL = f"{LM_STUDIO_BASE}/models"

MAX_CONTEXT_LENGTH = 2048
DEFAULT_MAX_TOKENS = 256
MAX_ALLOWED_TOKENS = 1024
DEFAULT_TEMPERATURE = 0.2
DEFAULT_TIMEOUT_SEC = 90.0
INFERENCE_READ_TIMEOUT_SEC = 180.0
INFERENCE_MAX_ATTEMPTS = 2
DEFAULT_MODEL = os.environ.get("LM_STUDIO_MODEL", "google/gemma-4-12b")
DEFAULT_NANA_MODEL = os.environ.get("LM_STUDIO_MODEL_NANA", DEFAULT_MODEL)
CONNECT_TIMEOUT_SEC = 5.0

DEFAULT_HTTP_TIMEOUT = httpx.Timeout(
    connect=CONNECT_TIMEOUT_SEC,
    read=DEFAULT_TIMEOUT_SEC,
    write=10.0,
    pool=5.0,
)


class LLMClientError(Exception):
    """LLM クライアント基底例外。"""


class LLMConnectionError(LLMClientError):
    """LM Studio への接続失敗。"""


class LLMTimeoutError(LLMClientError):
    """リクエストタイムアウト。"""


class LLMResponseError(LLMClientError):
    """応答の解析・検証失敗。"""


@dataclass(frozen=True, slots=True)
class PingResult:
    status: str
    model: str | None = None
    latency_ms: float | None = None
    detail: str | None = None


def clamp_max_tokens(max_tokens: int | None) -> int:
    """VRAM 保護のため max_tokens を安全範囲に制限する。"""
    value = max_tokens if max_tokens is not None else DEFAULT_MAX_TOKENS
    return max(1, min(value, MAX_ALLOWED_TOKENS))


def ensure_mimi_system(messages: list[dict[str, str]]) -> list[dict[str, str]]:
    """system メッセージに Mimi ベースラインが含まれるよう正規化する。"""
    if not messages:
        return [{"role": "system", "content": MIMI_CORE_SYSTEM}]

    normalized = [dict(message) for message in messages]
    system_indices = [
        index for index, message in enumerate(normalized) if message.get("role") == "system"
    ]

    if not system_indices:
        return [{"role": "system", "content": MIMI_CORE_SYSTEM}, *normalized]

    first = system_indices[0]
    content = normalized[first].get("content", "")
    if isinstance(content, str) and MIMI_CORE_SYSTEM not in content:
        normalized[first]["content"] = build_system_prompt(content)
    return normalized


def extract_json_object(text: str) -> dict[str, Any] | None:
    """応答テキストから最初の JSON オブジェクトを抽出する。"""
    start = text.find("{")
    end = text.rfind("}")
    if start < 0 or end <= start:
        return None
    try:
        parsed = json.loads(text[start : end + 1])
    except json.JSONDecodeError:
        return None
    return parsed if isinstance(parsed, dict) else None


def extract_message_text(message: dict[str, Any]) -> str:
    """Gemma 4 等の reasoning モデルは content が空で reasoning_content に出力する場合がある。"""
    content = message.get("content")
    if isinstance(content, str) and content.strip():
        return content.strip()
    reasoning = message.get("reasoning_content")
    if isinstance(reasoning, str) and reasoning.strip():
        return reasoning.strip()
    return ""


class LMStudioClient:
    """httpx ベースの非同期 LM Studio クライアント。"""

    def __init__(
        self,
        *,
        base_url: str = LM_STUDIO_BASE,
        timeout: httpx.Timeout = DEFAULT_HTTP_TIMEOUT,
        default_max_tokens: int = DEFAULT_MAX_TOKENS,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._timeout = timeout
        self._default_max_tokens = default_max_tokens
        self._client: httpx.AsyncClient | None = None

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                base_url=self._base_url,
                timeout=self._timeout,
                headers={"Content-Type": "application/json"},
            )
        return self._client

    async def aclose(self) -> None:
        if self._client is not None and not self._client.is_closed:
            await self._client.aclose()
            self._client = None

    async def chat_completion(
        self,
        messages: list[dict[str, str]],
        *,
        max_tokens: int | None = None,
        temperature: float = DEFAULT_TEMPERATURE,
        inject_mimi_baseline: bool = True,
        model: str | None = None,
    ) -> str:
        """チャット補完を実行する。失敗時は LLMClientError を送出。"""
        payload_messages = ensure_mimi_system(messages) if inject_mimi_baseline else messages
        body = {
            "model": model or DEFAULT_MODEL,
            "messages": payload_messages,
            "temperature": temperature,
            "max_tokens": clamp_max_tokens(max_tokens or self._default_max_tokens),
            "stream": False,
            # Gemma 4 等: 推論トークンを content ではなく reasoning_content に消費するのを抑制
            "reasoning_effort": "none",
        }
        inference_timeout = httpx.Timeout(
            connect=CONNECT_TIMEOUT_SEC,
            read=INFERENCE_READ_TIMEOUT_SEC,
            write=10.0,
            pool=5.0,
        )

        client = await self._get_client()
        last_exc: Exception | None = None
        for attempt in range(1, INFERENCE_MAX_ATTEMPTS + 1):
            try:
                response = await client.post(
                    "/chat/completions",
                    json=body,
                    timeout=inference_timeout,
                )
                response.raise_for_status()
                data = response.json()
                break
            except httpx.TimeoutException as exc:
                last_exc = LLMTimeoutError("LM Studio request timed out")
                logger.warning(
                    "LM Studio chat timeout (attempt %s/%s)",
                    attempt,
                    INFERENCE_MAX_ATTEMPTS,
                )
            except httpx.HTTPError as exc:
                last_exc = LLMConnectionError("LM Studio connection failed")
                logger.warning(
                    "LM Studio chat connection failed (attempt %s/%s): %s",
                    attempt,
                    INFERENCE_MAX_ATTEMPTS,
                    exc,
                )
            except json.JSONDecodeError as exc:
                raise LLMResponseError("LM Studio returned invalid JSON") from exc
            if attempt < INFERENCE_MAX_ATTEMPTS:
                await asyncio.sleep(2.0)
        else:
            assert last_exc is not None
            raise last_exc

        try:
            message = data["choices"][0]["message"]
            text = extract_message_text(message)
        except (KeyError, IndexError, TypeError) as exc:
            raise LLMResponseError(f"LM Studio response malformed: {data!r}") from exc

        if not text:
            raise LLMResponseError("LM Studio returned empty content")
        return text

    async def ping(self) -> PingResult:
        """LM Studio の疎通確認（モデル一覧取得）。"""
        started = time.perf_counter()
        client = await self._get_client()
        try:
            response = await client.get("/models")
            response.raise_for_status()
            data = response.json()
        except httpx.TimeoutException:
            return PingResult(
                status="unavailable",
                detail="timeout",
                latency_ms=round((time.perf_counter() - started) * 1000, 1),
            )
        except httpx.HTTPError as exc:
            return PingResult(
                status="unavailable",
                detail=str(exc),
                latency_ms=round((time.perf_counter() - started) * 1000, 1),
            )
        except json.JSONDecodeError:
            return PingResult(
                status="unavailable",
                detail="invalid_json",
                latency_ms=round((time.perf_counter() - started) * 1000, 1),
            )

        model_name: str | None = None
        models = data.get("data")
        if isinstance(models, list) and models:
            first = models[0]
            if isinstance(first, dict) and isinstance(first.get("id"), str):
                model_name = first["id"]

        return PingResult(
            status="ok",
            model=model_name,
            latency_ms=round((time.perf_counter() - started) * 1000, 1),
        )


_default_client = LMStudioClient()


def get_llm_client() -> LMStudioClient:
    return _default_client


async def chat_completion(
    messages: list[dict[str, str]],
    *,
    max_tokens: int | None = None,
    temperature: float = DEFAULT_TEMPERATURE,
    inject_mimi_baseline: bool = True,
    model: str | None = None,
) -> str | None:
    """非同期チャット補完。失敗時は None（既存タスク互換）。"""
    try:
        return await get_llm_client().chat_completion(
            messages,
            max_tokens=max_tokens,
            temperature=temperature,
            inject_mimi_baseline=inject_mimi_baseline,
            model=model,
        )
    except LLMClientError as exc:
        logger.warning("LM Studio request failed: %s", exc)
        return None


def chat_completion_sync(
    messages: list[dict[str, str]],
    *,
    max_tokens: int | None = None,
    temperature: float = DEFAULT_TEMPERATURE,
    inject_mimi_baseline: bool = True,
) -> str | None:
    """同期ラッパー — BackgroundTasks 等の非 async コンテキスト向け。"""
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(
            chat_completion(
                messages,
                max_tokens=max_tokens,
                temperature=temperature,
                inject_mimi_baseline=inject_mimi_baseline,
            )
        )

    raise RuntimeError(
        "chat_completion_sync cannot run inside an active event loop; use await chat_completion()"
    )


async def ping() -> PingResult:
    return await get_llm_client().ping()
