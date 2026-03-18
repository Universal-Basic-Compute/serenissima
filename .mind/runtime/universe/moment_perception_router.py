"""
Moment Perception Router

ALG-5: Route moments to actors with access to the Space where the moment occurred.
Determines which Actors should perceive a Moment based on HAS_ACCESS links.

Key responsibilities:
- Find all actors with direct HAS_ACCESS to a Space
- Find all actors with inherited access (via ancestor Spaces)
- Return deduplicated list of perceiving actor IDs
- (Future) Inject stimulus into L1 membrane for each perceiving actor

DOCS: docs/universe/ALGORITHM_Universe_Graph.md (ALG-5)
      docs/universe/IMPLEMENTATION_Universe_Graph.md (Phase U6)
"""

import logging
from typing import List, Optional

from runtime.infrastructure.database.adapter import DatabaseAdapter

from .access_resolution_and_link_manager import AccessResolver
from .space_and_hierarchy_manager import SpaceManager

logger = logging.getLogger(__name__)


class MomentPerceptionRouter:
    """
    Routes moments to actors who can perceive them.

    ALG-5: When a Moment is created in a Space, all actors with access
    to that Space (directly or via inheritance) should perceive the moment.
    """

    def __init__(
        self,
        adapter: DatabaseAdapter,
        access_resolver: AccessResolver,
        space_manager: SpaceManager,
    ):
        self._adapter = adapter
        self._access = access_resolver
        self._space_mgr = space_manager

    def route(self, moment_id: str, space_id: str) -> List[str]:
        """
        ALG-5: Determine which actors should perceive this moment.

        1. Find all actors with direct HAS_ACCESS to this Space.
        2. Find all actors with HAS_ACCESS to ancestor Spaces (inherited).
        3. Return deduplicated list of actor_ids.

        Implements: B4 (Moment Recording -- perception routing part).

        Args:
            moment_id: The Moment node ID (for logging/future stimulus).
            space_id: The Space where the Moment was created.

        Returns:
            List of actor_ids who should perceive the moment.
        """
        accessing_actors: List[str] = []
        seen: set = set()

        # Step 1: Direct HAS_ACCESS to this Space
        direct_actors = self._find_direct_access_actors(space_id)
        for actor_id in direct_actors:
            if actor_id not in seen:
                seen.add(actor_id)
                accessing_actors.append(actor_id)

        # Step 2: Walk up containment hierarchy for inherited access
        current = self._space_mgr.parent_space(space_id)
        while current is not None:
            ancestor_actors = self._find_direct_access_actors(current)
            for actor_id in ancestor_actors:
                if actor_id not in seen:
                    seen.add(actor_id)
                    accessing_actors.append(actor_id)
            current = self._space_mgr.parent_space(current)

        logger.info(
            f"[MomentPerceptionRouter] Moment {moment_id} in Space {space_id}: "
            f"routing to {len(accessing_actors)} actors"
        )

        return accessing_actors

    def inject_stimulus(
        self,
        actor_id: str,
        moment_id: str,
        space_id: str,
        encrypted: bool = False,
    ) -> None:
        """
        Inject moment as L1 stimulus via membrane.

        Uses existing runtime/membrane/stimulus.py infrastructure.
        If encrypted, the actor's MCP server decrypts using its key.

        NOTE: This is a placeholder integration point. The actual L1 stimulus
        injection depends on Force 5 (Cognitive Engine) being implemented.
        For now, we log the injection intent. The membrane infrastructure
        exists but the moment_perception stimulus type is new.

        Args:
            actor_id: The Actor who should perceive the moment.
            moment_id: The Moment node ID.
            space_id: The Space where the Moment occurred.
            encrypted: Whether the Space content is encrypted.
        """
        logger.info(
            f"[MomentPerceptionRouter] inject_stimulus: "
            f"actor={actor_id}, moment={moment_id}, "
            f"space={space_id}, encrypted={encrypted}"
        )
        # Integration point for L1 membrane stimulus injection.
        # When Force 5 is ready, this will call:
        #   from runtime.membrane.stimulus import get_stimulus_handler
        #   handler = get_stimulus_handler()
        #   handler.inject(actor_id, "moment_perception", moment_id, space_id)

    def route_and_inject(
        self,
        moment_id: str,
        space_id: str,
        encrypted: bool = False,
    ) -> List[str]:
        """
        Convenience method: route + inject for all perceiving actors.

        Returns the list of actor_ids that were notified.
        """
        actors = self.route(moment_id, space_id)
        for actor_id in actors:
            self.inject_stimulus(actor_id, moment_id, space_id, encrypted)
        return actors

    # =========================================================================
    # INTERNAL HELPERS
    # =========================================================================

    def _find_direct_access_actors(self, space_id: str) -> List[str]:
        """Find all actors with direct HAS_ACCESS link to a Space."""
        cypher = """
        MATCH (a:Actor)-[r:link]->(s:Space {id: $space_id})
        WHERE r.type = 'has_access'
        RETURN a.id
        """
        rows = self._adapter.query(cypher, {"space_id": space_id})
        return [row[0] for row in rows if row[0] is not None]
