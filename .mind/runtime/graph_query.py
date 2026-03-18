"""
Graph Query — Query interface for reading the graph.

Provides high-level query functions for reading graph data.
No docs - the graph IS the documentation.

Usage:
    query = GraphQuery(graph_ops)

    # Find nodes
    health_indicators = query.find("narrative.health", in_space="space_MODULE_schema")

    # Get node with context
    context = query.context("narrative_HEALTH_schema-compliance", depth=2)

    # Find coverage gaps
    uncovered = query.find_uncovered("narrative.validation", by="narrative.health", via="verifies")
"""

import logging
from dataclasses import dataclass, field
from typing import Dict, List, Any, Optional

logger = logging.getLogger(__name__)


# =============================================================================
# DATA CLASSES
# =============================================================================

@dataclass
class NodeInfo:
    """Information about a node."""
    id: str
    node_type: str
    type: str
    name: str
    properties: Dict = field(default_factory=dict)


@dataclass
class LinkInfo:
    """Information about a link."""
    from_id: str
    to_id: str
    rel_type: str
    direction: str = ""
    properties: Dict = field(default_factory=dict)


@dataclass
class NodeContext:
    """A node with its surrounding context."""
    node: NodeInfo
    incoming: List[LinkInfo] = field(default_factory=list)
    outgoing: List[LinkInfo] = field(default_factory=list)
    neighbors: Dict[str, List[NodeInfo]] = field(default_factory=dict)


# =============================================================================
# GRAPH QUERY
# =============================================================================

class GraphQuery:
    """
    High-level query interface for the graph.
    """

    def __init__(self, graph_ops=None):
        self.graph = graph_ops

    def find(
        self,
        node_type: str,
        where: Dict = None,
        in_space: str = None,
        limit: int = 100
    ) -> List[NodeInfo]:
        """
        Find nodes by type and optional filters.

        Args:
            node_type: Type like "narrative.health" or "thing.file"
            where: Additional property filters
            in_space: Space ID to limit search
            limit: Maximum results

        Returns:
            List of NodeInfo
        """
        if not self.graph:
            return []

        parts = node_type.split('.')
        if len(parts) != 2:
            logger.warning(f"Invalid node_type format: {node_type}")
            return []

        nt, t = parts

        conditions = [f"n.node_type = '{nt}'", f"n.type = '{t}'"]

        if where:
            for k, v in where.items():
                if isinstance(v, str):
                    conditions.append(f"n.{k} = '{v}'")
                elif isinstance(v, list):
                    conditions.append(f"n.{k} IN {v}")
                else:
                    conditions.append(f"n.{k} = {v}")

        where_clause = " AND ".join(conditions)

        if in_space:
            query = f"""
            MATCH (s {{id: $space_id}})-[:CONTAINS]->(n)
            WHERE {where_clause}
            RETURN n
            LIMIT {limit}
            """
            params = {'space_id': in_space}
        else:
            query = f"""
            MATCH (n)
            WHERE {where_clause}
            RETURN n
            LIMIT {limit}
            """
            params = {}

        try:
            results = self.graph._query(query, params)
            return [self._node_from_result(r['n']) for r in results]
        except Exception as e:
            logger.error(f"Query failed: {e}")
            return []

    def get(self, node_id: str) -> Optional[NodeInfo]:
        """
        Get a single node by ID.
        """
        if not self.graph:
            return None

        query = "MATCH (n {id: $id}) RETURN n"

        try:
            results = self.graph._query(query, {'id': node_id})
            if results:
                return self._node_from_result(results[0]['n'])
        except:
            pass

        return None

    def context(self, node_id: str, depth: int = 1) -> Optional[NodeContext]:
        """
        Get a node with its surrounding context.

        Args:
            node_id: Node ID
            depth: How many hops to traverse

        Returns:
            NodeContext with node and its neighbors
        """
        node = self.get(node_id)
        if not node:
            return None

        ctx = NodeContext(node=node)

        if not self.graph:
            return ctx

        # Get outgoing links
        out_query = """
        MATCH (n {id: $id})-[r]->(target)
        RETURN type(r) as rel_type, r.direction as direction, target
        """

        try:
            results = self.graph._query(out_query, {'id': node_id})
            for row in results:
                rel_type = row['rel_type']
                direction = row.get('direction', '')
                target = self._node_from_result(row['target'])

                ctx.outgoing.append(LinkInfo(
                    from_id=node_id,
                    to_id=target.id,
                    rel_type=rel_type,
                    direction=direction,
                ))

                key = f"{rel_type}_{direction}" if direction else rel_type
                if key not in ctx.neighbors:
                    ctx.neighbors[key] = []
                ctx.neighbors[key].append(target)
        except:
            pass

        # Get incoming links
        in_query = """
        MATCH (source)-[r]->(n {id: $id})
        RETURN type(r) as rel_type, r.direction as direction, source
        """

        try:
            results = self.graph._query(in_query, {'id': node_id})
            for row in results:
                rel_type = row['rel_type']
                direction = row.get('direction', '')
                source = self._node_from_result(row['source'])

                ctx.incoming.append(LinkInfo(
                    from_id=source.id,
                    to_id=node_id,
                    rel_type=rel_type,
                    direction=direction,
                ))

                key = f"incoming_{rel_type}"
                if key not in ctx.neighbors:
                    ctx.neighbors[key] = []
                ctx.neighbors[key].append(source)
        except:
            pass

        return ctx

    def find_uncovered(
        self,
        target_type: str,
        by: str,
        via: str,
        in_space: str = None
    ) -> List[NodeInfo]:
        """
        Find nodes that are NOT linked to by another type.

        Example: find_uncovered("narrative.validation", by="narrative.health", via="verifies")
        Returns validations that have no health indicator verifying them.

        Args:
            target_type: Type of nodes to find (e.g., "narrative.validation")
            by: Type of nodes that should link (e.g., "narrative.health")
            via: Relationship direction (e.g., "verifies")
            in_space: Optional space to limit search

        Returns:
            List of uncovered nodes
        """
        if not self.graph:
            return []

        target_parts = target_type.split('.')
        by_parts = by.split('.')

        if len(target_parts) != 2 or len(by_parts) != 2:
            return []

        if in_space:
            query = f"""
            MATCH (s {{id: $space_id}})-[:CONTAINS]->(target)
            WHERE target.node_type = '{target_parts[0]}' AND target.type = '{target_parts[1]}'
            AND NOT EXISTS {{
                MATCH (source)-[r:RELATES {{direction: '{via}'}}]->(target)
                WHERE source.node_type = '{by_parts[0]}' AND source.type = '{by_parts[1]}'
            }}
            RETURN target
            """
            params = {'space_id': in_space}
        else:
            query = f"""
            MATCH (target)
            WHERE target.node_type = '{target_parts[0]}' AND target.type = '{target_parts[1]}'
            AND NOT EXISTS {{
                MATCH (source)-[r:RELATES {{direction: '{via}'}}]->(target)
                WHERE source.node_type = '{by_parts[0]}' AND source.type = '{by_parts[1]}'
            }}
            RETURN target
            """
            params = {}

        try:
            results = self.graph._query(query, params)
            return [self._node_from_result(r['target']) for r in results]
        except Exception as e:
            logger.error(f"Uncovered query failed: {e}")
            return []

    def find_orphans(self, node_type: str = None) -> List[NodeInfo]:
        """
        Find nodes not contained in any space.
        """
        if not self.graph:
            return []

        if node_type:
            parts = node_type.split('.')
            where = f"WHERE n.node_type = '{parts[0]}' AND n.type = '{parts[1]}'"
        else:
            where = ""

        query = f"""
        MATCH (n)
        {where}
        WHERE NOT EXISTS {{
            MATCH (s:Space)-[:CONTAINS]->(n)
        }}
        AND n.node_type <> 'space'
        RETURN n
        """

        try:
            results = self.graph._query(query)
            return [self._node_from_result(r['n']) for r in results]
        except:
            return []

    def find_stubs(self) -> List[NodeInfo]:
        """
        Find stub nodes (created as reference targets but not fully defined).
        """
        if not self.graph:
            return []

        query = """
        MATCH (n)
        WHERE n.stub = true
        RETURN n
        """

        try:
            results = self.graph._query(query)
            return [self._node_from_result(r['n']) for r in results]
        except:
            return []

    def traverse(
        self,
        start_id: str,
        path: List[str],
        depth: int = 3
    ) -> List[List[NodeInfo]]:
        """
        Traverse a path from a starting node.

        Args:
            start_id: Starting node ID
            path: List of relationship patterns like ["verifies", "ensures", "achieves"]
            depth: Maximum depth

        Returns:
            List of paths (each path is a list of nodes)
        """
        if not self.graph or not path:
            return []

        # Build path pattern
        path_pattern = "(start {id: $start_id})"
        for i, rel in enumerate(path[:depth]):
            path_pattern += f"-[:{rel.upper()}]->(n{i})"

        return_vars = ", ".join([f"n{i}" for i in range(len(path[:depth]))])

        query = f"""
        MATCH {path_pattern}
        RETURN {return_vars}
        """

        try:
            results = self.graph._query(query, {'start_id': start_id})
            paths = []
            for row in results:
                path_nodes = [self._node_from_result(row[f'n{i}']) for i in range(len(path[:depth]))]
                paths.append(path_nodes)
            return paths
        except:
            return []

    def _node_from_result(self, node_data) -> NodeInfo:
        """Convert graph result to NodeInfo."""
        if isinstance(node_data, dict):
            return NodeInfo(
                id=node_data.get('id', ''),
                node_type=node_data.get('node_type', ''),
                type=node_data.get('type', ''),
                name=node_data.get('name', ''),
                properties={k: v for k, v in node_data.items()
                           if k not in ('id', 'node_type', 'type', 'name')}
            )
        # Handle FalkorDB node objects
        props = dict(node_data.properties) if hasattr(node_data, 'properties') else {}
        return NodeInfo(
            id=props.get('id', ''),
            node_type=props.get('node_type', ''),
            type=props.get('type', ''),
            name=props.get('name', ''),
            properties={k: v for k, v in props.items()
                       if k not in ('id', 'node_type', 'type', 'name')}
        )


# =============================================================================
# CONTEXT RENDERER
# =============================================================================

def render_context(ctx: NodeContext, indent: int = 0) -> str:
    """
    Render a node context as readable text.
    """
    lines = []
    prefix = "  " * indent

    # Node header
    lines.append(f"{prefix}{ctx.node.id}")
    lines.append(f"{prefix}  name: {ctx.node.name}")
    lines.append(f"{prefix}  type: {ctx.node.node_type}.{ctx.node.type}")

    # Properties
    for k, v in ctx.node.properties.items():
        if k not in ('created_at_s', 'updated_at_s') and v:
            lines.append(f"{prefix}  {k}: {v}")

    # Grouped neighbors
    for rel_key, neighbors in ctx.neighbors.items():
        lines.append(f"{prefix}  {rel_key}:")
        for neighbor in neighbors:
            lines.append(f"{prefix}    - {neighbor.name} ({neighbor.id})")

    return "\n".join(lines)


# =============================================================================
# CLI HELPER
# =============================================================================

def query_command(
    query_type: str,
    args: Dict,
    graph_name: str = None
) -> Any:
    """
    Run a query from CLI.
    """
    graph_ops = None
    if graph_name:
        try:
            from runtime.physics.graph.graph_ops import GraphOps
            graph_ops = GraphOps(graph_name=graph_name)
        except:
            pass

    query = GraphQuery(graph_ops)

    if query_type == 'find':
        return query.find(
            args.get('type'),
            where=args.get('where'),
            in_space=args.get('in_space'),
        )
    elif query_type == 'context':
        ctx = query.context(args.get('node_id'), depth=args.get('depth', 2))
        if ctx:
            return render_context(ctx)
        return "Node not found"
    elif query_type == 'uncovered':
        return query.find_uncovered(
            args.get('target'),
            by=args.get('by'),
            via=args.get('via'),
        )
    elif query_type == 'orphans':
        return query.find_orphans(args.get('type'))
    elif query_type == 'stubs':
        return query.find_stubs()

    return None


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Query the graph")
    parser.add_argument("query_type", choices=['find', 'context', 'uncovered', 'orphans', 'stubs'])
    parser.add_argument("--type", "-t", help="Node type (e.g., narrative.health)")
    parser.add_argument("--node", "-n", help="Node ID for context")
    parser.add_argument("--space", "-s", help="Space ID")
    parser.add_argument("--by", help="For uncovered: type that should link")
    parser.add_argument("--via", help="For uncovered: relationship direction")
    parser.add_argument("--depth", "-d", type=int, default=2, help="Context depth")
    parser.add_argument("--graph", "-g", help="Graph name")

    args = parser.parse_args()

    result = query_command(
        args.query_type,
        {
            'type': args.type,
            'node_id': args.node,
            'in_space': args.space,
            'target': args.type,
            'by': args.by,
            'via': args.via,
            'depth': args.depth,
        },
        args.graph
    )

    if isinstance(result, str):
        print(result)
    elif isinstance(result, list):
        for item in result:
            if hasattr(item, 'id'):
                print(f"{item.id}: {item.name}")
            else:
                print(item)
    else:
        print(result)
