"""Graceful degradation system — 4-level resilience with auto-recovery.

Levels:
  0 = normal      (full parallelism)
  1 = throttled   (MAX_PARALLEL → 3, brief backoff)
  2 = degraded    (MAX_PARALLEL → 1, Claude API only)
  3 = minimal     (MAX_PARALLEL → 1, OpenAI fallback)

4-level resilience system with auto-recovery and degradation management.
"""

import time
import logging
from datetime import datetime
from typing import Optional

from runtime.orchestrator.account_balancer import all_accounts_exhausted

logger = logging.getLogger("orchestrator.degradation")

# ── Constants ───────────────────────────────────────────────────────────────

DEGRADATION_BACKOFF = {
    0: 0,      # no backoff
    1: 15,     # throttled
    2: 45,     # degraded
    3: 120,    # minimal
}

DEGRADATION_PARALLEL = {
    0: 35,  # normal (overridden by env MAX_PARALLEL)
    1: 3,   # throttled
    2: 1,   # degraded
    3: 1,   # minimal
}

DEGRADATION_THRESHOLDS = {
    "throttle_after_errors": 3,
    "degrade_after_errors": 6,
    "minimal_after_errors": 10,
    "recovery_tests_needed": 2,
}

AUTO_RECOVERY_IDLE_SECONDS = 600  # 10 minutes no errors → step down

# ── State ───────────────────────────────────────────────────────────────────

_state = {
    "level": 0,
    "since": None,
    "last_error": None,
    "last_error_at": 0,
    "error_count": 0,
    "backoff_until": 0,
    "recovery_tests": 0,
    "original_max_parallel": 35,
    "last_degradation_notif": 0,
    "_last_deadlock_recovery": 0,
}


def detect_rate_limit_error(stderr: str, stdout: str = "") -> bool:
    """Detect if Claude output indicates rate limiting or auth failure."""
    combined = (stderr + stdout).lower()

    # Strong indicators
    strong = [
        "rate limit", "rate_limit", "ratelimit",
        "429", "too many requests",
        "quota exceeded", "resource_exhausted",
        "hit your limit", "credit balance",
    ]
    if any(ind in combined for ind in strong):
        return True

    # Auth/credential errors
    auth_errors = [
        "unauthorized", "401",
        "invalid_grant", "token expired",
        "authentication failed", "not authenticated",
        "invalid credentials", "session expired",
        "no conversation found",
    ]
    if any(ind in combined for ind in auth_errors):
        return True

    # Weak indicators — only if multiple
    weak = [
        "overloaded", "capacity",
        "please try again", "temporarily unavailable",
    ]
    weak_count = sum(1 for ind in weak if ind in combined)
    return weak_count >= 2


def escalate(error_msg: Optional[str] = None, notify_fn=None):
    """Escalate degradation level based on consecutive errors."""
    thresholds = DEGRADATION_THRESHOLDS

    _state["error_count"] += 1
    _state["last_error"] = error_msg
    _state["last_error_at"] = time.time()
    _state["recovery_tests"] = 0

    old_level = _state["level"]

    if _state["error_count"] >= thresholds["minimal_after_errors"]:
        _state["level"] = 3
    elif _state["error_count"] >= thresholds["degrade_after_errors"]:
        _state["level"] = 2
    elif _state["error_count"] >= thresholds["throttle_after_errors"]:
        _state["level"] = 1

    backoff_seconds = DEGRADATION_BACKOFF.get(_state["level"], 60)
    _state["backoff_until"] = time.time() + backoff_seconds

    if _state["level"] != old_level:
        if _state["since"] is None:
            _state["since"] = datetime.now().isoformat()
        level_names = {0: "normal", 1: "throttled", 2: "degraded", 3: "minimal"}
        logger.warning(
            f"DEGRADATION: {old_level} → {_state['level']} ({level_names[_state['level']]}) "
            f"— parallel={get_effective_max_parallel()}, backoff={backoff_seconds}s"
        )

        if _state["level"] >= 2 and notify_fn:
            last_notif = _state.get("last_degradation_notif", 0)
            if time.time() - last_notif > 1800:
                _state["last_degradation_notif"] = time.time()
                try:
                    notify_fn(f"Running in degraded mode (level {_state['level']}). Responses may be slower.")
                except Exception:
                    pass


def attempt_recovery(notify_fn=None):
    """Check if we can step down from degradation after successful requests."""
    if _state["level"] == 0:
        return

    _state["recovery_tests"] += 1

    if _state["recovery_tests"] >= DEGRADATION_THRESHOLDS["recovery_tests_needed"]:
        old_level = _state["level"]
        _state["level"] = max(0, _state["level"] - 1)
        _state["error_count"] = max(0, _state["error_count"] - 3)
        _state["recovery_tests"] = 0

        if _state["level"] == 0:
            _state["since"] = None
            _state["last_error"] = None

        level_names = {0: "normal", 1: "throttled", 2: "degraded", 3: "minimal"}
        logger.info(f"RECOVERY: {old_level} → {_state['level']} ({level_names[_state['level']]})")

        if _state["level"] == 0 and notify_fn:
            try:
                notify_fn("Back to normal operation.")
            except Exception:
                pass


def check_deadlock(notify_fn=None):
    """Auto-recover from degradation deadlock.

    Two paths:
    1. MINIMAL (level 3) >30min: force-reset to THROTTLED
    2. ANY level >0 with no errors for AUTO_RECOVERY_IDLE_SECONDS: step down
    """
    if _state["level"] == 0:
        return

    # Path 2: idle recovery
    if all_accounts_exhausted():
        return
    last_err = _state.get("last_error_at", 0)
    if last_err > 0 and time.time() - last_err > AUTO_RECOVERY_IDLE_SECONDS:
        old_level = _state["level"]
        _state["level"] = max(0, _state["level"] - 1)
        _state["error_count"] = max(0, _state["error_count"] - 3)
        _state["recovery_tests"] = 0
        _state["last_error_at"] = time.time()  # Reset timer for next step-down

        level_names = {0: "normal", 1: "throttled", 2: "degraded", 3: "minimal"}
        logger.info(f"IDLE RECOVERY: {old_level} → {_state['level']} ({level_names[_state['level']]})")

        if _state["level"] == 0:
            _state["since"] = None
            _state["last_error"] = None
            if notify_fn:
                try:
                    notify_fn("Back to normal (idle auto-recovery).")
                except Exception:
                    pass
        return

    # Path 1: minimal deadlock recovery
    if _state["level"] < 3 or not _state["since"]:
        return

    try:
        since = datetime.fromisoformat(_state["since"])
        stuck_minutes = (datetime.now() - since).total_seconds() / 60
    except (ValueError, TypeError):
        return

    if stuck_minutes < 30:
        return

    last_recovery = _state.get("_last_deadlock_recovery", 0)
    if time.time() - last_recovery < 1800:
        return
    _state["_last_deadlock_recovery"] = time.time()

    _state["level"] = 1
    _state["error_count"] = 2
    _state["recovery_tests"] = 0
    _state["since"] = datetime.now().isoformat()
    _state["backoff_until"] = time.time() + 10

    logger.warning(f"DEADLOCK RECOVERY: MINIMAL for {stuck_minutes:.0f}min → reset to THROTTLED")

    if notify_fn:
        try:
            notify_fn(f"Auto-recovered from MINIMAL deadlock ({stuck_minutes:.0f}min). Reset to THROTTLED.")
        except Exception:
            pass


def is_in_backoff() -> bool:
    """Check if we're in backoff period."""
    return time.time() < _state["backoff_until"]


def get_effective_max_parallel() -> int:
    """Get current effective max parallel sessions."""
    import os
    base = int(os.environ.get("MAX_PARALLEL", _state["original_max_parallel"]))
    return DEGRADATION_PARALLEL.get(_state["level"], base)


def is_degraded() -> bool:
    """Return True if running in degraded mode (level >= 2)."""
    return _state["level"] >= 2


def get_status() -> dict:
    """Get current degradation status for display."""
    level_names = {0: "normal", 1: "throttled", 2: "degraded", 3: "minimal"}
    return {
        "level": _state["level"],
        "level_name": level_names.get(_state["level"], "unknown"),
        "since": _state["since"],
        "error_count": _state["error_count"],
        "max_parallel": get_effective_max_parallel(),
        "in_backoff": is_in_backoff(),
        "backoff_remaining": max(0, _state["backoff_until"] - time.time()),
    }
