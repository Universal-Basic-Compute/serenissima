"""
Health Checks: monitor-agents

Cron-based health checks for agent and task monitoring.
Source: capabilities/monitor-agents/runtime/checks.py

DOCS: docs/capabilities/monitor-agents/ALGORITHM.md
"""

import time
from typing import List, Dict, Any

from runtime.capability import check, Signal, triggers

# =============================================================================
# THRESHOLDS
# =============================================================================

STUCK_THRESHOLD = 5 * 60       # 5 minutes - warning
DEAD_THRESHOLD = 15 * 60       # 15 minutes - critical
TASK_WARN_THRESHOLD = 60 * 60  # 1 hour - warning
TASK_RELEASE_THRESHOLD = 2 * 60 * 60  # 2 hours - release


# =============================================================================
# HEALTH CHECKS
# =============================================================================

@check(
    id="agent_health",
    triggers=[
        triggers.cron.every("60s"),
    ],
    on_problem=["AGENT_STUCK", "AGENT_DEAD"],
    task="TASK_cleanup_dead_agent",
)
def agent_health(ctx) -> List[Dict[str, Any]]:
    """
    H1: Check all running agents for heartbeat health.

    Scans all actors with status=running and checks last_heartbeat.
    Returns list of problems found.
    """
    now = time.time()
    problems = []

    # Query all running agents
    agents = ctx.query_nodes(
        node_type="actor",
        filters={"status": "running"}
    )

    for agent in agents:
        last_heartbeat = agent.get("last_heartbeat", 0)
        elapsed = now - last_heartbeat

        if elapsed <= STUCK_THRESHOLD:
            continue  # Healthy

        if elapsed <= DEAD_THRESHOLD:
            # Warning - stuck but may recover
            problems.append({
                "problem": "AGENT_STUCK",
                "target": agent["id"],
                "signal": "warning",
                "context": {
                    "elapsed_seconds": int(elapsed),
                    "threshold": STUCK_THRESHOLD,
                }
            })
        else:
            # Critical - dead, needs cleanup
            problems.append({
                "problem": "AGENT_DEAD",
                "target": agent["id"],
                "signal": "critical",
                "context": {
                    "elapsed_seconds": int(elapsed),
                    "threshold": DEAD_THRESHOLD,
                }
            })

    return problems


@check(
    id="task_health",
    triggers=[
        triggers.cron.every("60s"),
    ],
    on_problem=["TASK_ORPHAN", "TASK_STUCK"],
    task="TASK_release_orphan_task",
)
def task_health(ctx) -> List[Dict[str, Any]]:
    """
    H2: Check all claimed/running tasks for health.

    Detects orphaned tasks (agent dead) and stuck tasks (same step too long).
    Returns list of problems found.
    """
    now = time.time()
    problems = []

    # Query all claimed tasks
    claimed_tasks = ctx.query_nodes(
        node_type="narrative",
        filters={"type": "task_run", "status": "claimed"}
    )

    for task in claimed_tasks:
        # Check if claiming agent is dead
        agent_id = task.get("claimed_by")
        if agent_id:
            agent = ctx.get_node(agent_id)
            if agent and agent.get("status") == "dead":
                problems.append({
                    "problem": "TASK_ORPHAN",
                    "target": task["id"],
                    "signal": "critical",
                    "context": {
                        "dead_agent": agent_id,
                    }
                })
                continue

    # Query all running tasks
    running_tasks = ctx.query_nodes(
        node_type="narrative",
        filters={"type": "task_run", "status": "running"}
    )

    for task in running_tasks:
        step_started = task.get("step_started_at", 0)
        elapsed = now - step_started

        if elapsed <= TASK_WARN_THRESHOLD:
            continue  # OK

        if elapsed <= TASK_RELEASE_THRESHOLD:
            # Warning
            problems.append({
                "problem": "TASK_STUCK",
                "target": task["id"],
                "signal": "warning",
                "context": {
                    "elapsed_seconds": int(elapsed),
                    "threshold": TASK_WARN_THRESHOLD,
                    "current_step": task.get("current_step"),
                }
            })
        else:
            # Critical - release
            problems.append({
                "problem": "TASK_STUCK",
                "target": task["id"],
                "signal": "critical",
                "context": {
                    "elapsed_seconds": int(elapsed),
                    "threshold": TASK_RELEASE_THRESHOLD,
                    "current_step": task.get("current_step"),
                    "action": "release",
                }
            })

    return problems


# =============================================================================
# REGISTRY
# =============================================================================

CHECKS = [
    agent_health,
    task_health,
]
