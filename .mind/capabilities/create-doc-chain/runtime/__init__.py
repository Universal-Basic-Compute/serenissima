"""
Capability Runtime: create-doc-chain

Exports CHECKS list for MCP registration.
"""

from .checks import (
    CHECKS,
    chain_completeness,
    placeholder_detection,
    template_drift,
    new_undoc_code,
)

__all__ = [
    "CHECKS",
    "chain_completeness",
    "placeholder_detection",
    "template_drift",
    "new_undoc_code",
]
