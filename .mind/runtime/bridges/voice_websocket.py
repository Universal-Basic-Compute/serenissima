"""Voice WebSocket — real-time voice conversation.

Protocol:
  Client → Server: Binary frame (complete utterance, VAD-processed webm/opus)
  Server → Client: JSON state + transcript + response + MP3 audio chunks

Pipeline: Whisper STT → Claude LLM → ElevenLabs TTS

Wired into home_server.py as a WebSocket route.
"""

import asyncio
import json
import logging
import os
import re
import tempfile
import time
from pathlib import Path

logger = logging.getLogger("bridge.voice")

# ── Config ───────────────────────────────────────────────────────────────────

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
ELEVENLABS_API_KEY = os.environ.get("ELEVENLABS_API_KEY", "")
ELEVENLABS_VOICE_ID = os.environ.get("ELEVENLABS_VOICE_ID", "oPo4t55LBdLAECiAx1JD")
VOICE_AUTH_TOKEN = os.environ.get("VOICE_AUTH_TOKEN", "")

MAX_HISTORY_TURNS = 10
WS_RATE_LIMIT_MAX = 10
WS_RATE_LIMIT_WINDOW = 60  # seconds

_ws_rate_limit: dict[str, list[float]] = {}
_ws_rate_limit_lock = asyncio.Lock()

# Non-Latin character detection for hallucination filtering
_NON_LATIN_RE = re.compile(
    r'[\u4e00-\u9fff\u3400-\u4dbf\u0400-\u04ff\u0600-\u06ff'
    r'\u0e00-\u0e7f\u0900-\u097f\u3000-\u303f\u30a0-\u30ff'
    r'\u3040-\u309f\uac00-\ud7af]'
)


# ── Rate Limiting ────────────────────────────────────────────────────────────

async def _check_ws_rate_limit(ip: str) -> bool:
    """Return True if WebSocket connection is allowed."""
    now = time.time()
    cutoff = now - WS_RATE_LIMIT_WINDOW
    async with _ws_rate_limit_lock:
        timestamps = _ws_rate_limit.get(ip, [])
        timestamps = [t for t in timestamps if t > cutoff]
        if len(timestamps) >= WS_RATE_LIMIT_MAX:
            _ws_rate_limit[ip] = timestamps
            return False
        timestamps.append(now)
        _ws_rate_limit[ip] = timestamps
        # Periodic cleanup
        if len(_ws_rate_limit) > 1000:
            expired = [k for k, v in _ws_rate_limit.items() if not v or v[-1] < cutoff]
            for k in expired:
                del _ws_rate_limit[k]
        return True


# ── STT (Whisper) ────────────────────────────────────────────────────────────

def _is_hallucinated(text: str) -> bool:
    """Detect Whisper hallucinations: non-Latin scripts, repetition."""
    if not text:
        return True
    non_latin_count = len(_NON_LATIN_RE.findall(text))
    if non_latin_count > 0 and non_latin_count / max(len(text), 1) > 0.2:
        return True
    words = text.lower().split()
    if len(words) >= 3 and len(set(words)) == 1:
        return True
    return False


async def whisper_transcribe(audio_bytes: bytes) -> str:
    """Transcribe complete utterance via OpenAI Whisper API."""
    if not OPENAI_API_KEY:
        return ""

    import httpx

    with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as f:
        f.write(audio_bytes)
        tmp_path = f.name

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            with open(tmp_path, "rb") as audio_file:
                resp = await client.post(
                    "https://api.openai.com/v1/audio/transcriptions",
                    headers={"Authorization": f"Bearer {OPENAI_API_KEY}"},
                    files={"file": ("audio.webm", audio_file, "audio/webm")},
                    data={
                        "model": "whisper-1",
                        "language": "fr",
                        "response_format": "verbose_json",
                    },
                )
            if resp.status_code == 200:
                data = resp.json()
                text = data.get("text", "").strip()
                text = re.sub(r'\s+', ' ', text).strip()

                # Filter: no_speech_prob
                segments = data.get("segments", [])
                if segments and isinstance(segments[0], dict):
                    avg_no_speech = sum(s.get("no_speech_prob", 0) for s in segments) / max(len(segments), 1)
                    if avg_no_speech > 0.6:
                        return ""

                if len(text) < 2:
                    return ""

                if _is_hallucinated(text):
                    return ""

                return text
            else:
                logger.warning(f"Whisper error {resp.status_code}: {resp.text[:200]}")
                return ""
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


# ── LLM (Claude) ─────────────────────────────────────────────────────────────

def _build_voice_system_prompt() -> str:
    """Build system prompt for voice conversations."""
    return (
        "You are in a real-time voice conversation. "
        "Keep responses short (2-4 sentences), natural, and conversational. "
        "No markdown, no lists, no formatting — pure spoken language. "
        "Be direct and substantive."
    )


async def claude_stream(transcript: str, history: list[dict]):
    """Stream Claude response, yielding text chunks."""
    if not ANTHROPIC_API_KEY:
        yield "API key not configured."
        return

    import httpx

    system = _build_voice_system_prompt()
    messages = list(history)
    messages.append({"role": "user", "content": transcript})

    async with httpx.AsyncClient(timeout=60) as client:
        async with client.stream(
            "POST",
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": ANTHROPIC_API_KEY,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": "claude-sonnet-4-20250514",
                "max_tokens": 300,
                "system": system,
                "messages": messages,
                "stream": True,
            },
        ) as resp:
            if resp.status_code != 200:
                body = await resp.aread()
                logger.warning(f"Claude error {resp.status_code}: {body[:300]}")
                yield "Sorry, I couldn't process that."
                return

            async for line in resp.aiter_lines():
                if not line.startswith("data: "):
                    continue
                data = line[6:]
                if data == "[DONE]":
                    break
                try:
                    event = json.loads(data)
                    if event.get("type") == "content_block_delta":
                        delta = event.get("delta", {})
                        if delta.get("type") == "text_delta":
                            text = delta.get("text", "")
                            if text:
                                yield text
                except json.JSONDecodeError:
                    continue


# ── TTS (ElevenLabs) ─────────────────────────────────────────────────────────

async def elevenlabs_tts_stream(text: str):
    """Stream TTS audio from ElevenLabs WebSocket API, yielding MP3 chunks."""
    if not ELEVENLABS_API_KEY:
        return

    import websockets
    import base64

    uri = (
        f"wss://api.elevenlabs.io/v1/text-to-speech/{ELEVENLABS_VOICE_ID}"
        f"/stream-input?model_id=eleven_turbo_v2_5&output_format=mp3_44100_128"
    )

    try:
        async with websockets.connect(
            uri, additional_headers={"xi-api-key": ELEVENLABS_API_KEY}
        ) as ws:
            await ws.send(json.dumps({
                "text": " ",
                "voice_settings": {"stability": 0.5, "similarity_boost": 0.75},
                "generation_config": {"chunk_length_schedule": [120, 160, 250, 290]},
            }))

            await ws.send(json.dumps({"text": text}))
            await ws.send(json.dumps({"text": ""}))

            async for msg in ws:
                if isinstance(msg, bytes):
                    yield msg
                else:
                    try:
                        data = json.loads(msg)
                        if data.get("audio"):
                            yield base64.b64decode(data["audio"])
                        if data.get("isFinal"):
                            break
                    except (json.JSONDecodeError, KeyError):
                        continue
    except Exception as e:
        logger.warning(f"ElevenLabs WS error: {e}")


async def elevenlabs_tts_rest(text: str):
    """Fallback: REST API for TTS (non-streaming)."""
    if not ELEVENLABS_API_KEY:
        return

    import httpx

    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
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
        )
        if resp.status_code == 200:
            content = resp.content
            chunk_size = 4096
            for i in range(0, len(content), chunk_size):
                yield content[i:i + chunk_size]


# ── WebSocket Handler ────────────────────────────────────────────────────────

async def voice_ws_handler(ws):
    """Handle a voice WebSocket connection.

    Call this from a FastAPI WebSocket route:
        @app.websocket("/voice/ws")
        async def voice_ws(ws: WebSocket):
            await voice_ws_handler(ws)
    """
    from fastapi import WebSocket, WebSocketDisconnect

    # Rate limit check
    client_ip = ws.client.host if ws.client else "unknown"
    if not await _check_ws_rate_limit(client_ip):
        await ws.accept()
        await ws.close(code=4008, reason="rate limit exceeded")
        return

    # Optional auth
    if VOICE_AUTH_TOKEN:
        token = ws.query_params.get("token", "")
        if token != VOICE_AUTH_TOKEN:
            await ws.close(code=4001, reason="unauthorized")
            return

    await ws.accept()
    logger.info(f"Voice WS connected: {client_ip}")
    await ws.send_json({"type": "state", "phase": "listening"})

    history: list[dict] = []

    try:
        while True:
            message = await ws.receive()

            if "bytes" in message and message["bytes"]:
                audio_data = message["bytes"]
            elif "text" in message:
                continue
            else:
                continue

            if len(audio_data) < 1000:
                continue

            # STT
            t0 = time.monotonic()
            await ws.send_json({"type": "state", "phase": "processing"})

            transcript = await whisper_transcribe(audio_data)
            stt_ms = int((time.monotonic() - t0) * 1000)

            if not transcript:
                await ws.send_json({"type": "state", "phase": "listening"})
                continue

            logger.info(f"STT: '{transcript}' ({stt_ms}ms)")
            await ws.send_json({"type": "transcript", "text": transcript})

            # LLM
            t1 = time.monotonic()
            await ws.send_json({"type": "state", "phase": "speaking"})

            full_response = ""
            async for chunk in claude_stream(transcript, history):
                full_response += chunk
                await ws.send_json({"type": "response_delta", "text": chunk})

            llm_ms = int((time.monotonic() - t1) * 1000)
            logger.info(f"LLM: {len(full_response)} chars ({llm_ms}ms)")
            await ws.send_json({"type": "response", "text": full_response})

            # History management
            history.append({"role": "user", "content": transcript})
            history.append({"role": "assistant", "content": full_response})
            if len(history) > MAX_HISTORY_TURNS * 2:
                history = history[-(MAX_HISTORY_TURNS * 2):]

            # TTS
            t2 = time.monotonic()
            await ws.send_json({"type": "audio_start", "codec": "audio/mpeg"})

            audio_sent = False
            chunk_count = 0
            try:
                async for audio_chunk in elevenlabs_tts_stream(full_response):
                    await ws.send_bytes(audio_chunk)
                    audio_sent = True
                    chunk_count += 1
            except Exception as e:
                logger.warning(f"TTS WS failed after {chunk_count} chunks, trying REST: {e}")
                if not audio_sent:
                    async for audio_chunk in elevenlabs_tts_rest(full_response):
                        await ws.send_bytes(audio_chunk)
                        audio_sent = True
                        chunk_count += 1

            tts_ms = int((time.monotonic() - t2) * 1000)
            total_ms = int((time.monotonic() - t0) * 1000)
            logger.info(f"TTS: {chunk_count} chunks ({tts_ms}ms) | Total: {total_ms}ms")

            await asyncio.sleep(0.3)
            await ws.send_json({"type": "audio_end"})
            await ws.send_json({"type": "state", "phase": "listening"})

    except Exception as e:
        if "disconnect" not in str(type(e).__name__).lower():
            logger.warning(f"Voice WS error: {e}")
        try:
            await ws.close()
        except Exception:
            pass
