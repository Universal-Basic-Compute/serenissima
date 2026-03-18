"""
Graph Schema Cleanup — Delete nodes that don't follow the schema.

Nodes must have:
- node_type: one of (actor, moment, narrative, space, thing)
- id: non-empty string

Links must have:
- Valid source and target nodes

Usage:
    from runtime.physics.graph.graph_schema_cleanup import cleanup_invalid_nodes

    # Dry run (report only)
    report = cleanup_invalid_nodes(dry_run=True)

    # Actually delete
    report = cleanup_invalid_nodes(dry_run=False)
"""

from dataclasses import dataclass, field
from typing import List, Optional
import logging

logger = logging.getLogger(__name__)

VALID_NODE_TYPES = {"actor", "moment", "narrative", "space", "thing"}


@dataclass
class CleanupReport:
    """Report of cleanup operation."""
    dry_run: bool
    nodes_checked: int = 0
    nodes_invalid: int = 0
    nodes_deleted: int = 0
    links_deleted: int = 0
    invalid_nodes: List[dict] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)


def cleanup_invalid_nodes(
    graph_name: Optional[str] = None,
    dry_run: bool = True,
) -> CleanupReport:
    """
    Find and delete nodes that don't follow the schema.

    Invalid nodes:
    - node_type is NULL
    - node_type not in valid set
    - id is NULL or empty

    Args:
        graph_name: Graph to clean (uses config default if None)
        dry_run: If True, only report what would be deleted

    Returns:
        CleanupReport with details of what was (or would be) deleted
    """
    from runtime.physics.graph.graph_queries import GraphQueries

    report = CleanupReport(dry_run=dry_run)

    try:
        gq = GraphQueries(graph_name=graph_name)
    except Exception as e:
        report.errors.append(f"Failed to connect to graph: {e}")
        return report

    # Find invalid nodes
    invalid_queries = [
        # Nodes with NULL node_type
        ("NULL node_type", "MATCH (n) WHERE n.node_type IS NULL RETURN n.id, labels(n)[0] as label"),
        # Nodes with invalid node_type
        ("Invalid node_type", f"""
            MATCH (n)
            WHERE n.node_type IS NOT NULL
            AND NOT n.node_type IN {list(VALID_NODE_TYPES)}
            RETURN n.id, n.node_type
        """),
        # Nodes with NULL or empty id
        ("NULL/empty id", "MATCH (n) WHERE n.id IS NULL OR n.id = '' RETURN n.id, n.node_type"),
    ]

    for reason, query in invalid_queries:
        try:
            results = gq._query(query)
            for row in results:
                node_id = row[0]
                extra_info = row[1] if len(row) > 1 else None
                report.invalid_nodes.append({
                    "id": node_id,
                    "reason": reason,
                    "info": extra_info,
                })
        except Exception as e:
            report.errors.append(f"Query failed ({reason}): {e}")

    report.nodes_invalid = len(report.invalid_nodes)

    # Count total nodes
    try:
        result = gq._query("MATCH (n) RETURN count(n)")
        report.nodes_checked = result[0][0] if result else 0
    except:
        pass

    if dry_run:
        logger.info(f"Dry run: would delete {report.nodes_invalid} invalid nodes")
        return report

    # Delete invalid nodes and their links
    for node_info in report.invalid_nodes:
        node_id = node_info["id"]
        if node_id is None:
            # Can't delete by ID if ID is NULL - delete by other criteria
            continue

        try:
            # Count links first
            link_result = gq._query(f"""
                MATCH (n {{id: '{node_id}'}})-[r]-()
                RETURN count(r)
            """)
            link_count = link_result[0][0] if link_result else 0

            # Delete node and its links
            gq._query(f"MATCH (n {{id: '{node_id}'}}) DETACH DELETE n")

            report.nodes_deleted += 1
            report.links_deleted += link_count

        except Exception as e:
            report.errors.append(f"Failed to delete {node_id}: {e}")

    # Handle nodes with NULL id separately
    null_id_nodes = [n for n in report.invalid_nodes if n["id"] is None]
    if null_id_nodes:
        try:
            # Count
            result = gq._query("MATCH (n) WHERE n.id IS NULL RETURN count(n)")
            null_count = result[0][0] if result else 0

            # Delete all nodes with NULL id
            gq._query("MATCH (n) WHERE n.id IS NULL DETACH DELETE n")
            report.nodes_deleted += null_count

        except Exception as e:
            report.errors.append(f"Failed to delete NULL id nodes: {e}")

    logger.info(f"Deleted {report.nodes_deleted} nodes and {report.links_deleted} links")

    return report


def fix_node_types_from_labels(
    graph_name: Optional[str] = None,
    dry_run: bool = True,
) -> dict:
    """
    Set node_type property from labels where NULL.

    This is a repair operation, not a delete.
    Use cleanup_invalid_nodes() to delete unfixable nodes.

    Returns:
        Dict with counts of fixed nodes per type
    """
    from runtime.physics.graph.graph_queries import GraphQueries

    try:
        gq = GraphQueries(graph_name=graph_name)
    except Exception as e:
        return {"error": str(e)}

    label_to_type = {
        "Thing": "thing",
        "Space": "space",
        "Actor": "actor",
        "Moment": "moment",
        "Narrative": "narrative",
    }

    results = {}

    for label, node_type in label_to_type.items():
        try:
            if dry_run:
                result = gq._query(f"""
                    MATCH (n:{label})
                    WHERE n.node_type IS NULL
                    RETURN count(n)
                """)
                count = result[0][0] if result else 0
            else:
                result = gq._query(f"""
                    MATCH (n:{label})
                    WHERE n.node_type IS NULL
                    SET n.node_type = '{node_type}'
                    RETURN count(n)
                """)
                count = result[0][0] if result else 0

            if count > 0:
                results[label] = count

        except Exception as e:
            results[f"{label}_error"] = str(e)

    return results


def get_schema_health() -> dict:
    """
    Quick health check of graph schema compliance.

    Returns:
        Dict with counts of valid/invalid nodes
    """
    from runtime.physics.graph.graph_queries import GraphQueries

    try:
        gq = GraphQueries()
    except Exception as e:
        return {"error": str(e)}

    health = {
        "total_nodes": 0,
        "valid_nodes": 0,
        "null_node_type": 0,
        "invalid_node_type": 0,
        "null_id": 0,
        "by_type": {},
    }

    # Total nodes
    result = gq._query("MATCH (n) RETURN count(n)")
    health["total_nodes"] = result[0][0] if result else 0

    # Null node_type
    result = gq._query("MATCH (n) WHERE n.node_type IS NULL RETURN count(n)")
    health["null_node_type"] = result[0][0] if result else 0

    # Invalid node_type
    result = gq._query(f"""
        MATCH (n)
        WHERE n.node_type IS NOT NULL
        AND NOT n.node_type IN {list(VALID_NODE_TYPES)}
        RETURN count(n)
    """)
    health["invalid_node_type"] = result[0][0] if result else 0

    # Null id
    result = gq._query("MATCH (n) WHERE n.id IS NULL OR n.id = '' RETURN count(n)")
    health["null_id"] = result[0][0] if result else 0

    # By type
    result = gq._query("MATCH (n) RETURN n.node_type, count(n) ORDER BY count(n) DESC")
    for row in result:
        health["by_type"][row[0] or "NULL"] = row[1]

    # Valid = total - invalid
    health["valid_nodes"] = health["total_nodes"] - health["null_node_type"] - health["invalid_node_type"] - health["null_id"]

    return health


if __name__ == "__main__":
    import argparse
    import json

    parser = argparse.ArgumentParser(description="Graph schema cleanup")
    parser.add_argument("action", choices=["health", "fix", "cleanup"],
                       help="Action to perform")
    parser.add_argument("--dry-run", action="store_true", default=True,
                       help="Report only, don't modify (default)")
    parser.add_argument("--execute", action="store_true",
                       help="Actually perform deletions/fixes")
    parser.add_argument("--graph", help="Graph name")

    args = parser.parse_args()
    dry_run = not args.execute

    if args.action == "health":
        result = get_schema_health()
        print(json.dumps(result, indent=2))

    elif args.action == "fix":
        result = fix_node_types_from_labels(args.graph, dry_run=dry_run)
        print(f"{'Would fix' if dry_run else 'Fixed'}:")
        print(json.dumps(result, indent=2))

    elif args.action == "cleanup":
        report = cleanup_invalid_nodes(args.graph, dry_run=dry_run)
        print(f"Cleanup Report ({'DRY RUN' if dry_run else 'EXECUTED'}):")
        print(f"  Nodes checked: {report.nodes_checked}")
        print(f"  Invalid nodes: {report.nodes_invalid}")
        print(f"  Nodes deleted: {report.nodes_deleted}")
        print(f"  Links deleted: {report.links_deleted}")
        if report.invalid_nodes and dry_run:
            print(f"\nInvalid nodes (first 10):")
            for node in report.invalid_nodes[:10]:
                print(f"  {node['id']}: {node['reason']} ({node['info']})")
        if report.errors:
            print(f"\nErrors:")
            for err in report.errors:
                print(f"  {err}")
