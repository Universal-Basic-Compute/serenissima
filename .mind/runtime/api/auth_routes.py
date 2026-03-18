"""
Authentication routes — registration, login, magic links, JWT, password reset.

Authentication routes (FastAPI) — registration, login, magic links, JWT, password reset.
"""

import json
import logging
import secrets
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Request, HTTPException

from runtime.api.rate_limiter import check_rate_limit
from runtime.api import jwt_utils
from runtime.api import citizen_profiles

logger = logging.getLogger("home.auth")

router = APIRouter(prefix="/auth", tags=["auth"])

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
STATE_DIR = PROJECT_ROOT / "shrine" / "state"
MAGIC_TOKENS_FILE = STATE_DIR / "magic_tokens.json"
RESET_TOKENS_FILE = STATE_DIR / "reset_tokens.json"


# ── Token storage helpers ──────────────────────────────────────────────────

def _load_magic_tokens() -> dict:
    try:
        if MAGIC_TOKENS_FILE.exists():
            return json.loads(MAGIC_TOKENS_FILE.read_text())
    except (json.JSONDecodeError, OSError):
        pass
    return {}


def _save_magic_tokens(tokens: dict) -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    MAGIC_TOKENS_FILE.write_text(json.dumps(tokens, indent=2, ensure_ascii=False))


def _load_reset_tokens() -> dict:
    try:
        if RESET_TOKENS_FILE.exists():
            return json.loads(RESET_TOKENS_FILE.read_text())
    except (json.JSONDecodeError, OSError):
        pass
    return {}


def _save_reset_tokens(tokens: dict) -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    RESET_TOKENS_FILE.write_text(json.dumps(tokens, indent=2, ensure_ascii=False))


def _get_client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _get_user_id_from_request(request: Request) -> str:
    """Extract user_id from header, query param, or body."""
    uid = request.headers.get("X-User-Id", "").strip()
    if uid:
        return uid
    uid = request.query_params.get("user_id", "").strip()
    if uid:
        return uid
    return ""


# ── Routes ─────────────────────────────────────────────────────────────────

@router.post("/register")
async def register(request: Request):
    """Create a new citizen account. Returns JWT token on success."""
    if not check_rate_limit(_get_client_ip(request)):
        raise HTTPException(status_code=429, detail="Too many requests. Please try again later.")

    data = await request.json()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password", "")
    name = (data.get("name") or "").strip()

    if not email or not password or not name:
        raise HTTPException(status_code=400, detail="email, password, and name are required")
    if len(password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    existing = citizen_profiles.get_profile_by_email(email)
    if existing:
        raise HTTPException(status_code=409, detail="An account with this email already exists")

    user_id = str(uuid.uuid4())
    pw_hash = citizen_profiles.hash_password(password)
    citizen_profiles.create_profile(user_id=user_id, name=name, email=email, trust="medium")
    citizen_profiles.update_profile(user_id, {"password_hash": pw_hash})

    token = jwt_utils.sign_token(user_id=user_id, name=name, trust="medium")
    logger.info(f"[AUTH] New citizen registered: {name} ({email}) -> {user_id}")

    return {"token": token, "user_id": user_id, "name": name, "trust": "medium"}


@router.post("/login")
async def login(request: Request):
    """Login with email and password. Returns JWT token on success."""
    if not check_rate_limit(_get_client_ip(request)):
        raise HTTPException(status_code=429, detail="Too many requests. Please try again later.")

    data = await request.json()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password", "")

    if not email or not password:
        raise HTTPException(status_code=400, detail="email and password are required")

    profile = citizen_profiles.get_profile_by_email(email)
    if not profile:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    pw_hash = profile.get("password_hash")
    if not pw_hash or not citizen_profiles.verify_password(password, pw_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    user_id = profile["user_id"]
    name = profile.get("name", "")
    trust = profile.get("trust", "medium")
    token = jwt_utils.sign_token(user_id=user_id, name=name, trust=trust)

    logger.info(f"[AUTH] Login: {name} ({email}) -> {user_id}")
    return {"token": token, "user_id": user_id, "name": name, "trust": trust}


@router.get("/magic")
async def magic_validate(request: Request):
    """Validate a magic link token (from Telegram). Returns JWT on success."""
    magic_token = request.query_params.get("token", "").strip()
    if not magic_token:
        raise HTTPException(status_code=400, detail="token parameter is required")

    tokens = _load_magic_tokens()
    entry = tokens.get(magic_token)
    if not entry:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    # Check expiry (30 minutes)
    created_at = entry.get("created_at", "")
    try:
        created_dt = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
        if (datetime.now(timezone.utc) - created_dt).total_seconds() > 1800:
            entry["used"] = True
            _save_magic_tokens(tokens)
            raise HTTPException(status_code=401, detail="Token has expired")
    except (ValueError, AttributeError):
        raise HTTPException(status_code=401, detail="Invalid token format")

    if entry.get("used", False):
        raise HTTPException(status_code=401, detail="Token has already been used")

    entry["used"] = True
    _save_magic_tokens(tokens)

    user_id = entry.get("user_id", entry.get("chat_id", ""))
    profile = citizen_profiles.get_profile(user_id)
    name = profile.get("name", "") if profile else ""
    trust = profile.get("trust", "medium") if profile else "medium"

    token = jwt_utils.sign_token(user_id=user_id, name=name, trust=trust)
    logger.info(f"[AUTH] Magic link validated for user_id={user_id}")
    return {"token": token, "user_id": user_id, "name": name, "trust": trust}


@router.post("/verify")
async def verify(request: Request):
    """Verify a JWT token's validity. Returns decoded claims or valid=false."""
    if not check_rate_limit(_get_client_ip(request)):
        return {"valid": False, "error": "Too many requests."}

    data = await request.json()
    token = data.get("token", "").strip()
    if not token:
        raise HTTPException(status_code=400, detail="token is required")

    payload = jwt_utils.verify_token(token)
    if not payload:
        return {"valid": False}

    return {
        "valid": True,
        "user_id": payload.get("sub", ""),
        "name": payload.get("name", ""),
        "trust": payload.get("trust", ""),
    }


@router.post("/magic/generate")
async def magic_generate(request: Request):
    """Generate a magic link token (for telegram bridge)."""
    if not check_rate_limit(_get_client_ip(request)):
        raise HTTPException(status_code=429, detail="Too many requests.")

    data = await request.json()
    chat_id = str(data.get("chat_id", "")).strip()
    user_id = str(data.get("user_id", "")).strip()

    if not chat_id or not user_id:
        raise HTTPException(status_code=400, detail="chat_id and user_id are required")

    magic_token = secrets.token_urlsafe(48)
    tokens = _load_magic_tokens()
    tokens[magic_token] = {
        "chat_id": chat_id,
        "user_id": user_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "used": False,
    }
    _save_magic_tokens(tokens)

    url = f"https://mindprotocol.ai/login?token={magic_token}"
    logger.info(f"[AUTH] Magic link generated for chat_id={chat_id}, user_id={user_id}")
    return {"token": magic_token, "url": url}


@router.post("/password-reset-request")
async def password_reset_request(request: Request):
    """Request a password reset. Generates a reset token for the given email."""
    if not check_rate_limit(_get_client_ip(request)):
        raise HTTPException(status_code=429, detail="Too many requests.")

    data = await request.json()
    email = (data.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="email is required")

    profile = citizen_profiles.get_profile_by_email(email)

    # Always return success to prevent email enumeration
    if not profile:
        logger.info(f"[AUTH] Password reset requested for unknown email: {email}")
        return {"ok": True, "message": "If this email exists, a reset link has been generated."}

    reset_token = secrets.token_urlsafe(48)
    tokens = _load_reset_tokens()

    # Clean expired tokens (> 1h old)
    now = datetime.now(timezone.utc)
    tokens = {
        k: v for k, v in tokens.items()
        if not v.get("used")
        and (now - datetime.fromisoformat(v["created_at"].replace("Z", "+00:00"))).total_seconds() < 3600
    }

    tokens[reset_token] = {
        "user_id": profile["user_id"],
        "email": email,
        "created_at": now.isoformat(),
        "used": False,
    }
    _save_reset_tokens(tokens)

    reset_url = f"https://mindprotocol.ai/reset-password?token={reset_token}"
    logger.info(f"[AUTH] Password reset token generated for {email}")
    return {
        "ok": True,
        "message": "If this email exists, a reset link has been generated.",
        "_reset_url": reset_url,
        "_token": reset_token,
    }


@router.post("/password-reset")
async def password_reset(request: Request):
    """Reset password using a valid reset token."""
    if not check_rate_limit(_get_client_ip(request)):
        raise HTTPException(status_code=429, detail="Too many requests.")

    data = await request.json()
    token = (data.get("token") or "").strip()
    new_password = data.get("password", "")

    if not token:
        raise HTTPException(status_code=400, detail="Reset token is required")
    if not new_password or len(new_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    tokens = _load_reset_tokens()
    token_data = tokens.get(token)

    if not token_data:
        raise HTTPException(status_code=400, detail="Invalid or expired reset link")
    if token_data.get("used"):
        raise HTTPException(status_code=400, detail="This reset link has already been used")

    created = datetime.fromisoformat(token_data["created_at"].replace("Z", "+00:00"))
    if (datetime.now(timezone.utc) - created).total_seconds() > 3600:
        raise HTTPException(status_code=400, detail="Reset link has expired (1h limit)")

    user_id = token_data["user_id"]
    profile = citizen_profiles.get_profile(user_id)
    if not profile:
        raise HTTPException(status_code=404, detail="User not found")

    pw_hash = citizen_profiles.hash_password(new_password)
    citizen_profiles.update_profile(user_id, {"password_hash": pw_hash})

    token_data["used"] = True
    tokens[token] = token_data
    _save_reset_tokens(tokens)

    jwt_token = jwt_utils.sign_token(
        user_id=user_id,
        name=profile.get("name", ""),
        trust=profile.get("trust", "medium"),
    )
    logger.info(f"[AUTH] Password reset successful for user_id={user_id}")
    return {
        "ok": True,
        "token": jwt_token,
        "user_id": user_id,
        "name": profile.get("name", ""),
        "trust": profile.get("trust", "medium"),
    }


@router.post("/change-password")
async def change_password(request: Request):
    """Change password for authenticated user (requires current password)."""
    if not check_rate_limit(_get_client_ip(request)):
        raise HTTPException(status_code=429, detail="Too many requests.")

    data = await request.json()
    current_password = data.get("current_password", "")
    new_password = data.get("new_password", "")
    user_id = _get_user_id_from_request(request)

    if not user_id:
        raise HTTPException(status_code=401, detail="User identification required")
    if not current_password or not new_password:
        raise HTTPException(status_code=400, detail="current_password and new_password are required")
    if len(new_password) < 6:
        raise HTTPException(status_code=400, detail="New password must be at least 6 characters")

    profile = citizen_profiles.get_profile(user_id)
    if not profile:
        raise HTTPException(status_code=404, detail="User not found")

    pw_hash = profile.get("password_hash")
    if not pw_hash or not citizen_profiles.verify_password(current_password, pw_hash):
        raise HTTPException(status_code=401, detail="Current password is incorrect")

    new_hash = citizen_profiles.hash_password(new_password)
    citizen_profiles.update_profile(user_id, {"password_hash": new_hash})

    logger.info(f"[AUTH] Password changed for user_id={user_id}")
    return {"ok": True, "message": "Password updated successfully"}
