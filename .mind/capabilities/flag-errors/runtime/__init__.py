"""
Capability Runtime: flag-errors

Exports CHECKS list for MCP registration.
"""

from .checks import (
    CHECKS,
    new_errors,
    error_spike,
    watch_coverage,
    stale_errors,
)

__all__ = [
    "CHECKS",
    "new_errors",
    "error_spike",
    "watch_coverage",
    "stale_errors",
]
