"""
Membrane graph client.

Provides access to the membrane graph for cross-org queries.
Same interface as local GraphQueries - embedding-based semantic search.
"""

import json
import logging
import math
from typing import List, Dict, Any, Optional, Callable

from .config import MEMBRANE_HOST, MEMBRANE_PORT, MEMBRANE_GRAPH

logger = logging.getLogger(__name__)

# Singleton instance
_membrane_queries: Optional["MembraneQueries"] = None


def _cosine_similarity(a: List[float], b: List[float]) -> float:
    """Compute cosine similarity between two vectors."""
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(x * x for x in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


class MembraneQueries:
    """
    Query interface for the membrane graph.

    Provides embedding-based search on membrane graph.
    Membrane contains mirrors of public nodes from all orgs.
    """

    def __init__(self):
        """Initialize connection to membrane graph."""
        from runtime.infrastructure.database.falkordb_adapter import FalkorDBAdapter

        self._adapter = FalkorDBAdapter(
            host=MEMBRANE_HOST,
            port=MEMBRANE_PORT,
            graph_name=MEMBRANE_GRAPH
        )
        self.graph_name = MEMBRANE_GRAPH
        logger.info(f"[MembraneQueries] Connected to {MEMBRANE_GRAPH}@{MEMBRANE_HOST}:{MEMBRANE_PORT}")

    def _query(self, cypher: str, params: Dict[str, Any] = None) -> List[Any]:
        """Execute Cypher query."""
        return self._adapter.query(cypher, params)

    def search(
        self,
        query: str,
        embed_fn: Callable[[str], List[float]],
        top_k: int = 5,
        threshold: float = 0.7,
    ) -> List[Dict[str, Any]]:
        """
        Search membrane graph for cross-org public nodes.

        Args:
            query: Natural language query
            embed_fn: Function to convert text to embedding
            top_k: Number of results to return
            threshold: Minimum similarity threshold

        Returns:
            List of matching nodes from membrane (mirrors of public nodes)
        """
        query_embedding = embed_fn(query)

        # Get all nodes with embeddings from membrane
        cypher = """
        MATCH (n)
        WHERE n.embedding IS NOT NULL AND n.public = true
        RETURN n.id, n.node_type, n.type, n.synthesis, n.embedding, n.org_id
        """

        try:
            rows = self._query(cypher)
            if not rows:
                return []

            results = []
            for row in rows:
                if len(row) >= 5 and row[4]:
                    node_embedding = json.loads(row[4]) if isinstance(row[4], str) else row[4]
                    sim = _cosine_similarity(query_embedding, node_embedding)

                    if sim >= threshold:
                        results.append({
                            "id": row[0],
                            "node_type": row[1],
                            "type": row[2],
                            "synthesis": row[3],
                            "org_id": row[5] if len(row) > 5 else None,
                            "similarity": sim,
                            "source": "membrane"
                        })

            # Sort by similarity, return top_k
            results.sort(key=lambda x: x["similarity"], reverse=True)
            return results[:top_k]

        except Exception as e:
            logger.warning(f"[MembraneQueries] Search failed: {e}")
            return []

    def health_check(self) -> bool:
        """Check if membrane graph is accessible."""
        try:
            return self._adapter.health_check()
        except Exception as e:
            logger.warning(f"[MembraneQueries] Health check failed: {e}")
            return False


def get_membrane_queries() -> Optional[MembraneQueries]:
    """Get singleton membrane queries instance."""
    global _membrane_queries

    if _membrane_queries is None:
        try:
            _membrane_queries = MembraneQueries()
        except Exception as e:
            logger.warning(f"[MembraneQueries] Could not connect to membrane: {e}")
            return None

    return _membrane_queries
