"""WhatsApp Bridge — webhook-based via WAHA.

Receives inbound messages from WAHA webhooks, routes to orchestrator queue.
Sends replies via WAHA REST API.

Architecture:
  Inbound:  WAHA webhook → process_webhook() → message_queue.enqueue()
  Outbound: send_reply() → WAHA REST API → WhatsApp

Wired into home_server.py as a FastAPI router.
"""

import json
import logging
import os
import time
from datetime import datetime
from pathlib import Path
from typing import Optional, Callable

import requests

from runtime.bridges.rate_limiter import check_rate_limit

logger = logging.getLogger("bridge.whatsapp")

# ── Paths ────────────────────────────────────────────────────────────────────

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
STATE_DIR = PROJECT_ROOT / "shrine" / "state"
MESSAGES_FILE = STATE_DIR / "whatsapp_messages.jsonl"
USERS_FILE = STATE_DIR / "whatsapp_users.jsonl"
LID_CACHE_FILE = STATE_DIR / "whatsapp_lid_cache.json"

STATE_DIR.mkdir(parents=True, exist_ok=True)

# ── Config ───────────────────────────────────────────────────────────────────

WAHA_URL = os.environ.get("WAHA_URL", "http://localhost:3001")
WAHA_SESSION = os.environ.get("WAHA_SESSION", "default")
WAHA_API_KEY = os.environ.get("WAHA_API_KEY", "")
OWNER_PHONE = os.environ.get("OWNER_WHATSAPP_PHONE", "")

# Enqueue function — set by init
_enqueue_fn: Optional[Callable] = None

# Webhook dedup — prevents processing same message twice
_seen_message_ids: dict[str, float] = {}


# ── WAHA API ─────────────────────────────────────────────────────────────────

def _waha_headers() -> dict:
    """Build WAHA API headers."""
    headers = {"Content-Type": "application/json"}
    if WAHA_API_KEY:
        headers["Authorization"] = f"Bearer {WAHA_API_KEY}"
    return headers


def send_message(chat_id: str, text: str) -> dict | None:
    """Send a text message via WAHA."""
    if not WAHA_URL:
        logger.error("WAHA_URL not configured")
        return None

    try:
        resp = requests.post(
            f"{WAHA_URL}/api/sendText",
            headers=_waha_headers(),
            json={
                "session": WAHA_SESSION,
                "chatId": chat_id,
                "text": text,
            },
            timeout=15,
        )
        if resp.status_code == 200:
            _log_message(chat_id, text, "outbound")
            return resp.json()
        else:
            logger.warning(f"WAHA sendText failed {resp.status_code}: {resp.text[:200]}")
            return None
    except Exception as e:
        logger.error(f"WAHA send error: {e}")
        return None


def send_reply(text: str, chat_id: str, voice: bool = False,
               voice_text: str = "") -> dict | None:
    """Send reply to WhatsApp user."""
    return send_message(chat_id, text)


# ── LID Resolution ───────────────────────────────────────────────────────────

def _load_lid_cache() -> dict:
    """Load LID → phone number cache."""
    try:
        if LID_CACHE_FILE.exists():
            return json.loads(LID_CACHE_FILE.read_text())
    except (json.JSONDecodeError, OSError):
        pass
    return {}


def _save_lid_cache(cache: dict):
    """Save LID → phone number cache."""
    try:
        LID_CACHE_FILE.write_text(json.dumps(cache, indent=2))
    except OSError:
        pass


def _resolve_lid(lid: str) -> Optional[str]:
    """Resolve a WhatsApp LID to a phone number from cache."""
    cache = _load_lid_cache()
    return cache.get(lid)


def _cache_lid(lid: str, phone: str):
    """Cache a LID → phone mapping."""
    if not lid or not phone:
        return
    cache = _load_lid_cache()
    if cache.get(lid) != phone:
        cache[lid] = phone
        _save_lid_cache(cache)


# ── Webhook Processing ───────────────────────────────────────────────────────

def process_webhook(payload: dict) -> bool:
    """Process a WAHA webhook payload. Returns True if handled.

    Only handles 'message' events (not 'message.any' to avoid duplication).
    """
    event = payload.get("event")

    # Only process 'message' events
    if event != "message":
        return False

    message = payload.get("payload", {})
    if not message:
        return False

    # Dedup — skip if we've seen this message_id recently
    msg_id = message.get("id", "")
    if msg_id:
        now = time.time()
        if msg_id in _seen_message_ids:
            return False
        _seen_message_ids[msg_id] = now
        # Cleanup old entries (>5 min)
        expired = [k for k, v in _seen_message_ids.items() if now - v > 300]
        for k in expired:
            del _seen_message_ids[k]

    # Skip outgoing messages (from bot itself)
    if message.get("fromMe", False):
        return False

    # Extract sender info
    chat_id = message.get("from", "")
    sender_name = message.get("_data", {}).get("notifyName", "")
    is_group = "@g.us" in chat_id

    # Extract text
    text = message.get("body", "").strip()
    if not text:
        return False

    # Rate limiting
    rate_reason = check_rate_limit(chat_id, text)
    if rate_reason:
        logger.info(f"Rate limited WhatsApp {chat_id}: {rate_reason}")
        return False

    # Log inbound
    _log_message(chat_id, text)

    # Route to orchestrator
    if _enqueue_fn:
        content = text
        if is_group:
            content = f"[whatsapp-group] {content}"

        _enqueue_fn({
            "voice_text": content,
            "mode": "partner",
            "source": "whatsapp",
            "sender": sender_name or chat_id,
            "sender_id": chat_id,
            "metadata": {
                "chat_id": chat_id,
                "is_group": is_group,
                "platform": "whatsapp",
                "reply_chat_id": chat_id,
            },
        })
        return True

    return False


# ── Message Logging ──────────────────────────────────────────────────────────

def _log_message(chat_id: str, text: str, direction: str = "inbound"):
    """Append message to audit log."""
    entry = {
        "chat_id": chat_id,
        "text": text[:500] if text else "",
        "direction": direction,
        "timestamp": datetime.now().isoformat(),
    }
    try:
        with open(MESSAGES_FILE, "a") as f:
            f.write(json.dumps(entry) + "\n")
    except OSError:
        pass


# ── FastAPI Router ───────────────────────────────────────────────────────────

from fastapi import APIRouter, Request

router = APIRouter(prefix="/whatsapp", tags=["whatsapp"])


@router.post("/webhook")
async def webhook(request: Request):
    """Receive WAHA webhook events."""
    try:
        payload = await request.json()
    except Exception:
        return {"status": "error", "detail": "invalid json"}

    handled = process_webhook(payload)
    return {"status": "processed" if handled else "skipped"}


@router.get("/health")
async def whatsapp_health():
    """Check WAHA connection."""
    if not WAHA_URL:
        return {"status": "disabled", "detail": "WAHA_URL not configured"}

    try:
        resp = requests.get(
            f"{WAHA_URL}/api/sessions/{WAHA_SESSION}",
            headers=_waha_headers(),
            timeout=5,
        )
        if resp.status_code == 200:
            data = resp.json()
            return {
                "status": "connected",
                "session": WAHA_SESSION,
                "state": data.get("status", "unknown"),
            }
    except Exception as e:
        return {"status": "error", "detail": str(e)}

    return {"status": "disconnected"}


# ── Lifecycle ────────────────────────────────────────────────────────────────

def init(enqueue_fn: Optional[Callable] = None):
    """Initialize WhatsApp bridge (webhook-based, no polling thread needed)."""
    global _enqueue_fn
    _enqueue_fn = enqueue_fn
    logger.info("WhatsApp bridge initialized (webhook mode)")
