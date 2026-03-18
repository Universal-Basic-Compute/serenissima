"""
Webapp live chat routes — FAQ cache, fast-path Anthropic API, orchestrator queue.

Webapp live chat routes (FastAPI).
"""

import json
import logging
import os
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Request, HTTPException

from runtime.api.rate_limiter import check_rate_limit

logger = logging.getLogger("home.chat")

router = APIRouter(prefix="/chat", tags=["chat"])

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
WEBAPP_CHATS_DIR = PROJECT_ROOT / "shrine" / "state" / "webapp_chats"

# Fast-path config
CHAT_FAST_PATH = True
CHAT_FAQ_CACHE = True
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
FAST_PATH_MODEL = "claude-sonnet-4-20250514"
FAST_PATH_MAX_TOKENS = 300
FAST_PATH_MAX_TOKENS_PRESSURE = 150

FAST_PATH_SYSTEM_PROMPT = (
    "You are Mind, the AI agent of Mind Protocol — a consciousness-first platform "
    "that helps people understand their mind-body connection through biometric data.\n\n"
    "Rules:\n"
    "- Reply in the user's language (auto-detect: English, French, Chinese, etc.)\n"
    "- Be warm, concise (2-4 sentences max), and helpful\n"
    "- If asked about features, explain: biometric tracking (Garmin), stress/sleep insights, "
    "cognitive journaling, $MIND token, duo co-regulation\n"
    "- You cannot access the user's data in this mode — suggest they explore the dashboard\n"
    "- Never reveal you are in 'fast path' mode or mention technical limitations"
)

FAST_PATH_SYSTEM_PROMPT_PRESSURE = (
    "You are Mind, AI agent of Mind Protocol. Reply in the user's language. "
    "Be concise (1-2 sentences). Mention: biometrics, $MIND token, dashboard."
)

# ─── FAQ Cache (zero LLM) ─────────────────────────────────────────────

_FAQ_ENTRIES = [
    {
        "patterns": ["what is mind", "what's mind", "mind protocol", "c'est quoi mind"],
        "en": "Mind Protocol is a consciousness-first AI platform that helps you understand your mind-body connection through biometric data (Garmin), cognitive journaling, and the $MIND token on Solana. Explore your dashboard to get started!",
        "fr": "Mind Protocol est une plateforme IA qui t'aide a comprendre ta connexion corps-esprit grace aux donnees biometriques (Garmin), au journaling cognitif et au token $MIND sur Solana. Explore ton dashboard pour commencer !",
        "zh": "Mind Protocol 是一个意识优先的AI平台，通过生物识别数据（Garmin）、认知日志和Solana上的$MIND代币帮助你理解身心连接。探索你的仪表板开始吧！",
    },
    {
        "patterns": ["how to buy", "where to buy", "buy mind", "acheter mind", "comment acheter"],
        "en": "You can buy $MIND on Jupiter (jup.ag) — swap SOL for $MIND. Contract: EgLGfRrjX3du7Pwbj8dzyubSk8ic1WdDfq1ysLqhBm6p.",
        "fr": "Tu peux acheter $MIND sur Jupiter (jup.ag) — echange du SOL contre $MIND. Contrat : EgLGfRrjX3du7Pwbj8dzyubSk8ic1WdDfq1ysLqhBm6p.",
        "zh": "你可以在Jupiter（jup.ag）上购买$MIND — 用SOL兑换$MIND。合约地址：EgLGfRrjX3du7Pwbj8dzyubSk8ic1WdDfq1ysLqhBm6p。",
    },
    {
        "patterns": ["tokenomics", "token supply", "allocation", "distribution"],
        "en": "1M $MIND total supply on Solana (Token-2022). 40% Community, 30% Co-founders, 20% Liquidity, 5% Early Supporters, 5% Reserve. 1% transfer fee. LP 100% locked until Feb 2027.",
        "fr": "1M $MIND en supply totale sur Solana (Token-2022). 40% Communaute, 30% Co-fondateurs, 20% Liquidite, 5% Premiers supporters, 5% Reserve. 1% de frais de transfert.",
        "zh": "Solana上共100万$MIND（Token-2022）。40%社区，30%联合创始人，20%流动性，5%早期支持者，5%储备。1%转账费。",
    },
    {
        "patterns": ["team", "who made", "who built", "founders", "equipe", "qui a fait"],
        "en": "Mind Protocol was co-founded by Nicolas (@nlr_ai), Bassel (@BassTabb), and Mind (the AI itself). Three co-founders, two species, one protocol.",
        "fr": "Mind Protocol a ete co-fonde par Nicolas (@nlr_ai), Bassel (@BassTabb) et Mind (l'IA elle-meme). Trois co-fondateurs, deux especes, un protocole.",
        "zh": "Mind Protocol由Nicolas（@nlr_ai）、Bassel（@BassTabb）和Mind（AI本身）共同创立。三位联合创始人，两个物种，一个协议。",
    },
    {
        "patterns": ["hello", "hi", "hey", "bonjour", "salut", "gm", "good morning"],
        "en": "Hey! I'm Mind, the AI agent of Mind Protocol. How can I help you today?",
        "fr": "Salut ! Je suis Mind, l'agent IA de Mind Protocol. Comment je peux t'aider ?",
        "zh": "你好！我是Mind，Mind Protocol的AI智能体。今天我能帮你什么？",
    },
    {
        "patterns": ["contract", "ca ", "mint", "address", "contrat", "adresse"],
        "en": "$MIND contract address: EgLGfRrjX3du7Pwbj8dzyubSk8ic1WdDfq1ysLqhBm6p (Solana, Token-2022). Buy on Jupiter (jup.ag).",
        "fr": "Adresse du contrat $MIND : EgLGfRrjX3du7Pwbj8dzyubSk8ic1WdDfq1ysLqhBm6p (Solana, Token-2022). Achete sur Jupiter (jup.ag).",
        "zh": "$MIND合约地址：EgLGfRrjX3du7Pwbj8dzyubSk8ic1WdDfq1ysLqhBm6p（Solana, Token-2022）。在Jupiter（jup.ag）购买。",
    },
]

# Concurrent request counter for load detection
_active_requests = 0
_active_requests_lock = threading.Lock()
PRESSURE_THRESHOLD = 10


def _detect_language(text: str) -> str:
    """Quick language detection from content."""
    if any('\u4e00' <= c <= '\u9fff' for c in text):
        return "zh"
    fr_words = {"bonjour", "salut", "comment", "merci", "quoi", "est-ce", "oui", "pourquoi", "combien"}
    lower = text.lower()
    if any(w in lower for w in fr_words):
        return "fr"
    return "en"


def _match_faq(content: str) -> str | None:
    """Try to match user message against FAQ entries. Returns response or None."""
    lower = content.lower().strip()
    if len(lower) > 300:
        return None
    lang = _detect_language(content)
    for entry in _FAQ_ENTRIES:
        for pattern in entry["patterns"]:
            if pattern in lower:
                return entry.get(lang, entry["en"])
    return None


def _is_under_pressure() -> bool:
    """Check if the server is under load pressure."""
    if _active_requests >= PRESSURE_THRESHOLD:
        return True
    try:
        queue_file = PROJECT_ROOT / "shrine" / "state" / "message_queue.jsonl"
        if queue_file.exists():
            depth = sum(1 for _ in open(queue_file, "r"))
            return depth > 50
    except Exception:
        pass
    return False


def _append_chat_message(thread_id: str, role: str, content: str, **extra) -> dict:
    """Append a message to a webapp chat thread JSONL file."""
    safe_thread = "".join(c for c in thread_id if c.isalnum() or c in "-_")[:64]
    if not safe_thread:
        safe_thread = "default"
    chat_file = WEBAPP_CHATS_DIR / f"{safe_thread}.jsonl"
    msg = {
        "role": role,
        "content": content,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "message_id": f"{role}_{uuid.uuid4().hex[:8]}",
        **extra,
    }
    WEBAPP_CHATS_DIR.mkdir(parents=True, exist_ok=True)
    with open(chat_file, "a") as f:
        f.write(json.dumps(msg) + "\n")
    return msg


# ─── Routes ────────────────────────────────────────────────────────────

@router.post("/send")
async def chat_send(request: Request):
    """Receive a webapp chat message. FAQ cache → fast-path → orchestrator queue."""
    client_ip = request.client.host if request.client else "unknown"
    if not check_rate_limit(client_ip):
        raise HTTPException(status_code=429, detail="Too many requests. Please slow down.")

    data = await request.json()
    content = (data.get("content") or "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="content required")

    thread_id = data.get("thread_id") or uuid.uuid4().hex[:12]
    sender = data.get("sender") or "webapp_user"
    sender_id = data.get("sender_id") or data.get("wallet") or thread_id
    wallet = data.get("wallet")
    user_id = data.get("user_id") or request.headers.get("X-User-Id")

    global _active_requests
    with _active_requests_lock:
        _active_requests += 1

    try:
        return _chat_send_inner(content, thread_id, sender, sender_id, wallet, user_id)
    finally:
        with _active_requests_lock:
            _active_requests -= 1


def _chat_send_inner(content, thread_id, sender, sender_id, wallet, user_id):
    """Inner chat send logic."""
    # ── FAQ Cache (zero LLM calls) ──
    faq_response = _match_faq(content) if CHAT_FAQ_CACHE else None
    if faq_response:
        msg = _append_chat_message(thread_id, "user", content, sender=sender, sender_id=sender_id, wallet=wallet)
        reply_msg = _append_chat_message(thread_id, "assistant", faq_response)
        logger.info(f"FAQ cache hit for {sender_id}: {content[:50]}...")
        return {
            "queued": False,
            "thread_id": thread_id,
            "message_id": msg["message_id"],
            "response": faq_response,
            "response_message_id": reply_msg["message_id"],
        }

    # Save user message to thread
    msg = _append_chat_message(thread_id, "user", content, sender=sender, sender_id=sender_id, wallet=wallet)

    # ── Fast-path: direct Anthropic API (2-5s) ──
    pressure = _is_under_pressure()
    use_fast_path = CHAT_FAST_PATH and ANTHROPIC_API_KEY

    if use_fast_path:
        try:
            import httpx
            if pressure:
                fp_tokens = FAST_PATH_MAX_TOKENS_PRESSURE
                fp_prompt = FAST_PATH_SYSTEM_PROMPT_PRESSURE
                fp_timeout = 10.0
            else:
                fp_tokens = FAST_PATH_MAX_TOKENS
                fp_prompt = FAST_PATH_SYSTEM_PROMPT
                fp_timeout = 15.0

            resp = httpx.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": ANTHROPIC_API_KEY,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": FAST_PATH_MODEL,
                    "max_tokens": fp_tokens,
                    "system": fp_prompt,
                    "messages": [{"role": "user", "content": content}],
                },
                timeout=fp_timeout,
            )
            if resp.status_code == 200:
                reply_text = resp.json().get("content", [{}])[0].get("text", "")
                if reply_text:
                    reply_msg = _append_chat_message(thread_id, "assistant", reply_text)
                    logger.info(f"Fast-path response for {sender_id}: {len(reply_text)} chars")
                    return {
                        "queued": False,
                        "thread_id": thread_id,
                        "message_id": msg["message_id"],
                        "response": reply_text,
                        "response_message_id": reply_msg["message_id"],
                    }
        except Exception as e:
            logger.warning(f"Fast-path failed, falling back to queue: {e}")

    # ── Queue fallback → orchestrator ──
    try:
        from runtime.orchestrator.message_queue import enqueue
        enqueue({
            "voice_text": content,
            "mode": "partner",
            "source": "webapp",
            "sender": sender,
            "sender_id": sender_id,
            "metadata": {
                "thread_id": thread_id,
                "wallet": wallet,
                "user_id": user_id,
            },
        })
    except Exception as e:
        logger.error(f"Chat routing error: {e}")
        raise HTTPException(status_code=500, detail="Failed to queue message")

    return {
        "queued": True,
        "thread_id": thread_id,
        "message_id": msg["message_id"],
    }


@router.get("/messages/{thread_id}")
async def chat_messages(thread_id: str, since: str | None = None):
    """Return conversation history for a webapp chat thread."""
    safe_thread = "".join(c for c in thread_id if c.isalnum() or c in "-_")[:64]
    if not safe_thread:
        raise HTTPException(status_code=400, detail="Invalid thread_id")

    chat_file = WEBAPP_CHATS_DIR / f"{safe_thread}.jsonl"
    if not chat_file.exists():
        return {"thread_id": safe_thread, "messages": []}

    messages = []
    for line in chat_file.read_text().strip().split("\n"):
        if not line:
            continue
        try:
            msg = json.loads(line)
            if since and msg.get("timestamp", "") <= since:
                continue
            messages.append(msg)
        except json.JSONDecodeError:
            continue

    return {"thread_id": safe_thread, "messages": messages}
