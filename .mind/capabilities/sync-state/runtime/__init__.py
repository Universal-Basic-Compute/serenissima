# Sync State Capability Runtime
# Exports health check functions for MCP integration

from .checks import (
    sync_freshness,
    yaml_drift,
    ingestion_coverage,
    blocked_modules,
)

# List of all checks in this capability
CHECKS = [
    sync_freshness,
    yaml_drift,
    ingestion_coverage,
    blocked_modules,
]

__all__ = [
    "CHECKS",
    "sync_freshness",
    "yaml_drift",
    "ingestion_coverage",
    "blocked_modules",
]
