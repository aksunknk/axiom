"""後方互換 re-export — 新実装は llm_client モジュールを参照。"""

from __future__ import annotations

from llm_client import (
    CHAT_COMPLETIONS_URL,
    DEFAULT_TIMEOUT_SEC,
    LM_STUDIO_BASE,
    chat_completion_sync as chat_completion,
    extract_json_object,
)

__all__ = [
    "LM_STUDIO_BASE",
    "CHAT_COMPLETIONS_URL",
    "DEFAULT_TIMEOUT_SEC",
    "chat_completion",
    "extract_json_object",
]
