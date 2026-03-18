"""
Citizen profile management for Mind Protocol.

Profiles stored as append-only JSONL at shrine/state/citizen_profiles.jsonl.
Latest entry per user_id is the current state.
"""

import json
import os
import time
import uuid
from pathlib import Path

import bcrypt

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
PROFILES_PATH = PROJECT_ROOT / "shrine" / "state" / "citizen_profiles.jsonl"


def _load_all_profiles() -> dict[str, dict]:
    """Load all profiles, latest entry per user_id wins."""
    profiles: dict[str, dict] = {}
    if not PROFILES_PATH.exists():
        return profiles
    for line in PROFILES_PATH.read_text().splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            entry = json.loads(line)
            uid = entry.get("user_id")
            if uid:
                profiles[uid] = entry
        except json.JSONDecodeError:
            continue
    return profiles


def _append_profile(profile: dict) -> None:
    """Append a profile entry to the JSONL file."""
    PROFILES_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(PROFILES_PATH, "a") as f:
        f.write(json.dumps(profile, ensure_ascii=False) + "\n")


def hash_password(password: str) -> str:
    """Hash a plaintext password using bcrypt."""
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    """Verify a plaintext password against a bcrypt hash."""
    return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))


def get_profile(user_id: str) -> dict | None:
    """Retrieve the current profile for a user."""
    return _load_all_profiles().get(user_id)


def create_profile(
    user_id: str,
    name: str,
    email: str | None = None,
    trust: str = "medium",
    linked_accounts: dict | None = None,
) -> dict:
    """Create a new citizen profile."""
    now = time.time()
    profile = {
        "user_id": user_id,
        "profile_id": str(uuid.uuid4()),
        "name": name,
        "email": email,
        "trust": trust,
        "linked_accounts": linked_accounts or {},
        "created_at": now,
        "updated_at": now,
    }
    _append_profile(profile)
    return profile


def update_profile(user_id: str, updates: dict) -> dict | None:
    """Update an existing profile. Immutable fields protected."""
    current = get_profile(user_id)
    if current is None:
        return None
    immutable = {"user_id", "profile_id", "created_at"}
    for key in immutable:
        updates.pop(key, None)
    current.update(updates)
    current["updated_at"] = time.time()
    _append_profile(current)
    return current


def get_profile_by_email(email: str) -> dict | None:
    """Look up a profile by email address."""
    if email is None:
        return None
    for profile in _load_all_profiles().values():
        if profile.get("email") == email:
            return profile
    return None


def list_profiles() -> list[dict]:
    """Return all current profiles (latest state per user)."""
    return list(_load_all_profiles().values())
