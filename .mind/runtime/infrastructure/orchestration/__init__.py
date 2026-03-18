"""
Orchestrator

Coordinates Narrator, World Runner, and graph ticks.

Usage:
    from runtime.infrastructure.orchestration import Orchestrator

    orch = Orchestrator()

    # Process a player action
    scene = orch.process_action(
        player_action="blade",
        player_location="place_camp"
    )
"""

from .orchestrator import Orchestrator
from .narrator import NarratorService
from .world_runner import WorldRunnerService

__all__ = ['Orchestrator', 'NarratorService', 'WorldRunnerService']
