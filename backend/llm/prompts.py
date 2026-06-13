"""Mimi / Nana 用システムプロンプト。"""

from __future__ import annotations

from typing import Any

from llm.mimi_core import build_system_prompt

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


RATIONALE_TASK = """You are Nana, Safe Mode rationale generator for AXIOM.
Write ONE terminal-style line in Japanese (~120-150 characters) that logically justifies activating Graceful Degradation (Safe Mode).

Rules:
- Prefix with "> [RATIONALE] "
- Reference ONLY the provided metric values; do NOT calculate or invent scores
- Tone: objective, machine terminal, no emotional language
- Explain why rest/degraded mode is logically justified now
- Output the single line only, no JSON"""

RATIONALE_SYSTEM = build_system_prompt(RATIONALE_TASK)


def rationale_messages(params: dict[str, int]) -> list[dict[str, str]]:
    user = (
        "Current metrics (0-100):\n"
        f"AUT={params['autonomy']}, ENT={params['entropy']}, "
        f"COG={params['cognitive_load']}, PHY={params['physical_energy']}, "
        f"MEN={params['mental_energy']}"
    )
    return [
        {"role": "system", "content": RATIONALE_SYSTEM},
        {"role": "user", "content": user},
    ]


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
