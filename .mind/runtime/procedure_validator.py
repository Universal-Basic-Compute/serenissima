"""
Procedure Validator — Validate cluster completeness.

Ensures that protocol-created clusters have all required nodes and links.
Used by protocol runner's validate step and as standalone checker.

Usage:
    validator = ProcedureValidator(graph_ops)
    result = validator.validate_cluster("health_coverage", "narrative_HEALTH_schema-compliance")
"""

import yaml
import logging
from pathlib import Path
from dataclasses import dataclass, field
from typing import Dict, List, Any, Optional

logger = logging.getLogger(__name__)


# =============================================================================
# DATA CLASSES
# =============================================================================

@dataclass
class ValidationResult:
    """Result of cluster validation."""
    valid: bool
    cluster_type: str
    root_node: str
    checks_passed: List[str] = field(default_factory=list)
    checks_failed: List[str] = field(default_factory=list)
    missing_nodes: List[str] = field(default_factory=list)
    missing_links: List[str] = field(default_factory=list)


@dataclass
class ClusterTemplate:
    """Template defining what a complete cluster looks like."""
    cluster_type: str
    required_nodes: List[Dict]
    required_links: List[Dict]
    optional_nodes: List[Dict] = field(default_factory=list)
    optional_links: List[Dict] = field(default_factory=list)


# =============================================================================
# CLUSTER TEMPLATES
# =============================================================================

CLUSTER_TEMPLATES = {
    'objective': ClusterTemplate(
        cluster_type='objective',
        required_nodes=[
            {'type': 'narrative.objective', 'fields': ['name', 'content']},
        ],
        required_links=[
            {'pattern': 'space -[contains]-> objective'},
            {'pattern': 'moment -[about]-> objective'},
        ],
    ),

    'pattern': ClusterTemplate(
        cluster_type='pattern',
        required_nodes=[
            {'type': 'narrative.pattern', 'fields': ['name', 'content']},
        ],
        required_links=[
            {'pattern': 'space -[contains]-> pattern'},
            {'pattern': 'pattern -[supports]-> objective', 'min': 1},
            {'pattern': 'moment -[about]-> pattern'},
        ],
    ),

    'behavior': ClusterTemplate(
        cluster_type='behavior',
        required_nodes=[
            {'type': 'narrative.behavior', 'fields': ['name', 'given', 'when', 'then']},
        ],
        required_links=[
            {'pattern': 'space -[contains]-> behavior'},
            {'pattern': 'behavior -[achieves]-> objective', 'min': 1},
            {'pattern': 'moment -[about]-> behavior'},
        ],
    ),

    'algorithm': ClusterTemplate(
        cluster_type='algorithm',
        required_nodes=[
            {'type': 'narrative.algorithm', 'fields': ['name', 'steps']},
        ],
        required_links=[
            {'pattern': 'space -[contains]-> algorithm'},
            {'pattern': 'algorithm -[implements]-> pattern'},
            {'pattern': 'algorithm -[enables]-> behavior', 'min': 1},
            {'pattern': 'moment -[about]-> algorithm'},
        ],
    ),

    'validation': ClusterTemplate(
        cluster_type='validation',
        required_nodes=[
            {'type': 'narrative.validation', 'fields': ['name', 'invariant', 'check']},
        ],
        required_links=[
            {'pattern': 'space -[contains]-> validation'},
            {'pattern': 'validation -[ensures]-> behavior', 'min': 1},
            {'pattern': 'moment -[about]-> validation'},
        ],
    ),

    'health_coverage': ClusterTemplate(
        cluster_type='health_coverage',
        required_nodes=[
            {'type': 'narrative.health', 'fields': ['name', 'priority', 'mechanism']},
            {'type': 'thing.dock', 'variant': 'input', 'fields': ['uri', 'direction']},
            {'type': 'thing.dock', 'variant': 'output', 'fields': ['uri', 'direction']},
        ],
        required_links=[
            {'pattern': 'space -[contains]-> health'},
            {'pattern': 'health -[verifies]-> validation', 'min': 1},
            {'pattern': 'dock -[attached_to]-> health', 'exactly': 2},
            {'pattern': 'dock -[observes]-> symbol', 'min': 2},
            {'pattern': 'moment -[about]-> health'},
        ],
    ),

    'problem': ClusterTemplate(
        cluster_type='problem',
        required_nodes=[
            {'type': 'narrative.problem', 'fields': ['name', 'severity', 'evidence']},
        ],
        required_links=[
            {'pattern': 'space -[contains]-> issue'},
            {'pattern': 'issue -[blocks]-> objective', 'min': 1},
            {'pattern': 'issue -[about]-> evidence'},
            {'pattern': 'moment -[about]-> issue'},
        ],
    ),
}


# =============================================================================
# PROTOCOL VALIDATOR
# =============================================================================

class ProcedureValidator:
    """
    Validate that clusters created by protocols are complete.
    """

    def __init__(self, graph_ops=None):
        self.graph = graph_ops

    def validate_cluster(
        self,
        cluster_type: str,
        root_node_id: str
    ) -> ValidationResult:
        """
        Validate a cluster against its template.

        Args:
            cluster_type: Type of cluster (e.g., 'health_coverage')
            root_node_id: ID of the root node of the cluster

        Returns:
            ValidationResult with pass/fail details
        """
        if cluster_type not in CLUSTER_TEMPLATES:
            return ValidationResult(
                valid=False,
                cluster_type=cluster_type,
                root_node=root_node_id,
                checks_failed=[f"Unknown cluster type: {cluster_type}"]
            )

        template = CLUSTER_TEMPLATES[cluster_type]
        result = ValidationResult(
            valid=True,
            cluster_type=cluster_type,
            root_node=root_node_id,
        )

        # Check required nodes
        for node_spec in template.required_nodes:
            if self._check_node_exists(root_node_id, node_spec):
                result.checks_passed.append(f"Node exists: {node_spec['type']}")
            else:
                result.checks_failed.append(f"Missing node: {node_spec['type']}")
                result.missing_nodes.append(node_spec['type'])
                result.valid = False

        # Check required links
        for link_spec in template.required_links:
            passed, msg = self._check_link_exists(root_node_id, link_spec)
            if passed:
                result.checks_passed.append(f"Link exists: {link_spec['pattern']}")
            else:
                result.checks_failed.append(msg)
                result.missing_links.append(link_spec['pattern'])
                result.valid = False

        return result

    def _check_node_exists(self, root_id: str, node_spec: Dict) -> bool:
        """Check if a required node exists."""
        if not self.graph:
            return True  # Can't check without graph

        node_type = node_spec['type']  # e.g., 'narrative.health'
        parts = node_type.split('.')

        query = """
        MATCH (n {id: $root_id})
        RETURN n.node_type as node_type, n.type as type
        """

        try:
            results = self.graph._query(query, {'root_id': root_id})
            if results:
                row = results[0]
                return row['node_type'] == parts[0] and row['type'] == parts[1]
        except:
            pass

        return False

    def _check_link_exists(self, root_id: str, link_spec: Dict) -> tuple:
        """Check if a required link pattern exists."""
        if not self.graph:
            return True, "OK"

        pattern = link_spec['pattern']
        min_count = link_spec.get('min', 1)
        exactly = link_spec.get('exactly')

        # Parse pattern like "health -[verifies]-> validation"
        # or "dock -[attached_to]-> health"
        import re
        match = re.match(r'(\w+)\s*-\[(\w+)\]->\s*(\w+)', pattern)
        if not match:
            return True, "OK"  # Can't parse, skip

        from_type, rel_type, to_type = match.groups()

        # Determine direction relative to root
        # If from_type matches root's type, query outgoing
        # If to_type matches root's type, query incoming

        query = f"""
        MATCH (root {{id: $root_id}})
        OPTIONAL MATCH (root)-[r:{rel_type.upper()}]->(target)
        RETURN count(r) as outgoing
        """

        try:
            results = self.graph._query(query, {'root_id': root_id})
            count = results[0]['outgoing'] if results else 0

            if exactly is not None:
                if count != exactly:
                    return False, f"Expected exactly {exactly} {rel_type} links, found {count}"
            elif count < min_count:
                return False, f"Expected at least {min_count} {rel_type} links, found {count}"

            return True, "OK"
        except Exception as e:
            return False, f"Query error: {e}"

    def validate_procedure_output(
        self,
        protocol_id: str,
        created_nodes: List[str],
        expected_template: str
    ) -> ValidationResult:
        """
        Validate that a protocol created a complete cluster.

        Args:
            protocol_id: ID of the protocol that ran
            created_nodes: List of node IDs that were created
            expected_template: Cluster template to validate against

        Returns:
            ValidationResult
        """
        if not created_nodes:
            return ValidationResult(
                valid=False,
                cluster_type=expected_template,
                root_node="",
                checks_failed=["No nodes created"]
            )

        # Find the root node (usually first non-moment node)
        root_id = None
        for node_id in created_nodes:
            if not node_id.startswith('moment_'):
                root_id = node_id
                break

        if not root_id:
            return ValidationResult(
                valid=False,
                cluster_type=expected_template,
                root_node="",
                checks_failed=["No root node found (only moments created)"]
            )

        return self.validate_cluster(expected_template, root_id)

    def find_incomplete_clusters(
        self,
        cluster_type: str,
        space_id: str = None
    ) -> List[ValidationResult]:
        """
        Find all incomplete clusters of a given type.

        Args:
            cluster_type: Type of cluster to check
            space_id: Optional space to limit search

        Returns:
            List of ValidationResults for incomplete clusters
        """
        if cluster_type not in CLUSTER_TEMPLATES:
            return []

        template = CLUSTER_TEMPLATES[cluster_type]
        node_type = template.required_nodes[0]['type']
        parts = node_type.split('.')

        # Find all nodes of this type
        if space_id:
            query = """
            MATCH (s {id: $space_id})-[:CONTAINS]->(n)
            WHERE n.node_type = $node_type AND n.type = $type
            RETURN n.id as id
            """
            params = {'space_id': space_id, 'node_type': parts[0], 'type': parts[1]}
        else:
            query = """
            MATCH (n)
            WHERE n.node_type = $node_type AND n.type = $type
            RETURN n.id as id
            """
            params = {'node_type': parts[0], 'type': parts[1]}

        incomplete = []

        if self.graph:
            try:
                results = self.graph._query(query, params)
                for row in results:
                    node_id = row['id']
                    validation = self.validate_cluster(cluster_type, node_id)
                    if not validation.valid:
                        incomplete.append(validation)
            except:
                pass

        return incomplete


# =============================================================================
# CLI HELPER
# =============================================================================

def validate_cluster_command(
    cluster_type: str,
    root_node_id: str,
    graph_name: str = None
) -> ValidationResult:
    """
    Validate a cluster from CLI.
    """
    graph_ops = None
    if graph_name:
        try:
            from runtime.physics.graph.graph_ops import GraphOps
            graph_ops = GraphOps(graph_name=graph_name)
        except:
            pass

    validator = ProcedureValidator(graph_ops)
    return validator.validate_cluster(cluster_type, root_node_id)


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Validate a cluster")
    parser.add_argument("cluster_type", help="Cluster type (e.g., health_coverage)")
    parser.add_argument("root_node", help="Root node ID")
    parser.add_argument("--graph", "-g", help="Graph name")

    args = parser.parse_args()

    result = validate_cluster_command(args.cluster_type, args.root_node, args.graph)

    print(f"\nCluster: {result.cluster_type}")
    print(f"Root: {result.root_node}")
    print(f"Valid: {result.valid}")

    if result.checks_passed:
        print(f"\nPassed ({len(result.checks_passed)}):")
        for check in result.checks_passed:
            print(f"  + {check}")

    if result.checks_failed:
        print(f"\nFailed ({len(result.checks_failed)}):")
        for check in result.checks_failed:
            print(f"  - {check}")
