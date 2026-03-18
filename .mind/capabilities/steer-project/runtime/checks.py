"""
Health Checks: steer-project

Decorator-based health checks for project steering.
Source: capabilities/steer-project/runtime/checks.py

DOCS: capabilities/steer-project/HEALTH.md
"""

import os
import re
import subprocess
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Optional

from runtime.capability import check, Signal, triggers


# =============================================================================
# DATA STRUCTURES
# =============================================================================

@dataclass
class EscalationMarker:
    location: str  # file:line
    content: str
    created: datetime
    status: str  # open, resolved


@dataclass
class SteeringSession:
    timestamp: datetime
    findings_count: int


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def find_sync_files() -> List[Path]:
    """Find all SYNC files in the project."""
    patterns = [
        "**/SYNC*.md",
        ".mind/state/SYNC*.md",
    ]
    files = []
    for pattern in patterns:
        files.extend(Path(".").glob(pattern))

    # Filter out excluded directories
    exclude_dirs = {".git", "node_modules", "__pycache__", ".venv", "venv"}
    return [
        p for p in files
        if not any(excluded in p.parts for excluded in exclude_dirs)
    ]


def get_file_age_days(path: Path) -> int:
    """Get age of file in days based on mtime."""
    try:
        mtime = path.stat().st_mtime
        age = datetime.now() - datetime.fromtimestamp(mtime)
        return age.days
    except Exception:
        return 999  # Treat errors as very old


def find_escalation_markers() -> List[EscalationMarker]:
    """Find all @mind:escalation markers in the codebase."""
    markers = []

    try:
        # Use grep to find markers efficiently
        result = subprocess.run(
            ["grep", "-rn", "@mind:escalation", "."],
            capture_output=True,
            text=True,
            timeout=30,
        )

        for line in result.stdout.strip().split("\n"):
            if not line:
                continue

            # Parse grep output: file:line:content
            parts = line.split(":", 2)
            if len(parts) >= 3:
                file_path = parts[0]
                line_num = parts[1]
                content = parts[2].strip()

                # Skip excluded directories
                if any(d in file_path for d in [".git", "node_modules", "__pycache__"]):
                    continue

                # Get file mtime as proxy for marker creation
                try:
                    mtime = datetime.fromtimestamp(os.path.getmtime(file_path))
                except Exception:
                    mtime = datetime.now()

                markers.append(EscalationMarker(
                    location=f"{file_path}:{line_num}",
                    content=content,
                    created=mtime,
                    status="open",  # Would need tracking to know if resolved
                ))
    except Exception:
        pass

    return markers


def get_last_steering_session() -> Optional[SteeringSession]:
    """Get the most recent steering session."""
    state_file = Path(".mind/state/steering_sessions.txt")
    if not state_file.exists():
        return None

    try:
        lines = state_file.read_text().strip().split("\n")
        if not lines or not lines[-1]:
            return None

        # Format: timestamp:findings_count
        parts = lines[-1].split(":")
        if len(parts) >= 2:
            return SteeringSession(
                timestamp=datetime.fromisoformat(parts[0]),
                findings_count=int(parts[1]),
            )
    except Exception:
        pass

    return None


def get_recent_commits(days: int) -> List[str]:
    """Get commits from the past N days."""
    try:
        result = subprocess.run(
            ["git", "log", f"--since={days} days ago", "--oneline"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        commits = result.stdout.strip().split("\n")
        return [c for c in commits if c]
    except Exception:
        return []


def get_active_tasks() -> List[str]:
    """Get currently active tasks."""
    # Would query graph/state for real implementation
    # For now, check for task_run files
    task_files = list(Path(".mind/state").glob("task_*.txt"))
    return [str(f) for f in task_files]


# =============================================================================
# HEALTH CHECKS
# =============================================================================

@check(
    id="steering_due",
    triggers=[
        triggers.cron.weekly(),
    ],
    on_problem="STEERING_DUE",
    task="TASK_steering_session",
)
def steering_due(ctx) -> dict:
    """
    Check if steering session is overdue.

    Returns DEGRADED if no session in past week.
    Returns HEALTHY if recent session exists.
    """
    last_session = get_last_steering_session()

    if last_session is None:
        return Signal.degraded(
            message="No steering session on record",
            suggested_action="Run initial steering session",
        )

    days_since = (datetime.now() - last_session.timestamp).days

    if days_since > 7:
        return Signal.degraded(
            days_since_session=days_since,
            message=f"Steering session overdue by {days_since - 7} days",
        )

    return Signal.healthy(
        last_session=last_session.timestamp.isoformat(),
        days_since=days_since,
    )


@check(
    id="stale_sync",
    triggers=[
        triggers.cron.daily(),
    ],
    on_problem="STALE_SYNC",
    task="TASK_update_sync",
)
def stale_sync(ctx) -> dict:
    """
    Find SYNC files that haven't been updated recently.

    Returns CRITICAL if any SYNC > 30 days old.
    Returns DEGRADED if any SYNC > 7 days old.
    Returns HEALTHY if all SYNC files fresh.
    """
    sync_files = find_sync_files()
    stale = []
    critical = []

    for sync_file in sync_files:
        age_days = get_file_age_days(sync_file)

        if age_days > 30:
            critical.append({
                "file": str(sync_file),
                "age_days": age_days,
            })
        elif age_days > 7:
            stale.append({
                "file": str(sync_file),
                "age_days": age_days,
            })

    if critical:
        return Signal.critical(
            critical_files=critical,
            stale_files=stale,
            total_count=len(critical) + len(stale),
        )

    if stale:
        return Signal.degraded(
            stale_files=stale,
            count=len(stale),
        )

    return Signal.healthy(
        sync_files_checked=len(sync_files),
    )


@check(
    id="unprocessed_escalations",
    triggers=[
        triggers.cron.daily(),
        triggers.git.post_commit(),
    ],
    on_problem="UNPROCESSED_ESCALATION",
    task="TASK_process_escalation",
)
def unprocessed_escalations(ctx) -> dict:
    """
    Find @mind:escalation markers that need attention.

    Returns CRITICAL if any escalation > 7 days old.
    Returns DEGRADED if any escalation > 3 days old.
    Returns HEALTHY if no old escalations.
    """
    escalations = find_escalation_markers()
    now = datetime.now()
    critical = []
    aging = []

    for esc in escalations:
        if esc.status != "open":
            continue

        age_days = (now - esc.created).days

        if age_days > 7:
            critical.append({
                "location": esc.location,
                "age_days": age_days,
                "content": esc.content[:100],
            })
        elif age_days > 3:
            aging.append({
                "location": esc.location,
                "age_days": age_days,
                "content": esc.content[:100],
            })

    if critical:
        return Signal.critical(
            critical_escalations=critical,
            aging_escalations=aging,
            total_count=len(critical) + len(aging),
        )

    if aging:
        return Signal.degraded(
            aging_escalations=aging,
            count=len(aging),
        )

    return Signal.healthy(
        escalations_found=len(escalations),
    )


@check(
    id="project_momentum",
    triggers=[
        triggers.cron.weekly(),
    ],
    on_problem="PROJECT_STALLED",
    task="TASK_steering_session",
)
def project_momentum(ctx) -> dict:
    """
    Check if project has active work.

    Returns DEGRADED if no commits/tasks in past week.
    Returns HEALTHY if active work ongoing.
    """
    recent_commits = get_recent_commits(days=7)
    active_tasks = get_active_tasks()

    if len(recent_commits) == 0 and len(active_tasks) == 0:
        return Signal.degraded(
            message="No activity in past week",
            recent_commits=0,
            active_tasks=0,
            suggested_action="Review project priorities",
        )

    return Signal.healthy(
        recent_commits=len(recent_commits),
        active_tasks=len(active_tasks),
    )


# =============================================================================
# REGISTRY
# =============================================================================

CHECKS = [
    steering_due,
    stale_sync,
    unprocessed_escalations,
    project_momentum,
]
