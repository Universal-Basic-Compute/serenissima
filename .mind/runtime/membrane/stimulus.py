"""
Membrane stimulus receiver.

Handles incoming cross-org queries via membrane.
Other orgs can query our public nodes through the membrane routing layer.
"""

import logging
import os
from typing import Dict, Any, List, Optional, Callable

logger = logging.getLogger(__name__)


class StimulusHandler:
    """
    Handles incoming stimuli from other orgs.

    When another org queries the membrane and finds our public nodes,
    they can send a stimulus to get more detailed responses.
    """

    def __init__(self, graph_queries, embed_fn: Callable[[str], List[float]]):
        """
        Initialize handler with local graph access.

        Args:
            graph_queries: Local GraphQueries instance
            embed_fn: Embedding function for semantic search
        """
        self._graph = graph_queries
        self._embed_fn = embed_fn
        self._org_id = os.getenv("ORG_ID", "unknown_org")
        logger.info(f"[StimulusHandler] Ready for org {self._org_id}")

    def handle_query(
        self,
        query: str,
        from_org: str,
        top_k: int = 5,
    ) -> Dict[str, Any]:
        """
        Handle an incoming query from another org.

        Only returns public nodes.

        Args:
            query: Natural language query
            from_org: Requesting org ID
            top_k: Max results to return

        Returns:
            Response dict with matches
        """
        logger.info(f"[StimulusHandler] Query from {from_org}: {query[:50]}...")

        try:
            # Search our local graph for public nodes
            query_embedding = self._embed_fn(query)

            # Only return public nodes
            cypher = """
            MATCH (n)
            WHERE n.public = true AND n.embedding IS NOT NULL
            RETURN n.id, n.node_type, n.type, n.synthesis, n.embedding
            """

            rows = self._graph._query(cypher)
            if not rows:
                return {
                    "status": "ok",
                    "from_org": self._org_id,
                    "to_org": from_org,
                    "matches": []
                }

            # Compute similarities
            import json
            import math

            def cosine_sim(a, b):
                if not a or not b or len(a) != len(b):
                    return 0.0
                dot = sum(x * y for x, y in zip(a, b))
                norm_a = math.sqrt(sum(x * x for x in a))
                norm_b = math.sqrt(sum(x * x for x in b))
                if norm_a == 0 or norm_b == 0:
                    return 0.0
                return dot / (norm_a * norm_b)

            matches = []
            for row in rows:
                if len(row) >= 5 and row[4]:
                    node_embedding = json.loads(row[4]) if isinstance(row[4], str) else row[4]
                    sim = cosine_sim(query_embedding, node_embedding)

                    if sim >= 0.7:  # Threshold
                        matches.append({
                            "id": row[0],
                            "node_type": row[1],
                            "type": row[2],
                            "synthesis": row[3],
                            "similarity": sim,
                        })

            # Sort and limit
            matches.sort(key=lambda x: x["similarity"], reverse=True)
            matches = matches[:top_k]

            return {
                "status": "ok",
                "from_org": self._org_id,
                "to_org": from_org,
                "query": query,
                "matches": matches,
            }

        except Exception as e:
            logger.error(f"[StimulusHandler] Query failed: {e}")
            return {
                "status": "error",
                "from_org": self._org_id,
                "to_org": from_org,
                "error": str(e),
            }


# Singleton
_handler: Optional[StimulusHandler] = None


def get_stimulus_handler(graph_queries=None, embed_fn=None) -> Optional[StimulusHandler]:
    """Get or create stimulus handler singleton."""
    global _handler

    if _handler is None and graph_queries and embed_fn:
        try:
            _handler = StimulusHandler(graph_queries, embed_fn)
        except Exception as e:
            logger.warning(f"[StimulusHandler] Could not initialize: {e}")
            return None

    return _handler
