"""
Graph Read Interface

Read-only helpers for Connectome dashboards and tooling.

DOCS: docs/physics/graph/PATTERNS_Graph.md
"""

import json
import logging
import os
import re
from typing import Any, Dict, List, Tuple

from falkordb import FalkorDB
from runtime.infrastructure.embeddings.service import get_embedding_service
from runtime.physics.graph.graph_ops_types import WriteError
from runtime.physics.graph.graph_query_utils import (
    cosine_similarity,
    extract_link_props,
    extract_node_props,
    SYSTEM_FIELDS,
)

logger = logging.getLogger(__name__)


class GraphReadOps:
    """
    Read-only graph access for the Connectome dashboard.

    Defaults to the "seed" graph and excludes embeddings from output.
    """

    def __init__(
        self,
        graph_name: str = "seed",
        host: str = "localhost",
        port: int = 6379
    ):
        self.graph_name = graph_name
        self.host = host
        self.port = port
        connect_timeout = float(os.getenv("MIND_FALKORDB_TIMEOUT", "10.0"))
        try:
            self.db = FalkorDB(
                host=host,
                port=port,
                socket_timeout=connect_timeout,
                socket_connect_timeout=connect_timeout,
            )
            self.graph = self.db.select_graph(graph_name)
            logger.info("[GraphReadOps] Connected to %s", graph_name)
        except Exception as exc:
            raise WriteError(
                f"Cannot connect to FalkorDB at {host}:{port}",
                f"""1. Start FalkorDB server (pip install falkordb)

2. Or use FalkorDB Cloud: https://app.falkordb.cloud

3. Check connection settings:
   GraphReadOps(host="your-host", port=6379)

Error: {exc}"""
            )

    def _query(self, cypher: str, params: Dict[str, Any] = None) -> List:
        try:
            result = self.graph.query(cypher, params or {})
            return result.result_set if result.result_set else []
        except Exception as exc:
            raise WriteError(
                f"Query failed: {exc}",
                f"Query: {cypher}\nParams: {params}"
            )

    def _parse_natural_language(self, query: str) -> Tuple[str, Dict[str, Any], str]:
        """
        Convert simple natural language requests into Cypher.

        Returns (cypher, params, mode) where mode is nodes|links|graph.
        """
        normalized = " ".join(query.lower().split())

        match = re.search(r"nodes? of type ([a-z_]+)", normalized)
        if match:
            label = match.group(1).title()
            return f"MATCH (n:{label}) RETURN n", {}, "nodes"

        match = re.search(r"links? of type ([a-z_]+)", normalized)
        if match:
            rel_type = match.group(1).upper()
            return (
                f"MATCH (a)-[r:{rel_type}]->(b) RETURN a, r, b",
                {},
                "links",
            )

        if "nodes and links" in normalized or "nodes & links" in normalized:
            return "MATCH (n) OPTIONAL MATCH (n)-[r]->(m) RETURN n, r, m", {}, "graph"

        if "all links" in normalized or "all edges" in normalized or "relationships" in normalized:
            return "MATCH (a)-[r]->(b) RETURN a, r, b", {}, "links"

        return "MATCH (n) RETURN n", {}, "nodes"

    def _collect_nodes_and_links(self, rows: List[List[Any]]) -> Dict[str, Any]:
        nodes: Dict[str, Dict[str, Any]] = {}
        links: List[Dict[str, Any]] = []

        for row in rows:
            if len(row) >= 3:
                left_node = extract_node_props(row[0], SYSTEM_FIELDS)
                rel_props = extract_link_props(row[1], SYSTEM_FIELDS)
                right_node = extract_node_props(row[2], SYSTEM_FIELDS)
                if left_node and left_node.get("id"):
                    nodes[left_node["id"]] = left_node
                if right_node and right_node.get("id"):
                    nodes[right_node["id"]] = right_node
                if rel_props:
                    rel_props["from_id"] = left_node.get("id") if left_node else None
                    rel_props["to_id"] = right_node.get("id") if right_node else None
                    links.append(rel_props)
                continue
            for item in row:
                node_props = extract_node_props(item, SYSTEM_FIELDS)
                if node_props and node_props.get("id"):
                    nodes[node_props["id"]] = node_props
                link_props = extract_link_props(item, SYSTEM_FIELDS)
                if link_props:
                    links.append(link_props)

        return {
            "nodes": list(nodes.values()),
            "links": links,
        }

    def query_cypher(self, cypher: str, params: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Execute raw Cypher and return nodes/links without embeddings.
        """
        rows = self._query(cypher, params)
        return self._collect_nodes_and_links(rows)

    def list_graphs(self) -> List[str]:
        """Return available graph names."""
        return self.db.list_graphs()

    def query_natural_language(self, query: str) -> Dict[str, Any]:
        """
        Execute a simple natural-language query (no embeddings).
        """
        cypher, params, _mode = self._parse_natural_language(query)
        return self.query_cypher(cypher, params)

    def search_semantic(
        self,
        query: str,
        threshold: float = 0.3,
        hops: int = 1,
        limit: int = 50
    ) -> Dict[str, Any]:
        """
        Return semantically close nodes using embeddings (embeddings not returned).
        """
        embed_svc = get_embedding_service()
        query_embedding = embed_svc.embed(query)

        cypher = """
        MATCH (n)
        WHERE n.embedding IS NOT NULL
        RETURN labels(n), properties(n), n.embedding
        """
        rows = self._query(cypher)
        scored = []
        for row in rows:
            if len(row) < 3:
                continue
            labels = row[0] if isinstance(row[0], list) else [row[0]]
            props = row[1] if isinstance(row[1], dict) else {}
            embedding = row[2]
            if embedding is None:
                continue
            if isinstance(embedding, str):
                try:
                    embedding = json.loads(embedding)
                except Exception:
                    continue
            score = cosine_similarity(query_embedding, embedding)
            if score >= threshold:
                clean = {k: v for k, v in props.items() if k not in SYSTEM_FIELDS}
                if labels:
                    label = labels[0] if isinstance(labels[0], str) else str(labels[0])
                    clean["type"] = label.lower()
                clean["similarity"] = score
                scored.append(clean)

        scored.sort(key=lambda item: item.get("similarity", 0), reverse=True)
        matches = scored[:limit]

        graph = self.fetch_full_graph()
        nodes = graph.get("nodes", [])
        links = graph.get("links", [])

        adjacency: Dict[str, set] = {}
        for link in links:
            src = link.get("from_id")
            dst = link.get("to_id")
            if not src or not dst:
                continue
            adjacency.setdefault(src, set()).add(dst)
            adjacency.setdefault(dst, set()).add(src)

        selected_ids = {node.get("id") for node in matches if node.get("id")}
        frontier = set(selected_ids)
        for _ in range(max(1, hops)):
            next_frontier = set()
            for node_id in frontier:
                for neighbor in adjacency.get(node_id, set()):
                    if neighbor not in selected_ids:
                        next_frontier.add(neighbor)
                        selected_ids.add(neighbor)
            frontier = next_frontier
            if not frontier:
                break

        filtered_nodes = [node for node in nodes if node.get("id") in selected_ids]
        filtered_links = [
            link
            for link in links
            if link.get("from_id") in selected_ids and link.get("to_id") in selected_ids
        ]

        return {
            "query": query,
            "threshold": threshold,
            "hops": hops,
            "matches": matches,
            "nodes": filtered_nodes,
            "links": filtered_links,
        }

    def fetch_full_graph(self) -> Dict[str, Any]:
        """
        Return all nodes and links (excluding embeddings).
        """
        cypher = "MATCH (n) OPTIONAL MATCH (n)-[r]->(m) RETURN n, r, m"
        return self.query_cypher(cypher)


def get_graph_reader(
    graph_name: str = "seed",
    host: str = "localhost",
    port: int = 6379
) -> GraphReadOps:
    """Get a GraphReadOps instance."""
    return GraphReadOps(graph_name=graph_name, host=host, port=port)
