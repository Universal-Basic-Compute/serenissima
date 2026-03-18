"""Claude Code account load balancer.

Round-robins `claude --print` calls across multiple Max accounts
by setting HOME per subprocess to point to different credential dirs.

Account dirs: ~/.claude-accounts/{a,b,...}/.claude/.credentials.json
Each dir is a minimal HOME with just the .claude/ credentials.
Shared config (settings.json) is symlinked from the real home.

Round-robins Claude Code calls across multiple Max accounts.
"""

import json
import os
import time
import threading
import logging
from pathlib import Path
from typing import Optional

logger = logging.getLogger("orchestrator.accounts")

ACCOUNTS_DIR = Path.home() / ".claude-accounts"
_lock = threading.Lock()
_counter = 0
_account_slots: list[dict] = []


def _discover_accounts() -> list[dict]:
    """Find all account dirs with valid credentials."""
    accounts = []
    if not ACCOUNTS_DIR.exists():
        return accounts

    for d in sorted(ACCOUNTS_DIR.iterdir()):
        creds = d / ".claude" / ".credentials.json"
        if creds.exists():
            try:
                data = json.loads(creds.read_text())
                oauth = data.get("claudeAiOauth", {})
                tier = oauth.get("rateLimitTier", "unknown")
                sub = oauth.get("subscriptionType", "unknown")
                exp_ms = oauth.get("expiresAt", 0)
                expired = exp_ms < time.time() * 1000
                accounts.append({
                    "id": d.name,
                    "home": str(d),
                    "creds_path": str(creds),
                    "tier": tier,
                    "subscription": sub,
                    "expired": expired,
                    "_expires_at_ms": exp_ms,
                    "active_count": 0,
                    "total_calls": 0,
                    "errors": 0,
                    "last_used": 0,
                    "_exhausted": False,
                    "_exhausted_at": 0.0,
                })
            except (json.JSONDecodeError, OSError):
                continue
    return accounts


def init() -> list[dict]:
    """Initialize account discovery. Call once at startup."""
    global _account_slots
    with _lock:
        _account_slots = _discover_accounts()
    logger.info(f"Discovered {len(_account_slots)} Claude accounts")
    return _account_slots


def rescan() -> list[dict]:
    """Re-discover accounts (picks up newly added credentials)."""
    global _account_slots
    fresh = _discover_accounts()
    with _lock:
        old_by_id = {a["id"]: a for a in _account_slots}
        merged = []
        for acct in fresh:
            if acct["id"] in old_by_id:
                old = old_by_id[acct["id"]]
                old["expired"] = acct["expired"]
                old["tier"] = acct["tier"]
                old["subscription"] = acct["subscription"]
                merged.append(old)
            else:
                merged.append(acct)
        _account_slots = merged
    return _account_slots


def get_accounts() -> list[dict]:
    """Return current account list."""
    if not _account_slots:
        init()
    return _account_slots


def get_account_env(base_env: Optional[dict] = None) -> dict:
    """Return an env dict with HOME set to the next account's home dir.

    Round-robin across available, non-expired accounts.
    Falls back to real HOME if no accounts configured.
    """
    global _counter

    if not _account_slots:
        init()

    if not _account_slots:
        env = dict(base_env or os.environ)
        return env

    # Auto-clear exhaustion after 1 hour
    now = time.time()
    now_ms = int(now * 1000)
    for a in _account_slots:
        if a.get("_exhausted") and now - a.get("_exhausted_at", 0) > 3600:
            a["_exhausted"] = False
        # Re-check expiry in real-time
        exp = a.get("_expires_at_ms", 0)
        if exp:
            a["expired"] = exp < now_ms
        elif a.get("creds_path"):
            try:
                data = json.loads(Path(a["creds_path"]).read_text())
                exp_ms = data.get("claudeAiOauth", {}).get("expiresAt", 0)
                a["_expires_at_ms"] = exp_ms
                a["expired"] = exp_ms < now_ms
            except (json.JSONDecodeError, OSError):
                pass

    # Filter to non-expired, non-exhausted accounts
    valid = [a for a in _account_slots if not a["expired"] and not a.get("_exhausted")]
    if not valid:
        valid = [a for a in _account_slots if not a.get("_exhausted")]
    if not valid:
        valid = _account_slots  # Last resort

    with _lock:
        idx = _counter % len(valid)
        _counter += 1
        account = valid[idx]
        account["active_count"] += 1
        account["total_calls"] += 1
        account["last_used"] = time.time()

    env = dict(base_env or os.environ)
    env["HOME"] = account["home"]
    env["_CLAUDE_ACCOUNT_ID"] = account["id"]
    return env


def release_account(env: dict, error: bool = False):
    """Call after a claude process finishes to update counters."""
    account_id = env.get("_CLAUDE_ACCOUNT_ID")
    if not account_id:
        return

    with _lock:
        for a in _account_slots:
            if a["id"] == account_id:
                a["active_count"] = max(0, a["active_count"] - 1)
                if error:
                    a["errors"] += 1
                break


def mark_account_exhausted(account_id: str):
    """Mark an account as exhausted (credit/quota depleted)."""
    with _lock:
        for a in _account_slots:
            if a["id"] == account_id:
                a["_exhausted"] = True
                a["_exhausted_at"] = time.time()
                logger.warning(f"Account {account_id} marked exhausted")
                break


def get_failover_env(exclude_id: str, base_env: Optional[dict] = None) -> Optional[dict]:
    """Get an account env excluding a specific account (for failover)."""
    global _counter

    if not _account_slots:
        init()

    valid = [
        a for a in _account_slots
        if not a.get("expired")
        and not a.get("_exhausted")
        and a["id"] != exclude_id
    ]

    if not valid:
        valid = [a for a in _account_slots if a["id"] != exclude_id and not a.get("_exhausted")]

    if not valid:
        return None

    with _lock:
        valid.sort(key=lambda a: a["last_used"])
        account = valid[0]
        account["active_count"] += 1
        account["total_calls"] += 1
        account["last_used"] = time.time()

    env = dict(base_env or os.environ)
    env["HOME"] = account["home"]
    env["_CLAUDE_ACCOUNT_ID"] = account["id"]
    return env


def all_accounts_exhausted() -> bool:
    """Return True if every known account is currently marked exhausted."""
    if not _account_slots:
        return False
    with _lock:
        return all(a.get("_exhausted") for a in _account_slots)


def healthy_account_count() -> int:
    """Return the number of non-exhausted, non-expired accounts."""
    if not _account_slots:
        return 0
    with _lock:
        return sum(1 for a in _account_slots if not a.get("_exhausted") and not a.get("expired"))


def status_line() -> str:
    """One-line status for display."""
    if not _account_slots:
        return "no accounts"
    parts = []
    for a in _account_slots:
        flag = "X" if a.get("_exhausted") else ("!" if a["expired"] else "")
        parts.append(f"{a['id']}{flag}:{a['total_calls']}({a['active_count']})")
    return " | ".join(parts)


def refresh_credentials(account_id: str):
    """Re-read credentials for a specific account (after token refresh)."""
    with _lock:
        for a in _account_slots:
            if a["id"] == account_id:
                creds_path = Path(a["creds_path"])
                if creds_path.exists():
                    try:
                        data = json.loads(creds_path.read_text())
                        oauth = data.get("claudeAiOauth", {})
                        a["expired"] = oauth.get("expiresAt", 0) < time.time() * 1000
                        a["tier"] = oauth.get("rateLimitTier", "unknown")
                    except (json.JSONDecodeError, OSError):
                        pass
                break
