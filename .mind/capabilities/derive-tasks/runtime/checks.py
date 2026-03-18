"""
Health Checks: derive-tasks

Decorator-based health checks for vision-to-task derivation.
Source: capabilities/derive-tasks/runtime/checks.py

DOCS: capabilities/derive-tasks/HEALTH.md
"""

import re
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Optional

from runtime.capability import check, Signal, triggers


# =============================================================================
# DATA STRUCTURES
# =============================================================================

@dataclass
class VisionObjective:
    id: str
    statement: str
    source_file: Path
    priority: str = "medium"
    status: str = "active"


@dataclass
class ObjectiveCoverage:
    objective_id: str
    total_tasks: int
    completed_tasks: int
    in_progress_tasks: int
    coverage_score: float


# =============================================================================
# VISION DOC PARSING
# =============================================================================

VISION_PATTERNS = [
    "**/OBJECTIVES*.md",
    "**/vision*.md",
    "**/roadmap*.md",
    "**/goals*.md",
]


def find_vision_docs() -> List[Path]:
    """Find all vision documents in the project."""
    docs = []
    for pattern in VISION_PATTERNS:
        docs.extend(Path(".").glob(pattern))

    # Filter out node_modules, .git, etc.
    exclude_dirs = {".git", "node_modules", "__pycache__", ".venv", "venv"}
    return [
        p for p in docs
        if not any(excluded in p.parts for excluded in exclude_dirs)
    ]


def parse_objectives_from_markdown(file: Path) -> List[VisionObjective]:
    """Extract objectives from a markdown file."""
    try:
        content = file.read_text()
    except Exception:
        return []

    objectives = []
    stem = file.stem.replace("OBJECTIVES_", "").replace("OBJECTIVES", "main")

    # Strategy 1: Ranked objectives (O1:, O2:, etc.)
    ranked_pattern = re.compile(r"#+\s*O(\d+)[:\s]+([^\n]+)", re.MULTILINE)
    for match in ranked_pattern.finditer(content):
        rank = int(match.group(1))
        statement = match.group(2).strip()
        priority = "critical" if rank == 1 else "high" if rank <= 3 else "medium"
        objectives.append(VisionObjective(
            id=f"{stem}_O{rank}",
            statement=statement,
            source_file=file,
            priority=priority,
        ))

    # Strategy 2: Bullet points under "Objectives" or "Goals" header
    header_pattern = re.compile(r"##\s*(Objectives|Goals)\s*\n((?:\s*[-*]\s+[^\n]+\n?)+)", re.MULTILINE | re.IGNORECASE)
    for match in header_pattern.finditer(content):
        bullets_text = match.group(2)
        bullets = re.findall(r"[-*]\s+([^\n]+)", bullets_text)
        for i, bullet in enumerate(bullets):
            # Skip if already captured as ranked objective
            if any(bullet.strip() in obj.statement for obj in objectives):
                continue
            objectives.append(VisionObjective(
                id=f"{stem}_goal_{i+1}",
                statement=bullet.strip(),
                source_file=file,
            ))

    return objectives


def get_all_objectives() -> List[VisionObjective]:
    """Get all vision objectives from all docs."""
    objectives = []
    for doc in find_vision_docs():
        objectives.extend(parse_objectives_from_markdown(doc))
    return objectives


# =============================================================================
# STATE TRACKING
# =============================================================================

def get_objective_state_file() -> Path:
    """Get path to objective state tracking file."""
    return Path(".mind/state/objective_tasks.txt")


def get_tasks_for_objective(objective_id: str) -> List[str]:
    """Get task IDs linked to an objective."""
    state_file = get_objective_state_file()
    if not state_file.exists():
        return []

    tasks = []
    for line in state_file.read_text().strip().split("\n"):
        if not line:
            continue
        parts = line.split(":", 1)
        if len(parts) == 2 and parts[0] == objective_id:
            tasks.append(parts[1])
    return tasks


def get_last_task_activity(objective_id: str) -> Optional[datetime]:
    """Get timestamp of last task activity for objective."""
    activity_file = Path(".mind/state/objective_activity.txt")
    if not activity_file.exists():
        return None

    for line in activity_file.read_text().strip().split("\n"):
        if not line:
            continue
        parts = line.split(":", 1)
        if len(parts) == 2 and parts[0] == objective_id:
            try:
                return datetime.fromisoformat(parts[1])
            except ValueError:
                return None
    return None


def analyze_coverage(objective: VisionObjective) -> ObjectiveCoverage:
    """Analyze task coverage for an objective."""
    tasks = get_tasks_for_objective(objective.id)
    total = len(tasks)

    # Simplified: assume all tasks are in progress
    # Real implementation would query task status
    completed = 0
    in_progress = total

    if total == 0:
        score = 0.0
    else:
        score = (completed + 0.5 * in_progress) / total

    return ObjectiveCoverage(
        objective_id=objective.id,
        total_tasks=total,
        completed_tasks=completed,
        in_progress_tasks=in_progress,
        coverage_score=score,
    )


# =============================================================================
# HEALTH CHECKS
# =============================================================================

@check(
    id="orphan_objectives",
    triggers=[
        triggers.file.on_modify("**/OBJECTIVES*.md"),
        triggers.file.on_modify("**/vision*.md"),
        triggers.file.on_modify("**/roadmap*.md"),
        triggers.cron.daily(),
    ],
    on_problem="ORPHAN_OBJECTIVE",
    task="TASK_derive_tasks",
)
def orphan_objectives(ctx) -> dict:
    """
    Find vision objectives that have no linked tasks.

    Returns CRITICAL if orphans found.
    Returns HEALTHY if all objectives have tasks.
    """
    objectives = get_all_objectives()
    orphans = []

    for obj in objectives:
        tasks = get_tasks_for_objective(obj.id)
        if len(tasks) == 0:
            orphans.append({
                "id": obj.id,
                "statement": obj.statement[:100],
                "source": str(obj.source_file),
                "priority": obj.priority,
            })

    if not orphans:
        return Signal.healthy()

    return Signal.critical(
        orphan_objectives=orphans,
        count=len(orphans),
    )


@check(
    id="low_coverage",
    triggers=[
        triggers.cron.daily(),
    ],
    on_problem="LOW_COVERAGE",
    task="TASK_derive_tasks",
)
def low_coverage(ctx) -> dict:
    """
    Find objectives with coverage below threshold.

    Returns DEGRADED if low coverage found.
    Returns HEALTHY if coverage adequate.
    """
    threshold = 0.5
    low = []

    for obj in get_all_objectives():
        # Skip objectives that are orphans (handled by other check)
        tasks = get_tasks_for_objective(obj.id)
        if len(tasks) == 0:
            continue

        coverage = analyze_coverage(obj)
        if coverage.coverage_score < threshold:
            low.append({
                "id": obj.id,
                "statement": obj.statement[:100],
                "coverage": f"{coverage.coverage_score:.0%}",
                "tasks": coverage.total_tasks,
            })

    if not low:
        return Signal.healthy()

    return Signal.degraded(
        low_coverage_objectives=low,
        count=len(low),
    )


@check(
    id="stale_objectives",
    triggers=[
        triggers.cron.weekly(),
    ],
    on_problem="STALE_COVERAGE",
    task="TASK_assess_objective",
)
def stale_objectives(ctx) -> dict:
    """
    Find objectives with no recent task activity.

    Returns DEGRADED if stale objectives found.
    Returns HEALTHY if all have recent activity.
    """
    stale_days = 30
    now = datetime.now()
    stale = []

    for obj in get_all_objectives():
        # Skip orphans
        tasks = get_tasks_for_objective(obj.id)
        if len(tasks) == 0:
            continue

        last_activity = get_last_task_activity(obj.id)
        if last_activity is None:
            # No activity recorded, consider stale
            stale.append({
                "id": obj.id,
                "statement": obj.statement[:100],
                "days_since_activity": "unknown",
            })
            continue

        days_since = (now - last_activity).days
        if days_since > stale_days:
            stale.append({
                "id": obj.id,
                "statement": obj.statement[:100],
                "days_since_activity": days_since,
            })

    if not stale:
        return Signal.healthy()

    return Signal.degraded(
        stale_objectives=stale,
        count=len(stale),
    )


@check(
    id="vision_sync",
    triggers=[
        triggers.file.on_modify("**/OBJECTIVES*.md"),
        triggers.file.on_create("**/vision*.md"),
        triggers.init.after_scan(),
    ],
    on_problem="VISION_DESYNC",
    task=None,  # Informational only
)
def vision_sync(ctx) -> dict:
    """
    Report on vision document coverage.

    Returns summary of vision docs found and objectives parsed.
    """
    vision_docs = find_vision_docs()
    all_objectives = get_all_objectives()

    summary = {
        "vision_docs_found": len(vision_docs),
        "objectives_parsed": len(all_objectives),
        "docs": [str(d) for d in vision_docs],
    }

    if len(vision_docs) == 0:
        return Signal.degraded(
            message="No vision docs found",
            **summary,
        )

    return Signal.healthy(**summary)


# =============================================================================
# REGISTRY
# =============================================================================

CHECKS = [
    orphan_objectives,
    low_coverage,
    stale_objectives,
    vision_sync,
]
