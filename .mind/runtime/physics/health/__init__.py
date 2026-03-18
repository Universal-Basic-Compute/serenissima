"""
Physics Health Checking System

Runtime verification of energy physics invariants.

DOCS: docs/physics/HEALTH_Energy_Physics.md
"""

from .checker import (
    HealthStatus,
    HealthResult,
    run_all_checks,
    run_check,
)
from .base import BaseChecker

__all__ = [
    "HealthStatus",
    "HealthResult",
    "run_all_checks",
    "run_check",
    "BaseChecker",
]
