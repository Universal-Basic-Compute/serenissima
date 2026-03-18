"""Citizen management — identity loading, prompt building, permissions, graph seeding."""

from runtime.citizens.identity_loader import (
    load_citizen_identity,
    list_available_citizens,
    get_citizen_permissions,
    citizen_can,
    AUTONOMY_PERMISSIONS,
)
from runtime.citizens.prompt_builder import build_citizen_prompt
from runtime.citizens.seed import seed_citizen_actors

__all__ = [
    "load_citizen_identity",
    "list_available_citizens",
    "get_citizen_permissions",
    "citizen_can",
    "build_citizen_prompt",
    "seed_citizen_actors",
    "AUTONOMY_PERMISSIONS",
]
