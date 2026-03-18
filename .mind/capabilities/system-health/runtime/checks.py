"""
Health Checks: system-health

Self-repair capability for the capability system itself.
Detects stuck agents, orphan tasks, and failed health checks.

DOCS: capabilities/system-health/HEALTH.md
"""

from pathlib import Path
from datetime import datetime, timedelta

from runtime.capability import check, Signal, triggers


# =============================================================================
# STUCK AGENT DETECTION
# =============================================================================

STUCK_THRESHOLD = 300   # 5 minutes
DEAD_THRESHOLD = 600    # 10 minutes


@check(
    id="stuck_agent_detection",
    triggers=[
        triggers.cron.every(60),  # Every minute
    ],
    on_problem="AGENT_STUCK",
    task="TASK_investigate_stuck_agent",
)
def stuck_agent_detection(ctx) -> dict:
    """
    H1: Detect agents with no heartbeat for >5 minutes.

    Returns DEGRADED for stuck agents (5-10 min).
    Returns CRITICAL for dead agents (>10 min).
    Self-heals by releasing orphan tasks.
    """
    from runtime.capability.agents import get_registry, AgentStatus

    registry = get_registry()
    stuck = registry.check_stuck()

    # Count by severity
    stuck_agents = [
        a for a in registry.agents.values()
        if a.status == AgentStatus.STUCK
    ]
    dead_agents = [
        a for a in registry.agents.values()
        if a.status == AgentStatus.DEAD
    ]

    if dead_agents:
        # Return one result per dead agent (for atomic handling)
        # First dead agent is primary, others listed
        first = dead_agents[0]
        return Signal.critical(
            agent_id=first.agent_id,  # For atomic handler
            dead_count=len(dead_agents),
            dead_agents=[a.agent_id for a in dead_agents],
            stuck_count=len(stuck_agents),
        )

    if stuck_agents:
        first = stuck_agents[0]
        return Signal.degraded(
            agent_id=first.agent_id,  # For atomic handler
            stuck_count=len(stuck_agents),
            stuck_agents=[a.agent_id for a in stuck_agents],
        )

    return Signal.healthy()


@check(
    id="orphan_task_detection",
    triggers=[
        triggers.cron.every(60),  # Every minute
    ],
    on_problem="TASK_ORPHAN",
    task="TASK_release_orphan_task",
)
def orphan_task_detection(ctx) -> dict:
    """
    H2: Detect tasks claimed by dead agents.

    Auto-releases orphan tasks back to pending.
    Returns DEGRADED if orphan tasks exist (already auto-fixed).
    """
    from runtime.capability.throttler import get_throttler
    from runtime.capability.agents import get_registry, AgentStatus

    throttler = get_throttler()
    registry = get_registry()

    # Find dead agents
    dead_agent_ids = {
        a.agent_id for a in registry.agents.values()
        if a.status == AgentStatus.DEAD
    }

    if not dead_agent_ids:
        return Signal.healthy()

    # Find tasks claimed by dead agents
    orphan_tasks = []
    for task_id, slot in throttler.active.items():
        if slot.claimed_by in dead_agent_ids:
            orphan_tasks.append(task_id)
            # Auto-release
            throttler.on_abandon(task_id)

    if orphan_tasks:
        first = orphan_tasks[0]
        return Signal.degraded(
            task_id=first,  # For atomic handler
            orphan_count=len(orphan_tasks),
            released_tasks=orphan_tasks,
            auto_fixed=True,
        )

    return Signal.healthy()


@check(
    id="health_check_failure",
    triggers=[
        triggers.stream.on_error(".mind/logs/health.log"),
    ],
    on_problem="HEALTH_CHECK_FAILED",
    task="TASK_investigate_health_failure",
)
def health_check_failure(ctx) -> dict:
    """
    H3: Detect failed health check execution.

    Triggered when a check.py crashes or times out.
    Returns DEGRADED with failure details.
    """
    # The trigger payload contains the error
    error = ctx.trigger_source or "Unknown error"

    return Signal.degraded(
        error=error,
        capability=ctx.capability,
    )


@check(
    id="agent_queue_health",
    triggers=[
        triggers.cron.every(5),  # Every 5 minutes
    ],
    on_problem="QUEUE_UNHEALTHY",
    task="TASK_investigate_queue",
)
def agent_queue_health(ctx) -> dict:
    """
    H4: Monitor task queue health.

    Returns DEGRADED if queue is full but no agents working.
    Returns CRITICAL if queue full and agents stuck.
    """
    from runtime.capability.throttler import get_throttler
    from runtime.capability.agents import get_registry, AgentStatus

    throttler = get_throttler()
    registry = get_registry()
    stats = throttler.get_stats()

    pending = stats["pending_unclaimed"]
    max_pending = stats["max_pending"]
    active_agents = sum(
        1 for a in registry.agents.values()
        if a.status == AgentStatus.RUNNING
    )
    stuck_agents = sum(
        1 for a in registry.agents.values()
        if a.status == AgentStatus.STUCK
    )

    # Queue full with stuck agents = critical
    if pending >= max_pending * 0.8 and stuck_agents > 0:
        return Signal.critical(
            pending=pending,
            max_pending=max_pending,
            active_agents=active_agents,
            stuck_agents=stuck_agents,
        )

    # Queue full with no workers = degraded
    if pending >= max_pending * 0.8 and active_agents == 0:
        return Signal.degraded(
            pending=pending,
            max_pending=max_pending,
            no_workers=True,
        )

    return Signal.healthy()


# =============================================================================
# REGISTRY
# =============================================================================

CHECKS = [
    stuck_agent_detection,
    orphan_task_detection,
    health_check_failure,
    agent_queue_health,
]
