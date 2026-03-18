"""
Agent orchestration for autonomous problem fixing.

This module provides:
- Agent running and execution
- Graph-based status tracking
- Posture-based agent selection
- Verification and retry logic

DOCS: docs/agents/PATTERNS_Agent_System.md

Usage:
    from runtime.agents import run_work_agent, AgentGraph

    # Run agent for problem
    result = await run_work_agent(
        task_type="STALE_SYNC",
        path="docs/physics/SYNC.md",
        target_dir=Path("."),
        agent_provider="claude",
    )

    # Or run for task
    result = await run_for_task(
        task_id="narrative:task:TASK_create_doc",
        target_dir=Path("."),
    )
"""

# Re-export from submodules for clean API
from .graph import AgentGraph, AgentInfo
from .mapping import (
    NAME_TO_AGENT_ID,
    DEFAULT_NAME,
    make_id,
    discover_agents,
    get_agent_id,
    list_agents,
    normalize_agent_id,
    extract_agent_name,
)
from .cli import build_agent_command, normalize_agent, AgentCommand
from .run import (
    run_work_agent,
    run_for_task,
    RunResult,
)
from .prompts import (
    get_agent_system_prompt,
    build_agent_prompt,
    get_learnings_content,
)
from .verification import (
    verify_completion,
    VerificationResult,
    all_passed,
)
from .liveness import (
    ACTIVE_THRESHOLD_SECONDS,
    check_agent_liveness,
    get_session_activity,
    get_all_active_agents,
    sync_liveness_to_graph,
    SessionInfo,
    # Session file based detection
    get_active_agent_from_session,
    get_all_active_agents_from_sessions,
    get_session_id_for_agent,
)

__all__ = [
    # Graph
    "AgentGraph",
    "AgentInfo",
    # Agent Discovery
    "NAME_TO_AGENT_ID",
    "DEFAULT_NAME",
    "make_id",
    "discover_agents",
    "get_agent_id",
    "list_agents",
    "normalize_agent_id",
    "extract_agent_name",
    # CLI
    "build_agent_command",
    "normalize_agent",
    "AgentCommand",
    # Run
    "run_work_agent",
    "run_for_task",
    "RunResult",
    # Prompts
    "get_agent_system_prompt",
    "build_agent_prompt",
    "get_learnings_content",
    # Verification
    "verify_completion",
    "VerificationResult",
    "all_passed",
    # Liveness
    "ACTIVE_THRESHOLD_SECONDS",
    "check_agent_liveness",
    "get_session_activity",
    "get_all_active_agents",
    "sync_liveness_to_graph",
    "SessionInfo",
    # Session file detection
    "get_active_agent_from_session",
    "get_all_active_agents_from_sessions",
    "get_session_id_for_agent",
]
