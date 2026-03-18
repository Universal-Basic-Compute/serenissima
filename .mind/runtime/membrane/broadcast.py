"""
Membrane broadcast.

Syncs public nodes from local graph to membrane graph.
When a node becomes public, it gets mirrored in membrane.
When a node becomes private, its mirror is removed.
"""

import logging
import os
from typing import Optional, Dict, Any

from .config import MEMBRANE_HOST, MEMBRANE_PORT, MEMBRANE_GRAPH

logger = logging.getLogger(__name__)


class MembraneBroadcast:
    """
    Broadcasts public nodes to membrane graph.

    Creates mirrors of public nodes in the shared membrane graph
    so other orgs can discover them via semantic search.
    """

    def __init__(self):
        """Initialize broadcast with membrane connection."""
        from runtime.infrastructure.database.falkordb_adapter import FalkorDBAdapter

        self._adapter = FalkorDBAdapter(
            host=MEMBRANE_HOST,
            port=MEMBRANE_PORT,
            graph_name=MEMBRANE_GRAPH
        )
        self._org_id = os.getenv("ORG_ID", "unknown_org")
        logger.info(f"[MembraneBroadcast] Ready for org {self._org_id}")

    def _query(self, cypher: str, params: Dict[str, Any] = None):
        """Execute Cypher on membrane graph."""
        return self._adapter.query(cypher, params)

    def broadcast_node(
        self,
        node_id: str,
        node_type: str,
        type_: str,
        synthesis: str,
        embedding: list,
    ) -> bool:
        """
        Broadcast a public node to membrane.

        Creates or updates a mirror node in membrane graph.

        Args:
            node_id: Original node ID
            node_type: Node type (actor, moment, narrative, space, thing)
            type_: Subtype
            synthesis: Embeddable summary
            embedding: 768-dim vector

        Returns:
            True if broadcast succeeded
        """
        try:
            # Create mirror node in membrane
            # Mirror ID = org_id + node_id to avoid collisions
            mirror_id = f"{self._org_id}:{node_id}"

            cypher = f"""
            MERGE (n:{node_type.capitalize()} {{id: $mirror_id}})
            SET n.node_type = $node_type,
                n.type = $type,
                n.synthesis = $synthesis,
                n.embedding = $embedding,
                n.org_id = $org_id,
                n.origin_id = $origin_id,
                n.public = true
            """

            self._query(cypher, {
                "mirror_id": mirror_id,
                "node_type": node_type,
                "type": type_,
                "synthesis": synthesis,
                "embedding": embedding,
                "org_id": self._org_id,
                "origin_id": node_id,
            })

            logger.info(f"[MembraneBroadcast] Broadcasted {node_id} -> {mirror_id}")
            return True

        except Exception as e:
            logger.error(f"[MembraneBroadcast] Failed to broadcast {node_id}: {e}")
            return False

    def remove_node(self, node_id: str) -> bool:
        """
        Remove a node's mirror from membrane.

        Called when a node becomes private.

        Args:
            node_id: Original node ID

        Returns:
            True if removal succeeded
        """
        try:
            mirror_id = f"{self._org_id}:{node_id}"

            cypher = """
            MATCH (n {id: $mirror_id})
            DELETE n
            """

            self._query(cypher, {"mirror_id": mirror_id})

            logger.info(f"[MembraneBroadcast] Removed mirror {mirror_id}")
            return True

        except Exception as e:
            logger.error(f"[MembraneBroadcast] Failed to remove {node_id}: {e}")
            return False

    def sync_all_public(self, graph_queries) -> int:
        """
        Sync all public nodes from local graph to membrane.

        Args:
            graph_queries: Local GraphQueries instance

        Returns:
            Number of nodes synced
        """
        try:
            # Get all public nodes from local graph
            cypher = """
            MATCH (n)
            WHERE n.public = true AND n.embedding IS NOT NULL
            RETURN n.id, n.node_type, n.type, n.synthesis, n.embedding
            """

            rows = graph_queries._query(cypher)
            synced = 0

            for row in rows:
                if len(row) >= 5:
                    success = self.broadcast_node(
                        node_id=row[0],
                        node_type=row[1] or "thing",
                        type_=row[2] or "",
                        synthesis=row[3] or "",
                        embedding=row[4],
                    )
                    if success:
                        synced += 1

            logger.info(f"[MembraneBroadcast] Synced {synced} public nodes")
            return synced

        except Exception as e:
            logger.error(f"[MembraneBroadcast] Sync failed: {e}")
            return 0


# Singleton
_broadcast: Optional[MembraneBroadcast] = None


def get_broadcast() -> Optional[MembraneBroadcast]:
    """Get singleton broadcast instance."""
    global _broadcast

    if _broadcast is None:
        try:
            _broadcast = MembraneBroadcast()
        except Exception as e:
            logger.warning(f"[MembraneBroadcast] Could not initialize: {e}")
            return None

    return _broadcast


def on_node_public(node_id: str, node_type: str, type_: str, synthesis: str, embedding: list):
    """Hook: called when a node becomes public."""
    broadcast = get_broadcast()
    if broadcast:
        broadcast.broadcast_node(node_id, node_type, type_, synthesis, embedding)


def on_node_private(node_id: str):
    """Hook: called when a node becomes private."""
    broadcast = get_broadcast()
    if broadcast:
        broadcast.remove_node(node_id)
