# DOCS: capabilities/improve-quality/IMPLEMENTATION.md
"""
Improve Quality Runtime Checks

Exports CHECKS list for registration with the health check system.
"""

from .checks import (
    monolith_detection,
    secret_detection,
    magic_value_detection,
    prompt_length_detection,
    sql_complexity_detection,
    naming_convention_detection,
)

CHECKS = [
    monolith_detection,
    secret_detection,
    magic_value_detection,
    prompt_length_detection,
    sql_complexity_detection,
    naming_convention_detection,
]

__all__ = ["CHECKS"]
