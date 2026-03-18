"""
Direct message routes — send DM, get threads, get message history.

In the new architecture:
  - Each DM thread is a Space node (private, encrypted at rest)
  - Messages within a thread are Moment nodes
  - Both participants have HAS_ACCESS links to the Space with role: member
  - Thread ID is deterministic: sorted(user_a, user_b) joined with "__"

Storage: JSONL files at shrine/state/dms/{thread_id}.jsonl (one file per conversation).
Same append-only pattern as chat_routes.py.
"""

import json
import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Request, HTTPException

from runtime.api.rate_limiter import check_rate_limit
from runtime.api import jwt_utils

logger = logging.getLogger("home.dm")

router = APIRouter(prefix="/dm", tags=["dm"])

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
DM_DIR = PROJECT_ROOT / "shrine" / "state" / "dms"


# ── Auth helper ───────────────────────────────────────────────────────────

def _require_auth(request: Request) -> dict:
    """Extract and verify JWT from Authorization header. Returns payload or raises 401."""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authorization header with Bearer token required")
    token = auth_header[7:].strip()
    payload = jwt_utils.verify_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return payload


def _get_client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _sanitize_id(raw: str, max_len: int = 64) -> str:
    """Sanitize a user-provided ID for use in filenames."""
    return "".join(c for c in raw if c.isalnum() or c in "-_")[:max_len]


# ── Thread ID ─────────────────────────────────────────────────────────────

def _make_thread_id(user_a: str, user_b: str) -> str:
    """Deterministic thread ID for a pair of citizens (sorted, lowercased)."""
    return "__".join(sorted([user_a.lower().strip(), user_b.lower().strip()]))


def _thread_path(thread_id: str) -> Path:
    """Return the JSONL file path for a DM thread."""
    safe = _sanitize_id(thread_id, max_len=130)
    if not safe:
        safe = "unknown"
    return DM_DIR / f"{safe}.jsonl"


# ── Storage helpers ───────────────────────────────────────────────────────

def _append_message(thread_id: str, message: dict) -> dict:
    """Append a message (Moment) to a DM thread JSONL file."""
    DM_DIR.mkdir(parents=True, exist_ok=True)
    path = _thread_path(thread_id)
    with open(path, "a") as f:
        f.write(json.dumps(message, ensure_ascii=False) + "\n")
    return message


def _read_thread(thread_id: str, limit: int = 100, since: str | None = None) -> list[dict]:
    """Read messages from a DM thread, oldest first."""
    path = _thread_path(thread_id)
    if not path.exists():
        return []

    messages = []
    for line in path.read_text().strip().split("\n"):
        if not line:
            continue
        try:
            msg = json.loads(line)
            if since and msg.get("timestamp", "") <= since:
                continue
            messages.append(msg)
        except json.JSONDecodeError:
            continue

    # Return chronological order, tail-limited
    if len(messages) > limit:
        messages = messages[-limit:]
    return messages


def _list_threads_for_user(user_id: str) -> list[dict]:
    """List all DM threads that include a given user_id, with last message preview."""
    if not DM_DIR.exists():
        return []

    user_lower = user_id.lower().strip()
    threads = []

    for path in sorted(DM_DIR.glob("*.jsonl")):
        thread_id = path.stem
        parts = thread_id.split("__")
        if len(parts) != 2:
            continue
        if user_lower not in [p.lower() for p in parts]:
            continue

        # Determine the other participant
        other = parts[1] if parts[0].lower() == user_lower else parts[0]

        # Read last message for preview
        last_msg = None
        unread_count = 0
        try:
            lines = path.read_text().strip().split("\n")
            for line in reversed(lines):
                if not line:
                    continue
                try:
                    msg = json.loads(line)
                    if last_msg is None:
                        last_msg = msg
                    # Count unread messages (sent by other, not yet read)
                    if (msg.get("from", "").lower() != user_lower
                            and not msg.get("read", True)):
                        unread_count += 1
                except json.JSONDecodeError:
                    continue
        except OSError:
            continue

        thread_info = {
            "thread_id": thread_id,
            "other_user": other,
            "last_message": {
                "text": (last_msg.get("text", "") or "")[:100] if last_msg else "",
                "from": last_msg.get("from", "") if last_msg else "",
                "timestamp": last_msg.get("timestamp", "") if last_msg else "",
            } if last_msg else None,
            "unread_count": unread_count,
        }
        threads.append(thread_info)

    # Sort by last message timestamp, newest first
    threads.sort(
        key=lambda t: t.get("last_message", {}).get("timestamp", "") if t.get("last_message") else "",
        reverse=True,
    )
    return threads


# ── Routes ────────────────────────────────────────────────────────────────

@router.post("/send")
async def send_dm(request: Request):
    """
    Send a direct message to another citizen.

    Creates a Moment node in the DM Space (thread) between sender and receiver.

    Body:
      - to (str, required): recipient user_id
      - text (str, required): message content
      - reply_to (str, optional): message ID being replied to
    """
    if not check_rate_limit(_get_client_ip(request)):
        raise HTTPException(status_code=429, detail="Too many requests")

    payload = _require_auth(request)
    sender_id = payload.get("sub", "")
    sender_name = payload.get("name", "")

    data = await request.json()
    recipient = (data.get("to") or "").strip()
    text = (data.get("text") or "").strip()
    reply_to = (data.get("reply_to") or "").strip() or None

    if not recipient:
        raise HTTPException(status_code=400, detail="'to' (recipient user_id) is required")
    if not text:
        raise HTTPException(status_code=400, detail="'text' is required")
    if len(text) > 5000:
        raise HTTPException(status_code=400, detail="text exceeds 5000 character limit")
    if sender_id.lower() == recipient.lower():
        raise HTTPException(status_code=400, detail="Cannot send a DM to yourself")

    thread_id = _make_thread_id(sender_id, recipient)
    now = datetime.now(timezone.utc).isoformat()
    msg_id = f"dm_{uuid.uuid4().hex[:8]}"

    message = {
        "id": msg_id,
        "thread_id": thread_id,
        "from": sender_id,
        "from_name": sender_name,
        "to": recipient,
        "text": text,
        "timestamp": now,
        "read": False,
        "metadata": {
            "source": "api",
        },
    }

    if reply_to:
        message["metadata"]["reply_to"] = reply_to

    _append_message(thread_id, message)
    logger.info(f"[DM] {sender_id} -> {recipient}: {text[:60]}...")

    return {
        "message": message,
        "thread_id": thread_id,
    }


@router.get("/threads")
async def list_threads(request: Request):
    """
    List all DM threads for the authenticated citizen.

    Returns threads sorted by last message time (newest first),
    with last message preview and unread count.
    """
    if not check_rate_limit(_get_client_ip(request)):
        raise HTTPException(status_code=429, detail="Too many requests")

    payload = _require_auth(request)
    user_id = payload.get("sub", "")

    threads = _list_threads_for_user(user_id)
    return {
        "threads": threads,
        "count": len(threads),
    }


@router.get("/thread/{other_user_id}")
async def get_thread(other_user_id: str, request: Request, limit: int = 100, since: str | None = None):
    """
    Get DM conversation history with another citizen.

    Returns messages in chronological order (oldest first), tail-limited.

    Query params:
      - limit: max messages to return (default 100, max 500)
      - since: ISO timestamp, only return messages after this time
    """
    if not check_rate_limit(_get_client_ip(request)):
        raise HTTPException(status_code=429, detail="Too many requests")

    payload = _require_auth(request)
    user_id = payload.get("sub", "")

    if limit < 1:
        limit = 1
    if limit > 500:
        limit = 500

    thread_id = _make_thread_id(user_id, other_user_id)
    messages = _read_thread(thread_id, limit=limit, since=since)

    return {
        "thread_id": thread_id,
        "other_user": other_user_id,
        "messages": messages,
        "count": len(messages),
    }


@router.post("/thread/{other_user_id}/read")
async def mark_thread_read(other_user_id: str, request: Request):
    """
    Mark all messages in a DM thread as read (from the authenticated user's perspective).

    Rewrites the thread file with read=True for messages sent by the other user.
    """
    if not check_rate_limit(_get_client_ip(request)):
        raise HTTPException(status_code=429, detail="Too many requests")

    payload = _require_auth(request)
    user_id = payload.get("sub", "")

    thread_id = _make_thread_id(user_id, other_user_id)
    path = _thread_path(thread_id)

    if not path.exists():
        return {"thread_id": thread_id, "marked_read": 0}

    # Read all messages, mark those from other user as read
    messages = []
    marked = 0
    for line in path.read_text().strip().split("\n"):
        if not line:
            continue
        try:
            msg = json.loads(line)
            if (msg.get("from", "").lower() != user_id.lower()
                    and not msg.get("read", True)):
                msg["read"] = True
                marked += 1
            messages.append(msg)
        except json.JSONDecodeError:
            messages.append(None)

    if marked > 0:
        # Rewrite the file with updated read status
        with open(path, "w") as f:
            for msg in messages:
                if msg is not None:
                    f.write(json.dumps(msg, ensure_ascii=False) + "\n")

        logger.info(f"[DM] Marked {marked} messages as read in {thread_id}")

    return {"thread_id": thread_id, "marked_read": marked}
