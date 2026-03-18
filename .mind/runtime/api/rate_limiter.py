"""
In-memory IP-based rate limiter for HTTP API endpoints.

Simple sliding window counter. No external dependencies.
"""

import threading
import time

RATE_LIMIT_WINDOW = 60  # seconds
RATE_LIMIT_MAX_REQUESTS = 30
MAX_TRACKED_IPS = 1000

_store: dict[str, list[float]] = {}
_lock = threading.Lock()


def check_rate_limit(ip: str, limit: int = RATE_LIMIT_MAX_REQUESTS) -> bool:
    """Return True if request is allowed, False if rate limited."""
    now = time.time()
    cutoff = now - RATE_LIMIT_WINDOW
    with _lock:
        timestamps = _store.get(ip, [])
        timestamps = [t for t in timestamps if t > cutoff]
        if len(timestamps) >= limit:
            _store[ip] = timestamps
            return False
        timestamps.append(now)
        _store[ip] = timestamps
        if len(_store) > MAX_TRACKED_IPS:
            _store.clear()
        return True
