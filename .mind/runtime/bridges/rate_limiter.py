"""Rate limiter — prevents spam floods across bridges.

Detects: rapid fire, emoji walls, repeated patterns.
Shared by Telegram and WhatsApp bridges.
"""

import re
import time
from collections import Counter, defaultdict

# Per-user message timestamps
_rate_limit_window: dict[str, list[float]] = defaultdict(list)

# Config
RATE_LIMIT_WINDOW = 60       # seconds
RATE_LIMIT_MAX_MESSAGES = 24  # per window per user
RATE_LIMIT_BURST = 10         # max in burst window
RATE_LIMIT_BURST_WINDOW = 5   # seconds
SPAM_MAX_EMOJI_RATIO = 0.7
SPAM_MAX_REPEAT_RATIO = 0.5
SPAM_MIN_LENGTH_CHECK = 20

# User IDs that bypass rate limiting (owner, cofounders)
_bypass_ids: set[str] = set()

_EMOJI_PATTERN = re.compile(
    r'[\U0001F600-\U0001F64F\U0001F300-\U0001F5FF\U0001F680-\U0001F6FF'
    r'\U0001F1E0-\U0001F1FF\U00002702-\U000027B0\U0000FE00-\U0000FE0F'
    r'\U0001FA00-\U0001FA6F\U0001FA70-\U0001FAFF\U00002600-\U000026FF'
    r'\U0000200D\U0000FE0F\U00002640\U00002642\U0000231A-\U0000231B'
    r'\U00002328\U000023CF\U000023E9-\U000023F3\U000023F8-\U000023FA'
    r'\U000025AA-\U000025AB\U000025B6\U000025C0\U000025FB-\U000025FE'
    r'\U00002934-\U00002935\U00002B05-\U00002B07\U00002B1B-\U00002B1C'
    r'\U00002B50\U00002B55\U00003030\U0000303D\U00003297\U00003299'
    r'\U0001F900-\U0001F9FF\U0001FA00-\U0001FAFF]+'
)


def set_bypass_ids(user_ids: set[str]):
    """Set user IDs that bypass rate limiting (e.g., owner)."""
    global _bypass_ids
    _bypass_ids = user_ids


def _is_spam_content(text: str) -> str | None:
    """Check if message content looks like spam. Returns reason or None."""
    if not text or len(text) < SPAM_MIN_LENGTH_CHECK:
        return None

    emoji_chars = sum(len(m.group()) for m in _EMOJI_PATTERN.finditer(text))
    text_len = len(text.replace(' ', '').replace('\n', ''))
    if text_len > 0 and emoji_chars / text_len > SPAM_MAX_EMOJI_RATIO:
        return f"emoji flood ({emoji_chars}/{text_len} chars)"

    stripped = text.replace(' ', '').replace('\n', '')
    if len(stripped) > SPAM_MIN_LENGTH_CHECK:
        char_counts = Counter(stripped)
        most_common_char, most_common_count = char_counts.most_common(1)[0]
        if most_common_count / len(stripped) > SPAM_MAX_REPEAT_RATIO:
            return f"repeated char '{most_common_char}' ({most_common_count}x)"

        for sub_len in range(2, min(9, len(stripped) // 3)):
            sub = stripped[:sub_len]
            repeats = stripped.count(sub)
            if repeats * sub_len / len(stripped) > SPAM_MAX_REPEAT_RATIO:
                return f"repeated pattern '{sub[:10]}' ({repeats}x)"

    return None


def check_rate_limit(user_id: str, text: str = "") -> str | None:
    """Check if user is rate-limited. Returns rejection reason or None (OK)."""
    if user_id in _bypass_ids:
        return None

    now = time.time()
    window = _rate_limit_window[user_id]

    # Clean old entries
    cutoff = now - RATE_LIMIT_WINDOW
    window[:] = [t for t in window if t > cutoff]

    # Burst check
    burst_cutoff = now - RATE_LIMIT_BURST_WINDOW
    burst_count = sum(1 for t in window if t > burst_cutoff)
    if burst_count >= RATE_LIMIT_BURST:
        return f"burst limit ({burst_count} msgs in {RATE_LIMIT_BURST_WINDOW}s)"

    # Window check
    if len(window) >= RATE_LIMIT_MAX_MESSAGES:
        return f"rate limit ({len(window)} msgs in {RATE_LIMIT_WINDOW}s)"

    # Content spam check
    spam_reason = _is_spam_content(text)
    if spam_reason:
        return spam_reason

    # Record
    window.append(now)
    return None
