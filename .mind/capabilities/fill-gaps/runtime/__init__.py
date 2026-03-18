"""
Fill Gaps Capability Runtime

Exposes health checks for documentation quality:
- Gap detection (@mind:gap markers)
- Duplication detection (>30% overlap)
- Size detection (>200 lines)
"""

from .checks import CHECKS

__all__ = ["CHECKS"]
