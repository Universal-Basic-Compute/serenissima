"""
Capability Runtime: derive-tasks

Exports CHECKS list for MCP registration.
"""

from .checks import (
    CHECKS,
    orphan_objectives,
    low_coverage,
    stale_objectives,
    vision_sync,
)

__all__ = [
    "CHECKS",
    "orphan_objectives",
    "low_coverage",
    "stale_objectives",
    "vision_sync",
]
