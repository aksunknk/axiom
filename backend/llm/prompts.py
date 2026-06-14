"""Mimi / Nana 用システムプロンプト。"""

from __future__ import annotations

import json
from typing import Any

from llm.mimi_core import build_system_prompt
from llm.nana_core import build_nana_system_prompt

ENRICH_TASK = """You are Mimi, a causal log enricher for AXIOM (a personal system monitor).
Parse the user's action note into structured JSON ONLY. No markdown, no explanation, no extra text.

Output exactly this schema:
{"trigger":"brief action summary","category":"CATEGORY","impact":["MEN+","COG-"]}

Rules:
- trigger: concise phrase (Japanese or English matching input)
- category: ONE of SLEEP, TASK, RECOVERY, STRESS, MEDICATION, EXERCISE, SOCIAL, WORK, DISTRACTION, PURGE, NUTRITION, OTHER (uppercase)
- impact: array of tokens from AUT+, AUT-, ENT+, ENT-, COG+, COG-, PHY+, PHY-, MEN+, MEN-
- use empty impact [] if uncertain
- do NOT invent metrics or scores
- do NOT use chain-of-thought; output the JSON object directly as the entire response"""

ENRICH_SYSTEM = build_system_prompt(ENRICH_TASK)


def enrich_messages(note: str) -> list[dict[str, str]]:
    return [
        {"role": "system", "content": ENRICH_SYSTEM},
        {"role": "user", "content": note},
    ]


RATIONALE_TASK = """You are Nana, Safe Mode advisor for AXIOM (Graceful Degradation).
The user message is JSON with: metrics (0-100), integrity, session_delta, diagnosis.

Output exactly TWO lines in Japanese (terminal style). No markdown, no extra text.

Line 1 — logical justification (~100-140 characters):
> [RATIONALE] ...

Line 2 — one concrete physical first step (~40-70 characters):
> [ACTION] ...

Rules for Line 1:
- Reference ONLY values in the JSON; do NOT calculate or invent scores
- Explain why Safe Mode (non-linear debuff removal) makes rest logically justified, not a failure
- Warm, concise tone; light humor ok; no social pleasantries or emotional fluff
- Use diagnosis field if it sharpens the point

Rules for Line 2:
- ONE immediate, low-cost physical action (sit, breathe, close eyes, drink water, etc.)
- No abstract advice ("take care of yourself") — must be executable in under 2 minutes"""

RATIONALE_SYSTEM = build_nana_system_prompt(RATIONALE_TASK)


def rationale_messages(
    params: dict[str, int],
    *,
    integrity: int | None = None,
    integrity_delta: int | None = None,
    diagnosis: str | None = None,
) -> list[dict[str, str]]:
    payload: dict[str, Any] = {
        "metrics": {
            "COG": params["cognitive_load"],
            "PHY": params["physical_energy"],
            "MEN": params["mental_energy"],
            "AUT": params["autonomy"],
            "ENT": params["entropy"],
        },
        "safe_mode": True,
    }
    if integrity is not None:
        payload["integrity"] = integrity
    if integrity_delta is not None:
        payload["session_delta"] = integrity_delta
    if diagnosis:
        payload["diagnosis"] = diagnosis.strip()[:200]

    return [
        {"role": "system", "content": RATIONALE_SYSTEM},
        {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
    ]


def normalize_rationale(text: str) -> str | None:
    """Nana 応答を RATIONALE + ACTION の2行に正規化する。"""
    lines = [line.strip() for line in text.strip().splitlines() if line.strip()]
    if not lines:
        return None

    rationale: str | None = None
    action: str | None = None

    for line in lines:
        upper = line.upper()
        if "[RATIONALE]" in upper:
            rationale = line
        elif "[ACTION]" in upper:
            action = line

    if rationale is None:
        rationale = lines[0]
    if not rationale.upper().startswith("> [RATIONALE]"):
        rationale = f"> [RATIONALE] {rationale.lstrip('> ')}"

    if action is None and len(lines) > 1:
        action = lines[1]
    if action and not action.upper().startswith("> [ACTION]"):
        action = f"> [ACTION] {action.lstrip('> ')}"

    rationale = rationale[:220]
    if action:
        return f"{rationale}\n{action[:120]}"
    return rationale


VALID_IMPACT = frozenset(
    {
        "AUT+",
        "AUT-",
        "ENT+",
        "ENT-",
        "COG+",
        "COG-",
        "PHY+",
        "PHY-",
        "MEN+",
        "MEN-",
    }
)

VALID_CATEGORIES = frozenset(
    {
        "SLEEP",
        "TASK",
        "RECOVERY",
        "STRESS",
        "MEDICATION",
        "EXERCISE",
        "SOCIAL",
        "WORK",
        "DISTRACTION",
        "PURGE",
        "NUTRITION",
        "OTHER",
    }
)


def normalize_enrichment(raw: dict[str, Any]) -> dict[str, Any] | None:
    """LLM出力を検証・正規化する。"""
    trigger = raw.get("trigger")
    category = raw.get("category")
    impact = raw.get("impact")

    if not isinstance(trigger, str) or not trigger.strip():
        return None
    if not isinstance(category, str) or not category.strip():
        return None

    cat = category.strip().upper().replace(" ", "_")
    if cat not in VALID_CATEGORIES:
        cat = "OTHER"

    impacts: list[str] = []
    if isinstance(impact, list):
        for item in impact:
            if isinstance(item, str) and item.upper() in VALID_IMPACT:
                impacts.append(item.upper())

    return {
        "trigger": trigger.strip()[:120],
        "category": cat,
        "impact": impacts,
    }
