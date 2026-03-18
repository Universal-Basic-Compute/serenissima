"""
Health Checks: flag-errors

Decorator-based health checks for error log monitoring.
Source: capabilities/flag-errors/runtime/checks.py

DOCS: capabilities/flag-errors/HEALTH.md
"""

import hashlib
import re
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

# Import from MCP's capability runtime infrastructure
from runtime.capability import check, Signal, triggers


# =============================================================================
# CONFIGURATION
# =============================================================================

# Patterns for normalizing error messages
UUID_PATTERN = re.compile(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', re.I)
TIMESTAMP_PATTERN = re.compile(r'\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}')
NUMBER_PATTERN = re.compile(r'\b\d{4,}\b')  # Numbers with 4+ digits
PATH_PATTERN = re.compile(r'/(?:home|users|tmp)/[^\s]+', re.I)

# Error level patterns
ERROR_LEVELS = {"ERROR", "CRITICAL", "FATAL", "EXCEPTION"}

# Default thresholds
SPIKE_THRESHOLD = 10  # 10x baseline
STALE_THRESHOLD_DAYS = 7
RESOLUTION_QUIET_HOURS = 24


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def normalize_message(message: str) -> str:
    """Normalize error message by stripping variable data."""
    result = message
    result = UUID_PATTERN.sub("{UUID}", result)
    result = TIMESTAMP_PATTERN.sub("{TS}", result)
    result = NUMBER_PATTERN.sub("{N}", result)
    result = PATH_PATTERN.sub("{PATH}", result)
    return result.strip()


def extract_stack_signature(stack_trace: Optional[str]) -> str:
    """Extract top 3 frames from stack trace as signature."""
    if not stack_trace:
        return ""

    # Extract frame lines (e.g., "  File \"...\", line N, in func")
    frame_pattern = re.compile(r'File "([^"]+)", line (\d+), in (\w+)')
    frames = frame_pattern.findall(stack_trace)

    # Take top 3 frames, normalize paths
    signature_parts = []
    for file_path, line, func in frames[:3]:
        # Keep only filename, not full path
        filename = Path(file_path).name
        signature_parts.append(f"{filename}:{func}")

    return "|".join(signature_parts)


def compute_fingerprint(error_type: str, message: str, stack_trace: Optional[str] = None) -> str:
    """Compute stable fingerprint for error deduplication."""
    normalized = normalize_message(message)
    signature = extract_stack_signature(stack_trace)
    combined = f"{error_type}|{normalized}|{signature}"
    return hashlib.sha256(combined.encode()).hexdigest()[:16]


def parse_error_line(line: str) -> Optional[dict]:
    """Parse a log line and extract error info if it's an error."""
    # Common log format: [TIMESTAMP] [LEVEL] message
    level_pattern = re.compile(r'\[(ERROR|CRITICAL|FATAL|EXCEPTION)\]', re.I)
    match = level_pattern.search(line)

    if not match:
        return None

    level = match.group(1).upper()

    # Extract timestamp if present
    ts_match = TIMESTAMP_PATTERN.search(line)
    timestamp = ts_match.group(0) if ts_match else None

    # Message is everything after the level
    message_start = match.end()
    message = line[message_start:].strip()

    return {
        "level": level,
        "message": message,
        "timestamp": timestamp,
        "raw_line": line,
    }


def get_watched_log_paths() -> list:
    """Get list of log file paths being watched."""
    # Default: watch common log locations
    patterns = [
        "logs/**/*.log",
        "*.log",
        "log/*.log",
    ]

    paths = []
    for pattern in patterns:
        paths.extend(Path(".").glob(pattern))

    return [p for p in paths if p.is_file()]


def get_known_fingerprints() -> set:
    """Get set of fingerprints that already have open tasks."""
    # In real implementation, this queries the graph
    # For now, return empty set (all errors are new)
    state_file = Path(".mind/state/error_fingerprints.txt")
    if state_file.exists():
        return set(state_file.read_text().strip().split("\n"))
    return set()


def save_fingerprint(fingerprint: str):
    """Record a fingerprint as having an open task."""
    state_file = Path(".mind/state/error_fingerprints.txt")
    state_file.parent.mkdir(parents=True, exist_ok=True)

    existing = get_known_fingerprints()
    existing.add(fingerprint)

    state_file.write_text("\n".join(sorted(existing)))


# =============================================================================
# HEALTH CHECKS
# =============================================================================

@check(
    id="new_errors",
    triggers=[
        triggers.file.on_modify("logs/**/*.log"),
        triggers.file.on_modify("*.log"),
        triggers.cron.every(minutes=5),
    ],
    on_problem="NEW_ERROR",
    task="TASK_investigate_error",
)
def new_errors(ctx) -> dict:
    """
    Detect new errors in watched log files.

    Returns CRITICAL if new error found (creates investigation task).
    Returns HEALTHY if no new errors.
    """
    known_fingerprints = get_known_fingerprints()
    new_fingerprints = []

    for log_path in get_watched_log_paths():
        try:
            content = log_path.read_text()
        except Exception:
            continue

        for line in content.split("\n"):
            error_info = parse_error_line(line)
            if not error_info:
                continue

            fingerprint = compute_fingerprint(
                error_info["level"],
                error_info["message"],
            )

            if fingerprint not in known_fingerprints:
                new_fingerprints.append({
                    "fingerprint": fingerprint,
                    "level": error_info["level"],
                    "message": error_info["message"][:200],  # Truncate for display
                    "log_path": str(log_path),
                })
                known_fingerprints.add(fingerprint)
                save_fingerprint(fingerprint)

    if not new_fingerprints:
        return Signal.healthy()

    return Signal.critical(
        new_errors=new_fingerprints,
        count=len(new_fingerprints),
    )


@check(
    id="error_spike",
    triggers=[
        triggers.cron.every(minutes=15),
    ],
    on_problem="ERROR_SPIKE",
    task=None,  # Escalates existing task, doesn't create new one
)
def error_spike(ctx) -> dict:
    """
    Detect error rate spikes (10x baseline).

    Returns CRITICAL if any fingerprint is spiking.
    Returns HEALTHY if rates are normal.
    """
    # Track error counts per fingerprint
    error_counts = {}  # fingerprint -> count in last hour

    for log_path in get_watched_log_paths():
        try:
            content = log_path.read_text()
        except Exception:
            continue

        for line in content.split("\n"):
            error_info = parse_error_line(line)
            if not error_info:
                continue

            # Check if timestamp is within last hour
            if error_info.get("timestamp"):
                try:
                    ts = datetime.fromisoformat(error_info["timestamp"].replace(" ", "T"))
                    if datetime.now() - ts > timedelta(hours=1):
                        continue  # Skip old errors
                except ValueError:
                    pass  # Can't parse timestamp, include it

            fingerprint = compute_fingerprint(
                error_info["level"],
                error_info["message"],
            )
            error_counts[fingerprint] = error_counts.get(fingerprint, 0) + 1

    # Check for spikes (simplified: >100 errors/hour is a spike)
    spikes = []
    for fingerprint, count in error_counts.items():
        if count > 100:  # Threshold for spike
            spikes.append({
                "fingerprint": fingerprint,
                "count_last_hour": count,
            })

    if not spikes:
        return Signal.healthy()

    return Signal.critical(
        spikes=spikes,
        count=len(spikes),
    )


@check(
    id="watch_coverage",
    triggers=[
        triggers.cron.daily(),
        triggers.file.on_create("**/*.log"),
    ],
    on_problem="UNMONITORED_LOGS",
    task="TASK_configure_watch",
)
def watch_coverage(ctx) -> dict:
    """
    Check all log files are being monitored.

    Returns DEGRADED if unmonitored logs found.
    Returns HEALTHY if all logs covered.
    """
    # Find all log files in the project
    all_logs = list(Path(".").rglob("*.log"))

    # Filter out node_modules, .git, etc.
    exclude_dirs = {".git", "node_modules", "__pycache__", ".venv", "venv"}
    all_logs = [
        p for p in all_logs
        if not any(excluded in p.parts for excluded in exclude_dirs)
    ]

    # Get watched paths
    watched = set(get_watched_log_paths())

    # Find unmonitored
    unmonitored = [str(p) for p in all_logs if p not in watched]

    if not unmonitored:
        return Signal.healthy()

    return Signal.degraded(
        unmonitored_logs=unmonitored,
        count=len(unmonitored),
    )


@check(
    id="stale_errors",
    triggers=[
        triggers.cron.daily(),
    ],
    on_problem="STALE_ERROR_TASK",
    task=None,  # Advisory only
)
def stale_errors(ctx) -> dict:
    """
    Find error fingerprints that have been known for too long.

    Returns DEGRADED if stale errors found.
    Returns HEALTHY if all errors are being addressed.
    """
    # Check when fingerprints were first seen
    state_file = Path(".mind/state/error_first_seen.txt")
    if not state_file.exists():
        return Signal.healthy()

    stale = []
    now = datetime.now()

    for line in state_file.read_text().strip().split("\n"):
        if not line:
            continue
        parts = line.split(":", 1)
        if len(parts) != 2:
            continue

        fingerprint, timestamp_str = parts
        try:
            first_seen = datetime.fromisoformat(timestamp_str)
            age_days = (now - first_seen).days

            if age_days > STALE_THRESHOLD_DAYS:
                stale.append({
                    "fingerprint": fingerprint,
                    "age_days": age_days,
                })
        except ValueError:
            continue

    if not stale:
        return Signal.healthy()

    return Signal.degraded(
        stale_errors=stale,
        count=len(stale),
    )


# =============================================================================
# REGISTRY
# =============================================================================

CHECKS = [
    new_errors,
    error_spike,
    watch_coverage,
    stale_errors,
]
