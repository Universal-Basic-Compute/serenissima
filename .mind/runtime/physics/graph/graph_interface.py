"""
Graph Interface

Defines the contract for graph operations required by the engine and agents.
Any implementation (FalkorDB, etc.) must satisfy this interface.

DOCS: docs/physics/graph/PATTERNS_Graph.md

@mind:proposition
    SCOPE DECISION: This interface captures the minimal read contract for
    external consumers (Orchestrator, tick.py, blood-ledger proxy). Methods
    are added when a consumer actually needs them, not speculatively.

    If a consumer needs additional methods, they should:
    1. Add the method to this Protocol
    2. Verify GraphQueries implements it
    3. Update the proxy in blood-ledger

    Alternative: A "fat" interface with all GraphQueries methods. Rejected
    because it couples consumers to implementation details they don't need.
"""

from typing import Any, Dict, List, Optional, Protocol, runtime_checkable


@runtime_checkable
class GraphClient(Protocol):
    """
    Protocol defining the required graph operations.

    This is the minimal contract that any graph backend must satisfy.
    GraphQueries (FalkorDB) is the canonical implementation.

    Used by:
    - engine/infrastructure/orchestration/orchestrator.py
    - engine/physics/tick.py
    - blood-ledger proxy (external repo)
    """

    # =========================================================================
    # RAW QUERY ACCESS
    # =========================================================================

    def query(self, cypher: str, params: Dict[str, Any] = None) -> List[Dict[str, Any]]:
        """Execute a Cypher query and return results as dicts."""
        # This is a protocol method and is implemented by concrete graph clients.

    # =========================================================================
    # CHARACTER QUERIES
    # =========================================================================

    def get_character(self, character_id: str) -> Optional[Dict[str, Any]]:
        """Get a character by ID."""
        # This is a protocol method and is implemented by concrete graph clients.

    def get_all_characters(self, type_filter: str = None) -> List[Dict[str, Any]]:
        """Get all characters, optionally filtered by type."""
        # This is a protocol method and is implemented by concrete graph clients.

    def get_characters_at(self, place_id: str) -> List[Dict[str, Any]]:
        """Get all characters present at a location."""
        # This is a protocol method and is implemented by concrete graph clients.

    # =========================================================================
    # PLACE QUERIES
    # =========================================================================

    def get_place(self, place_id: str) -> Optional[Dict[str, Any]]:
        """Get a place by ID."""
        # This is a protocol method and is implemented by concrete graph clients.

    def get_path_between(self, from_place: str, to_place: str) -> Optional[Dict[str, Any]]:
        """Get travel info between two places."""
        # This is a protocol method and is implemented by concrete graph clients.

    def get_player_location(self, player_id: str = "char_player") -> Optional[Dict[str, Any]]:
        """Resolve the current Space for a player character."""
        # This is a protocol method and is implemented by concrete graph clients.

    # =========================================================================
    # NARRATIVE QUERIES
    # =========================================================================

    def get_narrative(self, narrative_id: str) -> Optional[Dict[str, Any]]:
        """Get a narrative by ID."""
        # This is a protocol method and is implemented by concrete graph clients.

    def get_character_beliefs(self, character_id: str, min_heard: float = 0.0) -> List[Dict[str, Any]]:
        """Get all narratives a character believes."""
        # This is a protocol method and is implemented by concrete graph clients.

    def get_narrative_believers(self, narrative_id: str) -> List[Dict[str, Any]]:
        """Get all characters who believe a narrative."""
        # This is a protocol method and is implemented by concrete graph clients.

    def get_narratives_about(
        self,
        character_id: str = None,
        place_id: str = None,
        thing_id: str = None,
        type_filter: str = None
    ) -> List[Dict[str, Any]]:
        """Get narratives about a specific node."""
        # This is a protocol method and is implemented by concrete graph clients.

    # =========================================================================
    # SCENE CONTEXT
    # =========================================================================

    def build_scene_context(self, player_location: str, player_id: str = "char_player") -> Dict[str, Any]:
        """Build complete scene context for Narrator."""
        # This is a protocol method and is implemented by concrete graph clients.


# @mind:todo Verify blood-ledger proxy is updated with new methods:
#   - get_path_between
#   - get_player_location
#   - get_narrative_believers
#   - get_narratives_about

