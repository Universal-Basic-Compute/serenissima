"""Ollama-backed citizen mind: pick ONE action from a legal menu.

*Venice*: the citizen closes their eyes for a heartbeat, hears the herald's
list, and answers with a single choice and a single sentence of why.
Substrate: POST /api/chat on a local Ollama (qwen3-vl:2b-instruct, 2B params),
strict-JSON answer {"choice": <n>, "why": "..."}; one retry on invalid output;
documented fallback to the menu's "rest" entry, logged loudly. Network errors
propagate — no silent fallback for a broken bridge.
"""
from __future__ import annotations

import json
import logging

import requests

from backend.physics.engine_contracts_and_types import CitizenState, Intention

logger = logging.getLogger(__name__)

OLLAMA_CHAT_URL = "http://localhost:11434/api/chat"
MODEL_NAME = "qwen3-vl:2b-instruct"
REQUEST_TIMEOUT_SECONDS = 30
KEEP_ALIVE = "10m"  # keep the 2B model warm between citizen thoughts
FALLBACK_WHY = "Je reste où je suis, l'esprit embrumé."


def preload_model(timeout_seconds: int = 120) -> None:
    """Load the 2B model into memory before the first decide() call.

    *Venice*: the citizen takes a long breath before the day's first thought.
    Substrate: an /api/chat call with empty messages is Ollama's documented
    model-preload; cold loads can take ~30 s (VRAM contention with other
    local models), which would otherwise eat decide()'s whole 30 s budget.
    Raises on failure — a broken bridge must scream, not whisper.
    """
    response = requests.post(
        OLLAMA_CHAT_URL,
        json={"model": MODEL_NAME, "messages": [], "keep_alive": KEEP_ALIVE},
        timeout=timeout_seconds,
    )
    response.raise_for_status()


def _build_system_prompt(citizen: CitizenState, persona: dict) -> str:
    """Short system prompt — the model is only 2B, brevity wins."""
    return (
        f"Tu es {persona['name']}, {persona['social_class']} de Venise. "
        f"Personnalité: {persona['personality']} "
        f"Faim: {citizen.hunger}/24 (12+ = affamé). Ducats: {citizen.ducats}. "
        "Tu choisis UNE action dans la liste, celle qui colle le mieux "
        "à ta personnalité et à tes besoins. "
        'Réponds UNIQUEMENT en JSON strict: {"choice": <numéro>, '
        '"why": "<une phrase à la première personne, dans ton caractère>"}'
    )


def _build_menu_prompt(menu: list[dict]) -> str:
    lines = ["Tes actions possibles:"]
    for i, entry in enumerate(menu, start=1):
        lines.append(f"{i}. {entry.get('label', entry['action'])}")
    lines.append('Ton choix (JSON strict {"choice": <numéro>, "why": "..."}):')
    return "\n".join(lines)


def _call_ollama(messages: list[dict]) -> str:
    """One chat round-trip. Raises on HTTP/network failure (fail loud)."""
    response = requests.post(
        OLLAMA_CHAT_URL,
        json={
            "model": MODEL_NAME,
            "messages": messages,
            "stream": False,
            "format": "json",
            "keep_alive": KEEP_ALIVE,
            "options": {"temperature": 0.8},
        },
        timeout=REQUEST_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    return response.json()["message"]["content"]


def _parse_answer(raw: str, menu_size: int) -> tuple[int, str] | tuple[None, str]:
    """Parse the model's JSON answer.

    Returns (choice_index_1_based, why) on success, (None, error_message)
    on failure — the error message is fed back to the model on retry.
    """
    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, TypeError) as exc:
        return None, f"JSON invalide ({exc})"
    if not isinstance(data, dict):
        return None, "la réponse doit être un objet JSON"
    choice = data.get("choice")
    if isinstance(choice, str) and choice.strip().isdigit():
        choice = int(choice.strip())
    if not isinstance(choice, int) or isinstance(choice, bool):
        return None, '"choice" doit être un numéro entier'
    if not 1 <= choice <= menu_size:
        return None, f'"choice" doit être entre 1 et {menu_size}'
    why = data.get("why")
    if not isinstance(why, str) or not why.strip():
        return None, '"why" doit être une phrase non vide'
    return choice, why.strip()


def decide(citizen: CitizenState, menu: list[dict], persona: dict) -> Intention:
    """Ask the local model to pick exactly one menu entry.

    *Venice*: a thought forms in the fog — sometimes clear, sometimes the
    citizen just stays put, mind clouded.
    Substrate: one retry with the parse error appended; then the documented
    rest fallback with an error log. The returned action IS a menu entry —
    the mind can never step outside the herald's scroll.
    """
    if not menu:
        raise ValueError(f"Empty menu for citizen {citizen.username!r}")

    messages = [
        {"role": "system", "content": _build_system_prompt(citizen, persona)},
        {"role": "user", "content": _build_menu_prompt(menu)},
    ]

    last_error = ""
    for attempt in (1, 2):
        raw = _call_ollama(messages)
        choice, why_or_error = _parse_answer(raw, len(menu))
        if choice is not None:
            return Intention(citizen=citizen.username, action=menu[choice - 1], why=why_or_error)
        last_error = why_or_error
        logger.warning(
            "Citizen %s: invalid mind answer on attempt %d: %s — raw=%r",
            citizen.username, attempt, last_error, raw,
        )
        messages.append({"role": "assistant", "content": raw})
        messages.append({
            "role": "user",
            "content": (
                f"Réponse invalide: {last_error}. Réponds UNIQUEMENT en JSON strict "
                f'{{"choice": <numéro entre 1 et {len(menu)}>, "why": "<une phrase>"}}.'
            ),
        })

    logger.error(
        "Citizen %s: mind failed twice (%s) — falling back to rest.",
        citizen.username, last_error,
    )
    rest_entry = next((e for e in menu if e.get("action") == "rest"), {"action": "rest"})
    return Intention(citizen=citizen.username, action=rest_entry, why=FALLBACK_WHY)
