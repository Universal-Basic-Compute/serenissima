"""
Runtime module for add-tests capability.

Exports health checks for test coverage monitoring.
"""

from .checks import CHECKS

__all__ = ["CHECKS"]
