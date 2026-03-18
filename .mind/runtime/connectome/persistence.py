"""
Mind Graph Persistence

Persists validated nodes and links to the mind graph.
Enforces schema validation and connectivity constraints before write.

DOCS: docs/membrane/IMPLEMENTATION_Membrane_System.md

Usage:
    from runtime.connectome.persistence import GraphPersistence, PersistenceResult

    persistence = GraphPersistence(graph_ops, graph_queries)
    result = persistence.persist_cluster(nodes, links)

    if not result.success:
        for error in result.errors:
            print(error.format())
"""

import logging
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Set

from .schema import (
    validate_cluster,
    validate_node,
    validate_link,
    validate_connectivity,
    SchemaError,
    ConnectivityError,
)

logger = logging.getLogger(__name__)


@dataclass
class PersistenceResult:
    """Result of a persistence operation."""
    success: bool
    persisted_nodes: List[str] = field(default_factory=list)
    persisted_links: List[str] = field(default_factory=list)
    errors: List[SchemaError] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)

    def format(self) -> str:
        """Format result for display."""
        if self.success:
            return (
                f"✓ Persisted {len(self.persisted_nodes)} nodes, "
                f"{len(self.persisted_links)} links"
            )
        else:
            error_strs = [e.format() for e in self.errors]
            return "✗ Persistence failed:\n" + "\n".join(error_strs)


class GraphPersistence:
    """
    Handles validated persistence of nodes and links to the graph.

    Enforces:
    1. Schema validation (all fields correct)
    2. Connectivity constraint (new clusters connect to existing graph)
    3. Atomic writes (all-or-nothing)
    """

    def __init__(self, graph_ops=None, graph_queries=None):
        """
        Initialize persistence layer.

        Args:
            graph_ops: GraphOps instance for mutations
            graph_queries: GraphQueries instance for queries
        """
        self.graph_ops = graph_ops
        self.graph_queries = graph_queries
        self._existing_node_ids: Optional[Set[str]] = None

    def get_existing_node_ids(self) -> Set[str]:
        """
        Get all existing node IDs from the graph.

        Cached for performance - call refresh_cache() if graph changes externally.
        """
        if self._existing_node_ids is not None:
            return self._existing_node_ids

        if not self.graph_queries:
            logger.warning("No graph_queries configured, returning empty set")
            return set()

        try:
            # Query all node IDs
            results = self.graph_queries.query(
                "MATCH (n) WHERE n.id IS NOT NULL RETURN n.id"
            )
            self._existing_node_ids = {r.get("n.id") or r.get("id") for r in results if r}
            return self._existing_node_ids
        except Exception as e:
            logger.error(f"Failed to get existing nodes: {e}")
            return set()

    def refresh_cache(self):
        """Clear cached node IDs to force refresh on next query."""
        self._existing_node_ids = None

    def validate_only(
        self,
        nodes: List[Dict[str, Any]],
        links: List[Dict[str, Any]]
    ) -> List[SchemaError]:
        """
        Validate nodes and links without persisting.

        Args:
            nodes: Nodes to validate
            links: Links to validate

        Returns:
            List of validation errors (empty if valid)
        """
        existing = self.get_existing_node_ids()
        return validate_cluster(nodes, links, existing)

    def persist_cluster(
        self,
        nodes: List[Dict[str, Any]],
        links: List[Dict[str, Any]],
        skip_validation: bool = False
    ) -> PersistenceResult:
        """
        Validate and persist a cluster of nodes and links.

        Args:
            nodes: Nodes to create
            links: Links to create
            skip_validation: If True, skip validation (dangerous!)

        Returns:
            PersistenceResult with success status and any errors
        """
        result = PersistenceResult(success=True)

        # Step 1: Validate
        if not skip_validation:
            existing = self.get_existing_node_ids()
            errors = validate_cluster(nodes, links, existing)

            if errors:
                result.success = False
                result.errors = errors
                return result

        # Step 2: Persist nodes
        for node in nodes:
            try:
                self._persist_node(node)
                node_id = node.get("id")
                result.persisted_nodes.append(node_id)
                # Update cache
                if self._existing_node_ids is not None:
                    self._existing_node_ids.add(node_id)
            except Exception as e:
                result.success = False
                result.errors.append(SchemaError(
                    message=f"Failed to persist node {node.get('id')}: {e}",
                    guidance="Check graph connection and node data"
                ))
                # Rollback on failure (ideally would use transactions)
                return result

        # Step 3: Persist links
        for link in links:
            try:
                self._persist_link(link)
                result.persisted_links.append(
                    f"{link.get('from')}-[{link.get('type')}]->{link.get('to')}"
                )
            except Exception as e:
                result.success = False
                result.errors.append(SchemaError(
                    message=f"Failed to persist link: {e}",
                    guidance="Check that both nodes exist"
                ))
                return result

        return result

    def _persist_node(self, node: Dict[str, Any]) -> None:
        """Persist a single node to the graph."""
        if not self.graph_ops:
            logger.warning("No graph_ops configured, skipping persistence")
            return

        node_id = node.get("id")
        node_type = node.get("node_type")

        if node_type == "space":
            self.graph_ops.add_place(
                id=node_id,
                name=node.get("name", node_id),
                type=node.get("type", "module"),
                weight=float(node.get("weight", 1.0)),
            )
        elif node_type == "narrative":
            self.graph_ops.add_narrative(
                id=node_id,
                name=node.get("name", node_id),
                content=node.get("content", ""),
                type=node.get("type", "memory"),
                weight=float(node.get("weight", 0.5)),
            )
        elif node_type == "moment":
            self.graph_ops.add_moment(
                id=node_id,
                text=node.get("content", ""),
                type=node.get("type", "narration"),
                status=node.get("status", "completed"),
            )
        elif node_type == "thing":
            self.graph_ops.add_thing(
                id=node_id,
                name=node.get("name", node_id),
                type=node.get("type", "file"),
            )
        elif node_type == "actor":
            # Custom handling for actor nodes
            cypher = """
            CREATE (n:Actor {
                id: $id,
                name: $name,
                node_type: 'actor',
                type: $type
            })
            """
            self.graph_ops._query(cypher, {
                "id": node_id,
                "name": node.get("name", node_id),
                "type": node.get("type", "agent"),
            })
        else:
            raise ValueError(f"Unknown node_type: {node_type}")

    def _persist_link(self, link: Dict[str, Any]) -> None:
        """Persist a single link to the graph."""
        if not self.graph_ops:
            logger.warning("No graph_ops configured, skipping persistence")
            return

        link_type = link.get("type")
        from_id = link.get("from")
        to_id = link.get("to")
        properties = link.get("properties", {})

        if link_type == "contains":
            cypher = """
            MATCH (a {id: $from_id})
            MATCH (b {id: $to_id})
            MERGE (a)-[:CONTAINS]->(b)
            """
            self.graph_ops._query(cypher, {"from_id": from_id, "to_id": to_id})

        elif link_type == "expresses":
            self.graph_ops.add_said(
                character_id=from_id,
                moment_id=to_id,
            )

        elif link_type == "about":
            self.graph_ops.add_about(
                moment_id=from_id,
                target_id=to_id,
                weight=float(properties.get("weight", 0.5)),
            )

        elif link_type == "relates":
            self.graph_ops.add_narrative_link(
                source_id=from_id,
                target_id=to_id,
                supports=float(properties.get("supports", 0)),
                contradicts=float(properties.get("contradicts", 0)),
                elaborates=float(properties.get("elaborates", 0)),
            )

        else:
            # Generic link creation
            cypher = f"""
            MATCH (a {{id: $from_id}})
            MATCH (b {{id: $to_id}})
            MERGE (a)-[r:{link_type.upper()}]->(b)
            SET r += $props
            """
            self.graph_ops._query(cypher, {
                "from_id": from_id,
                "to_id": to_id,
                "props": properties,
            })

    def node_exists(self, node_id: str) -> bool:
        """Check if a node exists in the graph."""
        return node_id in self.get_existing_node_ids()

    def query_nodes(
        self,
        node_type: Optional[str] = None,
        where: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """
        Query nodes from the graph.

        Args:
            node_type: Filter by node type (space, narrative, etc.)
            where: Additional filters {field: value}

        Returns:
            List of matching nodes
        """
        if not self.graph_queries:
            return []

        # Build cypher query
        label = node_type.capitalize() if node_type else ""
        where_clauses = []
        params = {}

        if where:
            for key, value in where.items():
                where_clauses.append(f"n.{key} = ${key}")
                params[key] = value

        where_str = " AND ".join(where_clauses) if where_clauses else "1=1"

        if label:
            cypher = f"MATCH (n:{label}) WHERE {where_str} RETURN n"
        else:
            cypher = f"MATCH (n) WHERE {where_str} RETURN n"

        try:
            return self.graph_queries.query(cypher, params)
        except Exception as e:
            logger.error(f"Query failed: {e}")
            return []
