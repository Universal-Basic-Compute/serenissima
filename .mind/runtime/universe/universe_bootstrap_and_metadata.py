"""
Universe Bootstrap and Metadata

Universe graph initialization, metadata node creation, migration from flat graph.
Implements INV-4 (single universe per graph) from the Universe Graph design.

Key responsibilities:
- Initialize a universe graph with a metadata node (Thing, type='universe_metadata')
- Validate that exactly one metadata node exists (INV-4)
- Migrate from flat mind_mcp graph to the universe model
- Create root Space and link all existing nodes

DOCS: docs/universe/ALGORITHM_Universe_Graph.md (ALG-2 -- Space Key Creation)
      docs/universe/IMPLEMENTATION_Universe_Graph.md (Phase U1)
"""

import logging
import time
import uuid
from dataclasses import dataclass
from typing import Optional

from runtime.infrastructure.database.adapter import DatabaseAdapter

from .space_and_hierarchy_manager import SpaceManager, SpaceError

logger = logging.getLogger(__name__)


@dataclass
class UniverseMetadata:
    """Information about the universe metadata node."""
    metadata_id: str
    universe_name: str
    created_at_s: int
    version: str


class UniverseBootstrap:
    """
    Initialize and validate the universe graph.

    Ensures INV-4 (exactly one universe_metadata Thing per graph).
    Provides migration path from flat mind_mcp graphs.
    """

    METADATA_VERSION = "1.0.0"

    def __init__(self, adapter: DatabaseAdapter, space_manager: SpaceManager):
        self._adapter = adapter
        self._space_mgr = space_manager

    def initialize(self, universe_name: str, owner_actor_id: str) -> str:
        """
        Create universe metadata node and root Space.

        Implements: INV-4 (single universe per graph).

        Args:
            universe_name: Human-readable name for this universe.
            owner_actor_id: Actor who owns the root Space.

        Returns:
            The metadata node ID.

        Raises:
            BootstrapError: If universe is already initialized (INV-4 violation).
        """
        # Check INV-4: no existing metadata
        existing = self._find_metadata()
        if existing is not None:
            raise BootstrapError(
                f"Universe already initialized: metadata node {existing.metadata_id} "
                f"exists for universe '{existing.universe_name}' (INV-4)"
            )

        now_s = int(time.time())
        metadata_id = f"thing_{uuid.uuid4().hex[:12]}"

        # Create metadata node (Thing, type='universe_metadata')
        create_cypher = """
        CREATE (m:Thing {
            id: $metadata_id,
            name: $universe_name,
            node_type: 'thing',
            type: 'universe_metadata',
            weight: 1.0,
            energy: 0.0,
            stability: 1.0,
            recency: 1.0,
            content: $content,
            synthesis: $synthesis,
            created_at_s: $now_s,
            updated_at_s: $now_s
        })
        """
        content = f"Universe metadata for {universe_name}. Version {self.METADATA_VERSION}."
        synthesis = f"Universe: {universe_name}"

        self._adapter.execute(create_cypher, {
            "metadata_id": metadata_id,
            "universe_name": universe_name,
            "content": content,
            "synthesis": synthesis,
            "now_s": now_s,
        })

        # Create root Space owned by the actor
        root_space_id = self._space_mgr.create_space(
            creator_actor_id=owner_actor_id,
            name=f"{universe_name}_root",
            space_type="root",
        )

        # Link metadata to root Space (metadata describes the root)
        link_id = f"link_{uuid.uuid4().hex[:12]}"
        link_cypher = """
        MATCH (m:Thing {id: $metadata_id})
        MATCH (s:Space {id: $root_space_id})
        CREATE (m)-[:link {
            id: $link_id,
            node_a: $metadata_id,
            node_b: $root_space_id,
            type: NULL,
            hierarchy: -1,
            permanence: 1.0,
            weight: 1.0,
            energy: 0.0,
            stability: 1.0,
            recency: 1.0,
            polarity: '[0.5, 0.5]',
            valence: 0.0,
            relation_kind: NULL,
            created_at_s: $now_s,
            updated_at_s: $now_s
        }]->(s)
        """
        self._adapter.execute(link_cypher, {
            "link_id": link_id,
            "metadata_id": metadata_id,
            "root_space_id": root_space_id,
            "now_s": now_s,
        })

        logger.info(
            f"[UniverseBootstrap] Initialized universe '{universe_name}' "
            f"with metadata {metadata_id} and root Space {root_space_id}"
        )

        return metadata_id

    def validate_metadata(self) -> bool:
        """
        Check INV-4: exactly one universe_metadata node exists.

        Returns:
            True if exactly one metadata node exists.
        """
        cypher = """
        MATCH (m:Thing)
        WHERE m.type = 'universe_metadata'
        RETURN count(m)
        """
        rows = self._adapter.query(cypher)
        if not rows:
            return False
        count = int(rows[0][0])
        return count == 1

    def get_metadata(self) -> Optional[UniverseMetadata]:
        """Return metadata about the universe, or None if not initialized."""
        return self._find_metadata()

    def get_root_space_id(self) -> Optional[str]:
        """
        Find the root Space ID by following the metadata -> root link.

        Returns None if the universe is not initialized.
        """
        cypher = """
        MATCH (m:Thing)-[:link]->(s:Space)
        WHERE m.type = 'universe_metadata'
          AND s.node_type = 'space'
        RETURN s.id
        LIMIT 1
        """
        rows = self._adapter.query(cypher)
        if not rows:
            return None
        return rows[0][0]

    def migrate_flat_graph(
        self,
        root_space_name: str,
        owner_actor_id: str,
    ) -> str:
        """
        Migration from flat mind_mcp graph:
        1. Create root Space.
        2. Link all existing nodes to root Space.
        3. Create HAS_ACCESS (owner) from primary actor.

        Returns root Space ID.

        Raises:
            BootstrapError: If universe is already initialized.
        """
        # Check not already initialized
        existing = self._find_metadata()
        if existing is not None:
            raise BootstrapError(
                "Cannot migrate: universe already initialized"
            )

        # Initialize universe (creates metadata + root Space + owner access)
        metadata_id = self.initialize(root_space_name, owner_actor_id)
        root_space_id = self.get_root_space_id()

        if root_space_id is None:
            raise BootstrapError("Failed to find root Space after initialization")

        # Find all nodes and determine which are orphans (not linked to any Space)
        now_s = int(time.time())

        # Get all nodes
        all_nodes_cypher = """
        MATCH (n)
        WHERE n.id IS NOT NULL
        RETURN n.id, n.node_type
        """
        all_nodes = self._adapter.query(all_nodes_cypher)

        # Get all nodes that ARE linked to a Space (either direction)
        linked_to_space_cypher = """
        MATCH (n)-[:link]->(s:Space)
        WHERE s.node_type = 'space'
        RETURN n.id
        """
        space_linked_outbound = self._adapter.query(linked_to_space_cypher)
        linked_ids = {row[0] for row in space_linked_outbound if row[0]}

        linked_from_space_cypher = """
        MATCH (s:Space)-[:link]->(n)
        WHERE s.node_type = 'space'
        RETURN n.id
        """
        space_linked_inbound = self._adapter.query(linked_from_space_cypher)
        linked_ids.update(row[0] for row in space_linked_inbound if row[0])

        # Exclude metadata, root space, and already-linked nodes
        exclude_ids = {metadata_id, root_space_id}
        orphans = [
            row for row in all_nodes
            if row[0] not in exclude_ids
            and row[0] not in linked_ids
        ]

        linked_count = 0
        for row in orphans:
            node_id = row[0]
            node_type = row[1] if len(row) > 1 else None

            # Skip Space nodes (they should manage their own containment)
            if node_type == "space":
                continue

            # Create containment link: root Space -> node
            link_id = f"link_{uuid.uuid4().hex[:12]}"
            link_cypher = """
            MATCH (s:Space {id: $root_space_id})
            MATCH (n {id: $node_id})
            CREATE (s)-[:link {
                id: $link_id,
                node_a: $root_space_id,
                node_b: $node_id,
                type: NULL,
                hierarchy: -1,
                permanence: 0.5,
                weight: 1.0,
                energy: 0.0,
                stability: 0.0,
                recency: 1.0,
                polarity: '[0.5, 0.5]',
                valence: 0.0,
                relation_kind: NULL,
                created_at_s: $now_s,
                updated_at_s: $now_s
            }]->(n)
            """
            self._adapter.execute(link_cypher, {
                "link_id": link_id,
                "root_space_id": root_space_id,
                "node_id": node_id,
                "now_s": now_s,
            })
            linked_count += 1

        logger.info(
            f"[UniverseBootstrap] Migrated flat graph: "
            f"created root Space {root_space_id}, "
            f"linked {linked_count} orphan nodes"
        )

        return root_space_id

    # =========================================================================
    # INTERNAL HELPERS
    # =========================================================================

    def _find_metadata(self) -> Optional[UniverseMetadata]:
        """Find the universe metadata node, if it exists."""
        cypher = """
        MATCH (m:Thing)
        WHERE m.type = 'universe_metadata'
        RETURN m.id, m.name, m.created_at_s, m.content
        LIMIT 1
        """
        rows = self._adapter.query(cypher)
        if not rows:
            return None
        row = rows[0]
        return UniverseMetadata(
            metadata_id=row[0],
            universe_name=row[1],
            created_at_s=int(row[2]) if row[2] is not None else 0,
            version=self.METADATA_VERSION,
        )


class BootstrapError(Exception):
    """Raised when universe bootstrap/migration fails."""
    pass
