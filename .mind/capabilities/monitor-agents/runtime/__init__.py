"""
Capability Runtime: monitor-agents

Exports CHECKS list for MCP registration.
"""

from .checks import (
    CHECKS,
    agent_health,
    task_health,
)

__all__ = [
    "CHECKS",
    "agent_health",
    "task_health",
]
