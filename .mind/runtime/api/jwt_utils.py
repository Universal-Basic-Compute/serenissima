"""
JWT authentication utility for Mind Protocol.

Signs and verifies HS256 JWT tokens for user authentication.
Secret key stored at config/jwt_secret.key (auto-generated if missing).
"""

import os
import time
import secrets
from pathlib import Path

import jwt

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
SECRET_KEY_PATH = PROJECT_ROOT / "config" / "jwt_secret.key"

ALGORITHM = "HS256"


def _get_secret_key() -> str:
    """Load or generate the JWT secret key (256-bit random, hex-encoded)."""
    if SECRET_KEY_PATH.exists():
        key = SECRET_KEY_PATH.read_text().strip()
        if key:
            return key

    key = secrets.token_hex(32)
    SECRET_KEY_PATH.parent.mkdir(parents=True, exist_ok=True)
    SECRET_KEY_PATH.write_text(key)
    os.chmod(SECRET_KEY_PATH, 0o600)
    return key


def sign_token(user_id: str, name: str, trust: str, expiry_hours: int = 24) -> str:
    """Create a signed JWT token."""
    now = int(time.time())
    payload = {
        "sub": user_id,
        "name": name,
        "trust": trust,
        "iat": now,
        "exp": now + (expiry_hours * 3600),
    }
    return jwt.encode(payload, _get_secret_key(), algorithm=ALGORITHM)


def verify_token(token: str) -> dict | None:
    """Verify and decode a JWT token. Returns payload dict or None."""
    try:
        return jwt.decode(token, _get_secret_key(), algorithms=[ALGORITHM])
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        return None


def refresh_token(token: str) -> str | None:
    """Refresh a valid JWT token with a new expiry window."""
    payload = verify_token(token)
    if payload is None:
        return None
    return sign_token(
        user_id=payload["sub"],
        name=payload["name"],
        trust=payload["trust"],
    )
