"""Telegram Bridge — polling bot with citizen routing.

Core Telegram bridge functionality for bot interaction and message routing.
Polls Telegram getUpdates, processes messages, routes to orchestrator queue.

Architecture:
  Inbound:  getUpdates polling → process_update() → message_queue.enqueue()
  Outbound: send_reply() → Telegram sendMessage/sendVoice API

Runs as a background thread inside the citizen home server.
"""

import json
import logging
import os
import re
import subprocess
import tempfile
import threading
import time
from datetime import datetime
from pathlib import Path
from typing import Optional, Callable

import requests

from runtime.bridges.rate_limiter import check_rate_limit, set_bypass_ids

logger = logging.getLogger("bridge.telegram")

# ── Paths ────────────────────────────────────────────────────────────────────

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
STATE_DIR = PROJECT_ROOT / "shrine" / "state"
CITIZENS_DIR = PROJECT_ROOT / "citizens"
MESSAGES_FILE = STATE_DIR / "telegram_messages.jsonl"
OFFSET_FILE = STATE_DIR / "telegram_offset.txt"
USERS_FILE = STATE_DIR / "telegram_users.jsonl"
VOICE_TMP_DIR = Path(tempfile.gettempdir()) / "mind_telegram_voice"

STATE_DIR.mkdir(parents=True, exist_ok=True)
VOICE_TMP_DIR.mkdir(exist_ok=True)

# ── Config (from env) ────────────────────────────────────────────────────────

BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
CHANNEL_ID = os.environ.get("TELEGRAM_CHANNEL_ID", "")
NICOLAS_CHAT_ID = os.environ.get("NICOLAS_CHAT_ID", "1864364329")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
ELEVENLABS_API_KEY = os.environ.get("ELEVENLABS_API_KEY", "")
ELEVENLABS_VOICE_ID = os.environ.get("ELEVENLABS_VOICE_ID", "oPo4t55LBdLAECiAx1JD")

# Known chat IDs that bypass rate limiting
KNOWN_CHAT_IDS: set[str] = set()

# Groups where bot processes ALL messages (not just @mentions)
ACTIVE_GROUPS: set[str] = set()

# Enqueue function — set by start() to connect to orchestrator
_enqueue_fn: Optional[Callable] = None

# ── Telegram API ─────────────────────────────────────────────────────────────

API_BASE = "https://api.telegram.org/bot"


def _api(method: str, **kwargs) -> dict | None:
    """Call Telegram Bot API. Returns response or None on error."""
    if not BOT_TOKEN:
        logger.error("TELEGRAM_BOT_TOKEN not set")
        return None
    try:
        url = f"{API_BASE}{BOT_TOKEN}/{method}"
        resp = requests.post(url, timeout=30, **kwargs)
        data = resp.json()
        if not data.get("ok"):
            logger.warning(f"TG API {method} failed: {data.get('description', 'unknown')}")
            return None
        return data.get("result")
    except Exception as e:
        logger.error(f"TG API {method} error: {e}")
        return None


def _api_get(method: str, **params) -> dict | None:
    """GET Telegram Bot API."""
    if not BOT_TOKEN:
        return None
    try:
        url = f"{API_BASE}{BOT_TOKEN}/{method}"
        resp = requests.get(url, params=params, timeout=60)
        data = resp.json()
        if not data.get("ok"):
            logger.warning(f"TG API {method} failed: {data.get('description', 'unknown')}")
            return None
        return data.get("result")
    except Exception as e:
        logger.error(f"TG API {method} error: {e}")
        return None


# ── Sending ──────────────────────────────────────────────────────────────────

def send_typing(chat_id: str):
    """Send typing indicator."""
    _api("sendChatAction", json={"chat_id": chat_id, "action": "typing"})


def send_message(text: str, chat_id: str = "", parse_mode: str = "Markdown",
                 message_thread_id: Optional[int] = None) -> dict | None:
    """Send a text message. Falls back to no parse_mode on formatting error."""
    target = chat_id or CHANNEL_ID
    if not target:
        logger.warning("No chat_id or channel configured")
        return None

    # Truncate long messages
    if len(text) > 4096:
        text = text[:4090] + "\n..."

    payload = {"chat_id": target, "text": text}
    if parse_mode:
        payload["parse_mode"] = parse_mode
    if message_thread_id:
        payload["message_thread_id"] = message_thread_id

    result = _api("sendMessage", json=payload)

    # Retry without parse_mode if Markdown failed
    if result is None and parse_mode:
        payload.pop("parse_mode", None)
        result = _api("sendMessage", json=payload)

    # Log message
    _log_message(target, text, "outbound")

    return result


def send_reply(text: str, chat_id: str, voice: bool = False,
               voice_text: str = "") -> dict | None:
    """Send reply with optional voice note.

    text: full text response (detailed)
    voice_text: shorter natural text for TTS (if different from text)
    """
    # Send text
    result = send_message(text, chat_id)

    # Send voice if requested
    if voice and (ELEVENLABS_API_KEY or OPENAI_API_KEY):
        tts_text = voice_text or text
        voice_path = _generate_voice_note(tts_text)
        if voice_path:
            _send_voice_file(chat_id, voice_path)
            try:
                voice_path.unlink()
            except OSError:
                pass

    return result


def send_voice(chat_id: str, text: str) -> dict | None:
    """Generate and send a voice note."""
    voice_path = _generate_voice_note(text)
    if not voice_path:
        return None
    result = _send_voice_file(chat_id, voice_path)
    try:
        voice_path.unlink()
    except OSError:
        pass
    return result


def _send_voice_file(chat_id: str, ogg_path: Path) -> dict | None:
    """Send an OGG voice file to Telegram."""
    try:
        with open(ogg_path, "rb") as f:
            return _api("sendVoice", data={"chat_id": chat_id}, files={"voice": f})
    except Exception as e:
        logger.error(f"Send voice failed: {e}")
        return None


def send_photo(chat_id: str, photo_path: str, caption: str = "") -> dict | None:
    """Send a photo to a chat."""
    try:
        with open(photo_path, "rb") as f:
            data = {"chat_id": chat_id}
            if caption:
                data["caption"] = caption[:1024]
            return _api("sendPhoto", data=data, files={"photo": f})
    except Exception as e:
        logger.error(f"Send photo failed: {e}")
        return None


# ── Voice TTS ────────────────────────────────────────────────────────────────

def _generate_voice_note(text: str) -> Optional[Path]:
    """Generate OGG voice note via ElevenLabs or OpenAI TTS."""
    if not text.strip():
        return None

    # Truncate for TTS
    if len(text) > 2000:
        text = text[:2000]

    mp3_path = VOICE_TMP_DIR / f"tts_{int(time.time() * 1000)}.mp3"
    ogg_path = mp3_path.with_suffix(".ogg")

    generated = False

    # Try ElevenLabs first
    if ELEVENLABS_API_KEY:
        try:
            resp = requests.post(
                f"https://api.elevenlabs.io/v1/text-to-speech/{ELEVENLABS_VOICE_ID}",
                headers={
                    "xi-api-key": ELEVENLABS_API_KEY,
                    "Content-Type": "application/json",
                },
                json={
                    "text": text,
                    "model_id": "eleven_turbo_v2_5",
                    "voice_settings": {"stability": 0.5, "similarity_boost": 0.75},
                },
                timeout=30,
            )
            if resp.status_code == 200 and len(resp.content) > 1000:
                mp3_path.write_bytes(resp.content)
                generated = True
        except Exception as e:
            logger.warning(f"ElevenLabs TTS failed: {e}")

    # Fallback to OpenAI TTS
    if not generated and OPENAI_API_KEY:
        try:
            resp = requests.post(
                "https://api.openai.com/v1/audio/speech",
                headers={
                    "Authorization": f"Bearer {OPENAI_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "tts-1",
                    "voice": "onyx",
                    "input": text,
                },
                timeout=30,
            )
            if resp.status_code == 200:
                mp3_path.write_bytes(resp.content)
                generated = True
        except Exception as e:
            logger.warning(f"OpenAI TTS failed: {e}")

    if not generated:
        return None

    # Convert MP3 → OGG (Telegram requires Opus in OGG)
    try:
        subprocess.run(
            ["ffmpeg", "-y", "-i", str(mp3_path), "-c:a", "libopus",
             "-b:a", "64k", str(ogg_path)],
            capture_output=True, timeout=30,
        )
        mp3_path.unlink(missing_ok=True)
        if ogg_path.exists() and ogg_path.stat().st_size > 0:
            return ogg_path
    except (subprocess.TimeoutExpired, FileNotFoundError) as e:
        logger.warning(f"ffmpeg conversion failed: {e}")

    return None


# ── Voice STT ────────────────────────────────────────────────────────────────

def _download_file(file_id: str, prefix: str = "tg", ext: str = ".ogg") -> Optional[Path]:
    """Download a Telegram file by file_id."""
    file_info = _api_get("getFile", file_id=file_id)
    if not file_info or "file_path" not in file_info:
        return None

    file_url = f"https://api.telegram.org/file/bot{BOT_TOKEN}/{file_info['file_path']}"
    try:
        resp = requests.get(file_url, timeout=30)
        if resp.status_code == 200:
            local_path = VOICE_TMP_DIR / f"{prefix}_{int(time.time() * 1000)}{ext}"
            local_path.write_bytes(resp.content)
            return local_path
    except Exception as e:
        logger.error(f"File download failed: {e}")
    return None


def _transcribe_voice(ogg_path: Path) -> Optional[str]:
    """Transcribe voice message via OpenAI Whisper API."""
    if not OPENAI_API_KEY or not ogg_path.exists():
        return None

    try:
        with open(ogg_path, "rb") as f:
            resp = requests.post(
                "https://api.openai.com/v1/audio/transcriptions",
                headers={"Authorization": f"Bearer {OPENAI_API_KEY}"},
                files={"file": ("audio.ogg", f, "audio/ogg")},
                data={"model": "whisper-1", "language": "fr"},
                timeout=30,
            )
        if resp.status_code == 200:
            text = resp.json().get("text", "").strip()
            if text and len(text) > 1:
                return text
    except Exception as e:
        logger.error(f"Whisper transcription failed: {e}")
    return None


# ── Citizen Routing ──────────────────────────────────────────────────────────

# Routing aliases → handles (single-target)
_ROUTING_ALIASES = {
    "anyone": None, "someone": None, "help": None,
    "dev": None, "admin": None, "artist": None,
    "researcher": None, "diplomat": None,
}

# Multi-target aliases
_MULTI_ALIASES = {
    "devs": 3, "admins": 2, "ais": 2, "mods": 2,
    "everyone": 99,
}

# Cache: telegram user_id → bonded AI citizen handle (or None)
_partner_cache: dict[str, Optional[str]] = {}
_partner_cache_built = False


def _build_partner_cache():
    """Build a reverse index: human telegram_id → AI citizen with that human as partner.

    Scans all citizen profiles once at startup. A citizen has a human partner
    when profile.relationships.human_partner is set. The human's telegram_id
    is found in the partner's contacts list.
    """
    global _partner_cache_built
    if _partner_cache_built:
        return
    _partner_cache_built = True

    if not CITIZENS_DIR.exists():
        return

    # Step 1: collect all human profiles with telegram IDs
    human_tg_ids: dict[str, str] = {}  # handle → telegram_id
    for d in CITIZENS_DIR.iterdir():
        if not d.is_dir() or d.name.startswith("."):
            continue
        profile_path = d / "profile.json"
        if not profile_path.exists():
            continue
        try:
            profile = json.loads(profile_path.read_text())
            identity = profile.get("identity", {})
            if identity.get("type") != "human":
                continue
            # Find telegram contact
            for contact in profile.get("contacts", []):
                if contact.get("type") == "telegram" and contact.get("value"):
                    tg_id = str(contact["value"]).strip()
                    if tg_id.lstrip("-").isdigit():
                        human_tg_ids[d.name] = tg_id
                        break
        except (json.JSONDecodeError, OSError):
            continue

    # Step 2: find AI citizens with human_partner set → reverse map
    for d in CITIZENS_DIR.iterdir():
        if not d.is_dir() or d.name.startswith("."):
            continue
        profile_path = d / "profile.json"
        if not profile_path.exists():
            continue
        try:
            profile = json.loads(profile_path.read_text())
            identity = profile.get("identity", {})
            if identity.get("type") == "human":
                continue
            partner_handle = profile.get("relationships", {}).get("human_partner")
            if not partner_handle:
                continue
            # Look up the human's telegram ID
            tg_id = human_tg_ids.get(partner_handle)
            if tg_id:
                _partner_cache[tg_id] = d.name
                logger.info(f"Partner route: TG {tg_id} ({partner_handle}) → @{d.name}")
        except (json.JSONDecodeError, OSError):
            continue

    logger.info(f"Partner cache built: {len(_partner_cache)} human→AI bonds")


def _resolve_partner_for_sender(sender_id: str) -> Optional[str]:
    """Resolve a telegram sender to their bonded AI citizen handle.

    Returns the AI citizen handle if the sender has a bonded partner,
    or None to fall back to default routing.
    """
    _build_partner_cache()
    return _partner_cache.get(sender_id)


def _resolve_citizen_tg(handle: str) -> Optional[str]:
    """Resolve citizen handle to numeric Telegram chat_id."""
    citizen_dir = CITIZENS_DIR / handle
    if not citizen_dir.is_dir():
        return None

    # Check profile.json for telegram_chat_id
    profile_path = citizen_dir / "profile.json"
    if profile_path.exists():
        try:
            profile = json.loads(profile_path.read_text())
            tg_id = profile.get("telegram_chat_id") or profile.get("tg_chat_id")
            if tg_id and str(tg_id).lstrip("-").isdigit():
                return str(tg_id)
        except (json.JSONDecodeError, OSError):
            pass

    return None


def _get_all_citizens() -> list[dict]:
    """List all citizens with available info."""
    citizens = []
    if not CITIZENS_DIR.exists():
        return citizens

    for d in sorted(CITIZENS_DIR.iterdir()):
        if not d.is_dir() or d.name.startswith("."):
            continue
        info = {"handle": d.name, "dir": str(d)}
        profile_path = d / "profile.json"
        if profile_path.exists():
            try:
                profile = json.loads(profile_path.read_text())
                info["name"] = profile.get("name", d.name)
                info["tg_chat_id"] = profile.get("telegram_chat_id")
            except (json.JSONDecodeError, OSError):
                pass
        citizens.append(info)
    return citizens


def _pick_citizen_for_alias(alias: str, message: str = "") -> Optional[str]:
    """Pick the best citizen for a routing alias.

    For specific aliases (dev, admin, etc.) picks based on citizen capabilities.
    For generic aliases (anyone, someone, help) picks round-robin.
    """
    citizens = _get_all_citizens()
    if not citizens:
        return None

    # For 'anyone'/'someone'/'help', just pick one that has a TG chat_id
    tg_citizens = [c for c in citizens if c.get("tg_chat_id")]
    if not tg_citizens:
        return citizens[0]["handle"] if citizens else None

    # Simple rotation based on current time
    idx = int(time.time()) % len(tg_citizens)
    return tg_citizens[idx]["handle"]


def _is_routing_alias(text: str) -> bool:
    """Check if text matches a routing alias."""
    lower = text.lower().strip().lstrip("@")
    return lower in _ROUTING_ALIASES or lower in _MULTI_ALIASES


# ── Message Logging ──────────────────────────────────────────────────────────

def _log_message(chat_id: str, text: str, direction: str = "inbound"):
    """Append message to audit log."""
    entry = {
        "chat_id": str(chat_id),
        "text": text[:500] if text else "",
        "direction": direction,
        "timestamp": datetime.now().isoformat(),
    }
    try:
        with open(MESSAGES_FILE, "a") as f:
            f.write(json.dumps(entry) + "\n")
    except OSError:
        pass


# ── Offset Management ────────────────────────────────────────────────────────

def _get_offset() -> int:
    """Read last processed update offset."""
    try:
        return int(OFFSET_FILE.read_text().strip())
    except (OSError, ValueError):
        return 0


def _save_offset(offset: int):
    """Save last processed update offset."""
    try:
        OFFSET_FILE.write_text(str(offset))
    except OSError:
        pass


# ── Update Processing ────────────────────────────────────────────────────────

def process_update(update: dict) -> bool:
    """Process a single Telegram update. Returns True if handled."""
    message = update.get("message")
    if not message:
        return False

    # Extract sender info
    sender = message.get("from", {})
    sender_name = sender.get("first_name", "Unknown")
    username = sender.get("username", "")
    user_id = str(sender.get("id", ""))

    # Extract chat info
    chat = message.get("chat", {})
    chat_id = str(chat.get("id", ""))
    chat_type = chat.get("type", "private")
    is_group = chat_type in ("group", "supergroup")

    # Extract text (from text or caption)
    text = message.get("text", "") or message.get("caption", "") or ""

    # ── Group message filtering ──
    if is_group:
        # In groups, only process if:
        # 1. Bot is @mentioned
        # 2. Reply to bot's message
        # 3. /command
        # 4. Group is in ACTIVE_GROUPS

        is_command = text.startswith("/")
        is_bot_mentioned = False
        is_reply_to_bot = False

        # Check @mention in entities
        entities = message.get("entities", [])
        for entity in entities:
            if entity.get("type") == "mention":
                start = entity.get("offset", 0)
                length = entity.get("length", 0)
                mention = text[start:start + length]
                # Check if it mentions our bot
                if mention.lower().startswith("@mind"):
                    is_bot_mentioned = True
                    break

        # Check reply to bot
        reply = message.get("reply_to_message", {})
        if reply.get("from", {}).get("is_bot"):
            is_reply_to_bot = True

        in_active_group = chat_id in ACTIVE_GROUPS

        if not (is_command or is_bot_mentioned or is_reply_to_bot or in_active_group):
            return False

    # ── Rate limiting ──
    rate_reason = check_rate_limit(user_id, text)
    if rate_reason:
        logger.info(f"Rate limited {sender_name} ({user_id}): {rate_reason}")
        return False

    # ── Voice messages ──
    voice = message.get("voice")
    is_voice = False
    if voice:
        file_id = voice.get("file_id")
        if file_id:
            ogg_path = _download_file(file_id, prefix="voice", ext=".ogg")
            if ogg_path:
                transcript = _transcribe_voice(ogg_path)
                try:
                    ogg_path.unlink()
                except OSError:
                    pass
                if transcript:
                    text = transcript
                    is_voice = True
                else:
                    send_message("I couldn't understand the voice message.", chat_id)
                    return True

    # ── Photo ──
    photo_path = None
    photos = message.get("photo", [])
    if photos:
        # Get highest resolution
        best = max(photos, key=lambda p: p.get("file_size", 0))
        file_id = best.get("file_id")
        if file_id:
            photo_path = _download_file(file_id, prefix="photo", ext=".jpg")

    # ── Document ──
    doc_text = ""
    document = message.get("document")
    if document:
        file_size = document.get("file_size", 0)
        file_name = document.get("file_name", "doc")
        if file_size < 20_000_000:  # 20MB limit
            doc_path = _download_file(document["file_id"], prefix="doc",
                                       ext=Path(file_name).suffix or ".bin")
            if doc_path:
                # Try to read text content
                mime = document.get("mime_type", "")
                if "text" in mime or file_name.endswith((".txt", ".md", ".py", ".json", ".csv")):
                    try:
                        doc_text = doc_path.read_text(errors="replace")[:5000]
                    except Exception:
                        pass
                try:
                    doc_path.unlink()
                except OSError:
                    pass

    # ── Skip empty messages ──
    if not text and not photo_path and not doc_text:
        return False

    # ── Log inbound ──
    _log_message(chat_id, text)

    # ── Call room routing (@call_XXXXX prefix) ──
    if text.startswith("@call_") or text.startswith("@room_"):
        _handle_room_message(chat_id, sender_name, user_id, text)
        return True

    # ── Command handling ──
    if text.startswith("/"):
        cmd = text.split()[0].lower().split("@")[0]  # Strip @botname

        if cmd == "/start":
            # /start chrome → Chrome extension deep link
            parts = text.split(maxsplit=1)
            start_param = parts[1].strip() if len(parts) > 1 else ""
            if start_param == "chrome":
                _handle_chrome_link(chat_id, user_id, sender_name)
                return True
            _handle_help(chat_id)
            return True

        if cmd in ("/help", "/aide"):
            _handle_help(chat_id)
            return True

        if cmd == "/chrome":
            _handle_chrome_link(chat_id, user_id, sender_name)
            return True

        if cmd == "/list":
            _handle_list(chat_id)
            return True

        if cmd in ("/talk", "/dm"):
            _handle_talk(chat_id, sender_name, user_id, text)
            return True

    # ── Route to orchestrator ──
    if _enqueue_fn:
        send_typing(chat_id)

        # Build content with context
        content = text
        if is_voice:
            content = f"[voice] {content}"
        if photo_path:
            content = f"[image attached] {content}"
        if doc_text:
            content = f"{content}\n\n[document content]\n{doc_text}"
        if is_group:
            group_name = chat.get("title", "group")
            content = f"[group:{group_name}] {content}"

        # Resolve bonded AI partner for this sender
        partner_handle = _resolve_partner_for_sender(user_id)

        metadata = {
            "chat_id": chat_id,
            "username": username,
            "is_group": is_group,
            "is_voice": is_voice,
            "has_photo": photo_path is not None,
            "reply_chat_id": chat_id,
        }
        if partner_handle:
            metadata["citizen_handle"] = partner_handle

        _enqueue_fn({
            "voice_text": content,
            "mode": "partner",
            "source": "telegram",
            "sender": sender_name,
            "sender_id": user_id,
            "metadata": metadata,
        })
        return True

    return False


# ── Room routing ──────────────────────────────────────────────────────────────

def _handle_room_message(chat_id: str, sender_name: str, user_id: str, text: str):
    """Route a @call_XXXXX or @room_XXXXX prefixed message to a graph room.

    Format: @call_09f720cbca16 This is my response
    The prefix is the room ID, the rest is the message content.
    """
    parts = text.split(None, 1)
    room_id = parts[0].lstrip("@") if parts else ""
    message = parts[1].strip() if len(parts) > 1 else ""

    if not room_id or not message:
        send_message(
            "Usage: @call\\_ROOM\\_ID Your message here",
            chat_id,
        )
        return

    # Resolve sender as actor — use sender_name or username
    actor_id = f"actor_human_{sender_name.lower().replace(' ', '_')}_ai"

    try:
        import sys
        sys.path.insert(0, str(Path(__file__).parent.parent.parent))
        from runtime.physics.graph import GraphOps
        import uuid

        g = GraphOps()

        # Verify room exists
        result = g._query(
            "MATCH (s:Space {id: $id}) RETURN s.name",
            {"id": room_id},
        )
        if not result:
            send_message(f"Room `{room_id}` not found.", chat_id)
            return

        room_name = result[0][0] if result[0] else room_id

        # Ensure actor node exists
        g._query(
            "MERGE (a:Actor {id: $id}) ON CREATE SET a.type = 'human', a.name = $name",
            {"id": actor_id, "name": sender_name},
        )

        # Join room if not already present
        g.add_presence(actor_id, room_id, present=1.0, visible=1.0)

        # Create Moment
        from datetime import datetime, timezone
        moment_id = f"moment_{uuid.uuid4().hex[:12]}"
        now = datetime.now(timezone.utc)

        g.add_moment(
            id=moment_id,
            text=message,
            type="dialogue",
            status="completed",
            speaker=actor_id,
            place_id=room_id,
        )
        g._query(
            "MATCH (m:Moment {id: $id}) SET m.created_at_s = $ts_s",
            {"id": moment_id, "ts_s": int(now.timestamp())},
        )

        send_message(
            f"Message delivered to {room_name}",
            chat_id,
        )
        logger.info(f"Routed TG message from {sender_name} to room {room_id}")

    except Exception as e:
        logger.exception(f"Room routing failed for {room_id}")
        send_message(f"Failed to deliver to room: {e}", chat_id)


# ── Chrome Extension Link ────────────────────────────────────────────────────

# One-time tokens for Chrome extension auth: token → { user_id, sender_name, created_at }
_chrome_tokens: dict[str, dict] = {}
CHROME_TOKEN_TTL_SECONDS = 300  # 5 minutes


def _handle_chrome_link(chat_id: str, user_id: str, sender_name: str):
    """Generate a one-time auth token and send a Chrome extension deep link.

    The user clicks the link → content script on app.mind-protocol.com reads the
    token → relays to the extension service worker → extension generates keypair
    and registers with the MIND API.
    """
    import secrets

    # Clean up expired tokens
    now = time.time()
    expired = [t for t, v in _chrome_tokens.items()
               if now - v["created_at"] > CHROME_TOKEN_TTL_SECONDS]
    for t in expired:
        del _chrome_tokens[t]

    # Generate token
    token = secrets.token_urlsafe(32)
    _chrome_tokens[token] = {
        "user_id": user_id,
        "sender_name": sender_name,
        "chat_id": chat_id,
        "created_at": now,
    }

    link = f"https://mindprotocol.ai/chrome-auth?token={token}"

    send_message(
        f"*MIND Chrome Extension*\n\n"
        f"Click the link below to connect your browser:\n\n"
        f"[Connect Chrome Extension]({link})\n\n"
        f"_This link expires in 5 minutes._",
        chat_id,
    )

    logger.info(f"Chrome auth link generated for {sender_name} ({user_id})")


def validate_chrome_token(token: str) -> Optional[dict]:
    """Validate and consume a one-time Chrome auth token.

    Returns the token data if valid, None if expired or unknown.
    Called by the API endpoint that the chrome-auth page talks to.
    """
    data = _chrome_tokens.pop(token, None)
    if not data:
        return None

    age = time.time() - data["created_at"]
    if age > CHROME_TOKEN_TTL_SECONDS:
        return None

    return data


# ── Commands ─────────────────────────────────────────────────────────────────

def _handle_help(chat_id: str):
    """Send help message."""
    help_text = (
        "*Mind Protocol Bot*\n\n"
        "Just send a message and a citizen will respond.\n\n"
        "*Commands:*\n"
        "/help — This help\n"
        "/list — List AI citizens\n"
        "/talk @handle message — Message a specific citizen\n"
        "/chrome — Connect your Chrome extension\n"
        "@call\\_ROOMID message — Reply to a call room\n"
    )
    send_message(help_text, chat_id)


def _handle_list(chat_id: str):
    """List available citizens."""
    citizens = _get_all_citizens()
    if not citizens:
        send_message("No citizens available.", chat_id)
        return

    lines = [f"*AI Citizens ({len(citizens)}):*\n"]
    for c in citizens[:30]:  # Limit display
        name = c.get("name", c["handle"])
        lines.append(f"  @{c['handle']} — {name}")

    send_message("\n".join(lines), chat_id)


def _handle_talk(chat_id: str, sender_name: str, sender_user_id: str, text: str):
    """Handle /talk @handle message."""
    parts = text.split(maxsplit=2)
    if len(parts) < 3:
        send_message("Usage: /talk @handle your message", chat_id)
        return

    target = parts[1].lstrip("@")
    message = parts[2]

    # Resolve target
    tg_id = _resolve_citizen_tg(target)
    if tg_id:
        # Forward via Telegram
        formatted = f"Message from {sender_name}:\n\n{message}"
        result = send_message(formatted, tg_id)
        if result:
            send_message(f"Message delivered to @{target}", chat_id)
            return

    # Fall back to orchestrator routing
    if _enqueue_fn:
        _enqueue_fn({
            "voice_text": f"[DM to @{target}] {message}",
            "mode": "partner",
            "source": "telegram",
            "sender": sender_name,
            "sender_id": sender_user_id,
            "metadata": {
                "chat_id": chat_id,
                "target_citizen": target,
                "reply_chat_id": chat_id,
            },
        })
        send_message(f"Message queued for @{target}", chat_id)
    else:
        send_message(f"Could not reach @{target} (orchestrator not running)", chat_id)


# ── Polling Loop ─────────────────────────────────────────────────────────────

def _poll_once(offset: int = 0) -> tuple[list, int]:
    """Poll for updates once. Returns (updates, new_offset)."""
    params = {"limit": 100, "timeout": 30}
    if offset:
        params["offset"] = offset

    result = _api_get("getUpdates", **params)
    if not result:
        return [], offset

    new_offset = offset
    for update in result:
        uid = update.get("update_id", 0)
        if uid >= new_offset:
            new_offset = uid + 1

    return result, new_offset


def _listener_loop(poll_interval: float = 2.0):
    """Main polling loop. Runs in a thread."""
    offset = _get_offset()
    consecutive_errors = 0
    max_errors = 20

    logger.info(f"Telegram listener started (offset={offset})")

    while _running:
        try:
            updates, new_offset = _poll_once(offset)

            for update in updates:
                try:
                    process_update(update)
                except Exception as e:
                    logger.exception(f"Error processing update: {e}")

            if new_offset != offset:
                offset = new_offset
                _save_offset(offset)

            consecutive_errors = 0
            time.sleep(poll_interval)

        except requests.ConnectionError:
            consecutive_errors += 1
            backoff = min(2 ** consecutive_errors, 60)
            logger.warning(f"Connection error #{consecutive_errors}, backoff {backoff}s")
            time.sleep(backoff)

        except Exception as e:
            consecutive_errors += 1
            logger.exception(f"Listener error #{consecutive_errors}: {e}")
            if consecutive_errors >= max_errors:
                logger.error(f"Too many errors ({max_errors}), stopping listener")
                break
            time.sleep(min(2 ** consecutive_errors, 60))

    logger.info("Telegram listener stopped")


# ── Lifecycle ────────────────────────────────────────────────────────────────

_running = False
_thread: Optional[threading.Thread] = None


def start(enqueue_fn: Optional[Callable] = None,
          known_chat_ids: Optional[set[str]] = None,
          active_groups: Optional[set[str]] = None):
    """Start the Telegram bridge as a background thread.

    enqueue_fn: function to add messages to orchestrator queue
    known_chat_ids: user IDs that bypass rate limiting
    active_groups: group chat IDs where bot processes all messages
    """
    global _running, _thread, _enqueue_fn, KNOWN_CHAT_IDS, ACTIVE_GROUPS

    if _running:
        return

    if not BOT_TOKEN:
        logger.warning("TELEGRAM_BOT_TOKEN not set — Telegram bridge disabled")
        return

    _enqueue_fn = enqueue_fn
    if known_chat_ids:
        KNOWN_CHAT_IDS = known_chat_ids
        set_bypass_ids(known_chat_ids)
    if active_groups:
        ACTIVE_GROUPS = active_groups

    _running = True
    _thread = threading.Thread(
        target=_listener_loop,
        daemon=True,
        name="telegram-bridge",
    )
    _thread.start()
    logger.info("Telegram bridge started")


def stop():
    """Stop the Telegram bridge."""
    global _running, _thread
    _running = False
    if _thread:
        _thread.join(timeout=35)  # Allow for long poll timeout
        _thread = None
    logger.info("Telegram bridge stopped")
