"""Message queue — priority-based request buffer.

Incoming messages from bridges (Telegram, WhatsApp, etc.) and internal sources
are appended to a JSONL file. The dispatcher pops the highest-priority item.

Priority = trust_tier_boost + mode_priority + urgency_boost + recency_boost

Priority-based request buffer for incoming bridge and internal messages.
"""

import json
import time
import logging
from datetime import datetime
from pathlib import Path
from typing import Optional

logger = logging.getLogger("orchestrator.queue")

# ── Constants ───────────────────────────────────────────────────────────────

MODE_PRIORITY = {
    "architect": 10,
    "critic": 9,
    "partner": 8,
    "researcher": 7,
    "builder": 6,
    "social": 5,
    "autonomy": 4,
    "lifeline": 3,
}

HOTKEY_MODES = {
    "F8": "architect",
    "F12": "critic",
    "RELAUNCH": "partner",
}

TRUST_PRIORITY_BOOST = {
    "owner": 50,
    "high": 30,
    "medium": 15,
    "low": 5,
    "stranger": 0,
}

URGENT_KEYWORDS = [
    "urgent", "emergency", "critical", "asap", "help",
    "broken", "down", "crash", "fix",
]

# ── Queue operations ────────────────────────────────────────────────────────

_queue_file: Optional[Path] = None


def set_queue_file(path: Path):
    """Set the queue file path."""
    global _queue_file
    _queue_file = path


def get_queue_file() -> Path:
    """Return the queue file path."""
    if _queue_file:
        return _queue_file
    # Default: shrine/state/message_queue.jsonl relative to project root
    return Path(__file__).resolve().parent.parent.parent / "shrine" / "state" / "message_queue.jsonl"


def read_queue() -> list[dict]:
    """Read all items from the message queue."""
    qf = get_queue_file()
    if not qf.exists():
        return []
    try:
        lines = qf.read_text().strip().split("\n")
        items = []
        for line in lines:
            if line.strip():
                try:
                    items.append(json.loads(line))
                except json.JSONDecodeError:
                    pass
        return items
    except IOError:
        return []


def enqueue(item: dict):
    """Append an item to the message queue."""
    qf = get_queue_file()
    qf.parent.mkdir(parents=True, exist_ok=True)
    with open(qf, "a") as f:
        f.write(json.dumps(item) + "\n")


def dedupe_queue(items: list[dict]) -> list[dict]:
    """Remove duplicate items based on voice_text hash."""
    seen = set()
    unique = []
    for item in items:
        voice = item.get("voice_text", "")[:100]
        key = hash(voice)
        if key not in seen:
            seen.add(key)
            unique.append(item)
    return unique


def calculate_priority(item: dict, get_user_trust=None) -> int:
    """Calculate priority score for a queue item.

    Trust tier > recency > mode. get_user_trust is an optional callback
    that takes a user_id and returns a trust tier string.
    """
    hotkey = item.get("hotkey", "")
    mode = HOTKEY_MODES.get(hotkey, item.get("mode", "partner"))
    base_priority = MODE_PRIORITY.get(mode, 3)

    # Trust-tier boost
    sender_id = item.get("sender_id") or item.get("chat_id", "")
    source = item.get("source", "")
    if source in ("hotkey", "claude-code", "lifeline", "task", "relaunch", ""):
        trust_boost = TRUST_PRIORITY_BOOST["owner"]
    elif sender_id and get_user_trust:
        trust = get_user_trust(str(sender_id))
        trust_boost = TRUST_PRIORITY_BOOST.get(trust, 0)
    else:
        trust_boost = 0

    # Urgency boost
    text = (item.get("voice_text", "") or "").lower()
    urgent_boost = sum(2 for kw in URGENT_KEYWORDS if kw in text)

    # Recency boost
    recency_boost = 0
    try:
        ts = item.get("timestamp", "")
        if ts:
            age_seconds = (datetime.now() - datetime.fromisoformat(ts)).total_seconds()
            if age_seconds < 10:
                recency_boost = 20
            elif age_seconds < 30:
                recency_boost = 15
            elif age_seconds < 60:
                recency_boost = 10
            elif age_seconds < 300:
                recency_boost = 5
    except (ValueError, TypeError):
        pass

    return base_priority + trust_boost + urgent_boost + recency_boost


def sort_by_priority(items: list[dict], get_user_trust=None) -> list[dict]:
    """Sort queue items by priority (highest first)."""
    return sorted(items, key=lambda i: calculate_priority(i, get_user_trust), reverse=True)


def pop_queue_item(get_user_trust=None) -> Optional[dict]:
    """Atomically pop highest priority item from the queue."""
    items = read_queue()
    if not items:
        return None

    items = dedupe_queue(items)
    items = sort_by_priority(items, get_user_trust)

    item = items[0]
    remaining = items[1:]

    qf = get_queue_file()
    if remaining:
        lines = [json.dumps(i) for i in remaining]
        qf.write_text("\n".join(lines) + "\n")
    else:
        if qf.exists():
            qf.unlink()

    priority = calculate_priority(item, get_user_trust)
    hotkey = item.get("hotkey", "")
    mode = HOTKEY_MODES.get(hotkey, item.get("mode", "partner"))
    logger.debug(f"Popped {mode} request (priority: {priority}, remaining: {len(remaining)})")

    return item


def queue_size() -> int:
    """Return number of items in the queue without loading them all."""
    qf = get_queue_file()
    if not qf.exists():
        return 0
    try:
        return sum(1 for line in qf.read_text().strip().split("\n") if line.strip())
    except IOError:
        return 0
