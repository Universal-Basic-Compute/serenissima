"""
Capability Runtime: steer-project

Exports CHECKS list for MCP registration.
"""

from .checks import (
    CHECKS,
    steering_due,
    stale_sync,
    unprocessed_escalations,
    project_momentum,
)

__all__ = [
    "CHECKS",
    "steering_due",
    "stale_sync",
    "unprocessed_escalations",
    "project_momentum",
]
