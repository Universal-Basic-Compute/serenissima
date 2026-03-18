"""
Cluster Metrics — Connection scoring, target validation, and link suggestions.

Implements three capabilities from SKILL_Add_Cluster_Dynamic_Creation:
1. Connection Scoring - links_per_node, external_ratio, orphan_score
2. Valid Target Enforcement - type checking on links
3. Suggestion Engine - find existing nodes to link to

Usage:
    metrics = ClusterMetrics(graph_ops)

    # Score a cluster
    score = metrics.score_cluster(nodes_created, links_created)

    # Validate link targets
    errors = metrics.validate_targets(links_created)

    # Get link suggestions
    suggestions = metrics.suggest_links(node_id, node_type, space_id)
"""

import logging
from dataclasses import dataclass, field
from typing import Dict, List, Any, Optional, Tuple, Set

logger = logging.getLogger(__name__)


# =============================================================================
# DATA CLASSES
# =============================================================================

@dataclass
class ConnectionScore:
    """Connection metrics for a cluster."""
    total_nodes: int = 0
    total_links: int = 0
    internal_links: int = 0
    external_links: int = 0
    links_per_node: float = 0.0
    external_ratio: float = 0.0
    orphan_count: int = 0
    verdict: str = "UNKNOWN"

    # Thresholds
    LINKS_MIN = 2.0
    LINKS_GOOD = 3.5
    LINKS_EXCELLENT = 5.0
    RATIO_MIN = 0.30
    RATIO_GOOD = 0.50
    RATIO_EXCELLENT = 0.70

    def calculate_verdict(self) -> str:
        """Calculate overall verdict based on metrics."""
        if self.orphan_count > 0:
            return "FAIL - Orphan nodes detected"
        if self.links_per_node < self.LINKS_MIN:
            return "SPARSE - Below minimum connection"
        if self.external_ratio < self.RATIO_MIN:
            return "ISOLATED - Too few external links"
        if self.links_per_node >= self.LINKS_EXCELLENT and self.external_ratio >= self.RATIO_EXCELLENT:
            return "EXCELLENT"
        if self.links_per_node >= self.LINKS_GOOD and self.external_ratio >= self.RATIO_GOOD:
            return "GOOD"
        return "ACCEPTABLE"


@dataclass
class LinkSuggestion:
    """A suggested link to an existing node."""
    target_id: str
    target_name: str
    target_type: str
    link_type: str
    direction: str  # 'outgoing' or 'incoming'
    reason: str
    priority: int = 0  # Higher = more important


@dataclass
class TargetValidation:
    """Result of validating link targets."""
    valid: bool
    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)


# =============================================================================
# VALID LINK TARGETS (from skill spec)
# =============================================================================

VALID_TARGETS = {
    'narrative.health': {
        'verifies': {'target': ['narrative.validation'], 'min': 1, 'max': None},
        'checks': {'target': ['narrative.algorithm'], 'min': 1, 'max': 1},
        'supports': {'target': ['narrative.objective'], 'min': 0, 'max': None},
        'attached_to': {'source': ['thing.dock'], 'exactly': 2},
    },
    'narrative.validation': {
        'ensures': {'target': ['narrative.behavior'], 'min': 1, 'max': None},
        'elaborates': {'target': ['narrative.pattern'], 'min': 0, 'max': 1},
        'supports': {'target': ['narrative.objective'], 'min': 0, 'max': None},
        'covered_by': {'source': ['narrative.health'], 'min': 0, 'max': None},
    },
    'narrative.implementation': {
        'realizes': {'target': ['narrative.algorithm'], 'min': 1, 'max': 1},
        'follows': {'target': ['narrative.pattern'], 'min': 0, 'max': None},
        'attached_to': {'source': ['thing.dock'], 'min': 1},
    },
    'narrative.algorithm': {
        'implements': {'target': ['narrative.pattern'], 'min': 1, 'max': 1},
        'enables': {'target': ['narrative.behavior'], 'min': 1, 'max': None},
        'checked_by': {'source': ['narrative.health'], 'min': 0, 'max': None},
        'realized_by': {'source': ['narrative.implementation'], 'min': 0, 'max': None},
    },
    'narrative.behavior': {
        'serves': {'target': ['narrative.objective'], 'min': 1, 'max': None},
        'enabled_by': {'source': ['narrative.pattern', 'narrative.algorithm'], 'min': 0, 'max': None},
        'ensured_by': {'source': ['narrative.validation'], 'min': 0, 'max': None},
    },
    'narrative.pattern': {
        'achieves': {'target': ['narrative.objective'], 'min': 1, 'max': None},
        'enables': {'target': ['narrative.behavior'], 'min': 1, 'max': None},
        'implemented_by': {'source': ['narrative.algorithm'], 'min': 0, 'max': None},
        'followed_by': {'source': ['narrative.implementation'], 'min': 0, 'max': None},
    },
    'narrative.objective': {
        'served_by': {'source': ['narrative.behavior'], 'min': 0, 'max': None},
        'achieved_by': {'source': ['narrative.pattern'], 'min': 0, 'max': None},
        'supported_by': {'source': ['narrative.objective', 'narrative.validation', 'narrative.health'], 'min': 0, 'max': None},
        'bounds': {'source': ['narrative.objective', 'narrative.non_objective'], 'min': 0, 'max': None},
    },
    'narrative.non_objective': {
        'bounds': {'target': ['narrative.objective'], 'min': 1, 'max': 1},
    },
    'narrative.documentation': {
        'contains': {'source': ['space.module', 'space.area'], 'exactly': 1},
        'precedes': {'target': ['narrative.documentation'], 'min': 0, 'max': 1},
        'about': {'source': ['moment.event'], 'min': 0},
    },
    'thing.dock': {
        'attached_to': {'target': ['narrative.health', 'narrative.implementation'], 'exactly': 1},
        'observes': {'target': ['thing.func', 'thing.method', 'thing.class'], 'min': 1, 'max': 1},
    },
}

# Required fields by node type
REQUIRED_FIELDS = {
    'narrative.health': ['name', 'mechanism'],
    'narrative.validation': ['name', 'content'],
    'narrative.algorithm': ['name', 'steps'],
    'narrative.behavior': ['name', 'content'],
    'narrative.pattern': ['name', 'content', 'rationale'],
    'narrative.objective': ['name', 'content', 'rationale'],
    'narrative.non_objective': ['name', 'content'],
    'narrative.implementation': ['name', 'code_files', 'data_flow'],
    'narrative.documentation': ['title', 'content', 'chain_type'],
    'thing.dock': ['direction', 'location'],
}


# =============================================================================
# CLUSTER METRICS
# =============================================================================

class ClusterMetrics:
    """
    Calculate cluster connection and provide link suggestions.
    """

    def __init__(self, graph_ops=None):
        self.graph = graph_ops

    # -------------------------------------------------------------------------
    # 1. CONNECTION SCORING
    # -------------------------------------------------------------------------

    def score_cluster(
        self,
        nodes_created: List[str],
        links_created: List[Dict],
        existing_node_ids: Set[str] = None
    ) -> ConnectionScore:
        """
        Calculate connection score for a cluster.

        Args:
            nodes_created: List of node IDs created in this cluster
            links_created: List of link dicts with 'from', 'to', 'type'
            existing_node_ids: Set of pre-existing node IDs (for external ratio)

        Returns:
            ConnectionScore with metrics and verdict
        """
        if existing_node_ids is None:
            existing_node_ids = set()

        created_set = set(nodes_created)
        score = ConnectionScore()
        score.total_nodes = len(nodes_created)
        score.total_links = len(links_created)

        if score.total_nodes == 0:
            score.verdict = "EMPTY - No nodes created"
            return score

        # Count internal vs external links
        node_link_counts = {n: 0 for n in nodes_created}

        for link in links_created:
            from_id = link.get('from', '')
            to_id = link.get('to', '')

            from_internal = from_id in created_set
            to_internal = to_id in created_set

            if from_internal and to_internal:
                score.internal_links += 1
            else:
                score.external_links += 1

            # Count links per node (only for created nodes)
            if from_id in node_link_counts:
                node_link_counts[from_id] += 1
            if to_id in node_link_counts:
                node_link_counts[to_id] += 1

        # Calculate metrics
        score.links_per_node = score.total_links / score.total_nodes if score.total_nodes > 0 else 0
        score.external_ratio = score.external_links / score.total_links if score.total_links > 0 else 0

        # Count orphan nodes (nodes with only 'contains' link or no links)
        for node_id, link_count in node_link_counts.items():
            if link_count <= 1:  # Only contains link or nothing
                score.orphan_count += 1

        # Determine verdict
        score.verdict = score.calculate_verdict()

        return score

    def format_score(self, score: ConnectionScore) -> str:
        """Format connection score for display."""
        lines = [
            "CONNECTION SCORE",
            "=" * 40,
            f"Nodes: {score.total_nodes}",
            f"Links: {score.total_links} (internal: {score.internal_links}, external: {score.external_links})",
            f"Links/node: {score.links_per_node:.1f} (min: {score.LINKS_MIN}, good: {score.LINKS_GOOD}+)",
            f"External ratio: {score.external_ratio:.0%} (min: {score.RATIO_MIN:.0%}, good: {score.RATIO_GOOD:.0%}+)",
            f"Orphan nodes: {score.orphan_count}",
            "",
            f"VERDICT: {score.verdict}",
            "=" * 40,
        ]
        return "\n".join(lines)

    # -------------------------------------------------------------------------
    # 2. VALID TARGET ENFORCEMENT
    # -------------------------------------------------------------------------

    def validate_targets(
        self,
        primary_node_type: str,
        links_created: List[Dict],
        nodes_created: List[Dict]
    ) -> TargetValidation:
        """
        Validate that links have valid target/source types and correct cardinality.

        Args:
            primary_node_type: Type of primary node (e.g., 'narrative.health')
            links_created: List of link dicts
            nodes_created: List of node dicts with 'id', 'node_type', 'type'

        Returns:
            TargetValidation with errors and warnings
        """
        result = TargetValidation(valid=True)

        if primary_node_type not in VALID_TARGETS:
            result.warnings.append(f"No target rules defined for {primary_node_type}")
            return result

        rules = VALID_TARGETS[primary_node_type]

        # Build node type map
        node_types = {}
        for node in nodes_created:
            node_id = node.get('id', '')
            nt = node.get('node_type', '')
            t = node.get('type', '')
            node_types[node_id] = f"{nt}.{t}"

        # Identify primary node ID (for direction checking)
        primary_id = None
        for node in nodes_created:
            nt = f"{node.get('node_type', '')}.{node.get('type', '')}"
            if nt == primary_node_type:
                primary_id = node.get('id')
                break

        # Count links by direction type
        link_counts = {}

        for link in links_created:
            from_id = link.get('from', '')
            to_id = link.get('to', '')
            link_type = link.get('type', 'relates')
            direction = link.get('properties', {}).get('direction', link_type)

            # Get target/source types
            target_type = node_types.get(to_id, self._get_node_type(to_id))
            source_type = node_types.get(from_id, self._get_node_type(from_id))

            # Track counts for primary node
            if direction not in link_counts:
                link_counts[direction] = {'outgoing': [], 'incoming': []}

            # Determine direction relative to primary node
            is_outgoing = (from_id == primary_id)
            is_incoming = (to_id == primary_id)

            if is_outgoing:
                link_counts[direction]['outgoing'].append(target_type)
            if is_incoming:
                link_counts[direction]['incoming'].append(source_type)

            # Validate target type if rule exists and it's an outgoing link
            if is_outgoing and direction in rules:
                rule = rules[direction]
                if 'target' in rule:
                    valid_targets = rule['target']
                    if target_type and target_type not in valid_targets:
                        result.errors.append(
                            f"Invalid target for {direction}: {target_type} "
                            f"(expected: {valid_targets})"
                        )
                        result.valid = False

            # Validate source type if rule exists and it's an incoming link
            if is_incoming and direction in rules:
                rule = rules[direction]
                if 'source' in rule:
                    valid_sources = rule['source']
                    if source_type and source_type not in valid_sources:
                        result.errors.append(
                            f"Invalid source for {direction}: {source_type} "
                            f"(expected: {valid_sources})"
                        )
                        result.valid = False

        # Check cardinality constraints for primary node
        for direction, rule in rules.items():
            counts = link_counts.get(direction, {'outgoing': [], 'incoming': []})
            
            # Use 'target' rule for outgoing, 'source' rule for incoming
            if 'target' in rule:
                count = len(counts['outgoing'])
            elif 'source' in rule:
                count = len(counts['incoming'])
            else:
                count = len(counts['outgoing']) + len(counts['incoming'])

            if 'exactly' in rule:
                if count != rule['exactly']:
                    result.errors.append(
                        f"Expected exactly {rule['exactly']} {direction} links, found {count}"
                    )
                    result.valid = False
            elif 'min' in rule and count < rule['min']:
                result.errors.append(
                    f"Expected at least {rule['min']} {direction} links, found {count}"
                )
                result.valid = False
            elif 'max' in rule and rule['max'] is not None and count > rule['max']:
                result.errors.append(
                    f"Expected at most {rule['max']} {direction} links, found {count}"
                )
                result.valid = False

        # Check required fields
        if primary_node_type in REQUIRED_FIELDS:
            for node in nodes_created:
                nt = f"{node.get('node_type', '')}.{node.get('type', '')}"
                if nt == primary_node_type:
                    for field in REQUIRED_FIELDS[primary_node_type]:
                        if not node.get(field):
                            result.warnings.append(f"Missing recommended field: {field}")

        return result

    def _get_node_type(self, node_id: str) -> str:
        """Get node type from graph or infer from ID."""
        if self.graph:
            try:
                result = self.graph._query(
                    "MATCH (n {id: $id}) RETURN n.node_type as nt, n.type as t",
                    {'id': node_id}
                )
                if result:
                    return f"{result[0]['nt']}.{result[0]['t']}"
            except:
                pass

        # Infer from ID pattern
        id_lower = node_id.lower()
        if id_lower.startswith('narrative_'):
            parts = id_lower.split('_')
            if len(parts) >= 2:
                subtype = parts[1]
                if subtype == 'behavior':
                    return 'narrative.behavior'
                if subtype == 'behaviors':
                    return 'narrative.behaviors'
                if subtype == 'doc':
                    return 'narrative.documentation'
                return f"narrative.{subtype}"
        elif id_lower.startswith('thing_'):
            parts = id_lower.split('_')
            if len(parts) >= 2:
                return f"thing.{parts[1]}"
        elif id_lower.startswith('space_'):
            return 'space.module'
        elif id_lower.startswith('moment_'):
            return 'moment.event'

        return ''


    # -------------------------------------------------------------------------
    # 3. SUGGESTION ENGINE
    # -------------------------------------------------------------------------

    def suggest_links(
        self,
        node_id: str,
        node_type: str,
        space_id: str = None,
        exclude_ids: Set[str] = None,
        limit: int = 10
    ) -> List[LinkSuggestion]:
        """
        Suggest existing nodes to link to.

        Args:
            node_id: ID of the node being created
            node_type: Type like 'narrative.health'
            space_id: Space to search in (optional)
            exclude_ids: Node IDs already linked
            limit: Max suggestions to return

        Returns:
            List of LinkSuggestion ordered by priority
        """
        suggestions = []
        exclude = exclude_ids or set()
        exclude.add(node_id)

        if not self.graph:
            return suggestions

        # Get valid target types for this node type
        if node_type in VALID_TARGETS:
            for direction, rule in VALID_TARGETS[node_type].items():
                target_types = rule.get('target', [])
                for target_type in target_types:
                    # Query for existing nodes of this type
                    found = self._find_nodes_of_type(target_type, space_id, exclude, limit=5)
                    for node in found:
                        suggestions.append(LinkSuggestion(
                            target_id=node['id'],
                            target_name=node.get('name', node['id']),
                            target_type=target_type,
                            link_type='relates',
                            direction=direction,
                            reason=f"Required: {node_type} -{direction}-> {target_type}",
                            priority=10 if rule.get('min', 0) > 0 else 5
                        ))

        # Find peers (same type in same space)
        peers = self._find_nodes_of_type(node_type, space_id, exclude, limit=3)
        for peer in peers:
            suggestions.append(LinkSuggestion(
                target_id=peer['id'],
                target_name=peer.get('name', peer['id']),
                target_type=node_type,
                link_type='relates',
                direction='peer',
                reason=f"Peer: Other {node_type} in same space",
                priority=2
            ))

        # Find symbols in space (for health indicators)
        if node_type == 'narrative.health':
            symbols = self._find_nodes_of_type('thing.func', space_id, exclude, limit=5)
            symbols.extend(self._find_nodes_of_type('thing.method', space_id, exclude, limit=5))
            for sym in symbols:
                suggestions.append(LinkSuggestion(
                    target_id=sym['id'],
                    target_name=sym.get('name', sym['id']),
                    target_type='thing.func',
                    link_type='observes',
                    direction='dock_observes',
                    reason="Code symbol to observe via dock",
                    priority=8
                ))

        # Sort by priority and dedupe
        seen = set()
        unique = []
        for s in sorted(suggestions, key=lambda x: -x.priority):
            if s.target_id not in seen:
                seen.add(s.target_id)
                unique.append(s)

        return unique[:limit]

    def _find_nodes_of_type(
        self,
        node_type: str,
        space_id: str = None,
        exclude: Set[str] = None,
        limit: int = 10
    ) -> List[Dict]:
        """Find existing nodes of a given type."""
        if not self.graph:
            return []

        exclude = exclude or set()
        parts = node_type.split('.')
        if len(parts) != 2:
            return []

        nt, t = parts

        if space_id:
            query = """
            MATCH (s {id: $space_id})-[:CONTAINS]->(n)
            WHERE n.node_type = $nt AND n.type = $t
            RETURN n.id as id, n.name as name
            LIMIT $limit
            """
            params = {'space_id': space_id, 'nt': nt, 't': t, 'limit': limit}
        else:
            query = """
            MATCH (n)
            WHERE n.node_type = $nt AND n.type = $t
            RETURN n.id as id, n.name as name
            LIMIT $limit
            """
            params = {'nt': nt, 't': t, 'limit': limit}

        try:
            results = self.graph._query(query, params)
            return [{'id': r['id'], 'name': r['name']}
                    for r in results if r['id'] not in exclude]
        except:
            return []

    def format_suggestions(self, suggestions: List[LinkSuggestion]) -> str:
        """Format suggestions for display."""
        if not suggestions:
            return "No additional link suggestions."

        lines = [
            f"LINK SUGGESTIONS ({len(suggestions)} found)",
            "=" * 40,
        ]

        # Group by priority
        required = [s for s in suggestions if s.priority >= 10]
        recommended = [s for s in suggestions if 5 <= s.priority < 10]
        optional = [s for s in suggestions if s.priority < 5]

        if required:
            lines.append("\nRequired links:")
            for s in required:
                lines.append(f"  [{s.direction}] -> {s.target_name} ({s.target_type})")
                lines.append(f"       {s.reason}")

        if recommended:
            lines.append("\nRecommended:")
            for s in recommended:
                lines.append(f"  [{s.direction}] -> {s.target_name} ({s.target_type})")

        if optional:
            lines.append("\nOptional:")
            for s in optional[:5]:
                lines.append(f"  [{s.direction}] -> {s.target_name}")

        lines.append("=" * 40)
        return "\n".join(lines)


# =============================================================================
# CLUSTER VALIDATOR (combines all checks)
# =============================================================================

class ClusterValidator:
    """
    Comprehensive cluster validation combining metrics, targets, and suggestions.
    """

    def __init__(self, graph_ops=None):
        self.metrics = ClusterMetrics(graph_ops)
        self.graph = graph_ops

    def validate_cluster(
        self,
        primary_node_type: str,
        nodes_created: List[Dict],
        links_created: List[Dict],
        space_id: str = None
    ) -> Dict[str, Any]:
        """
        Run all validations on a cluster.

        Returns:
            Dict with 'valid', 'score', 'target_validation', 'suggestions', 'report'
        """
        # Extract node IDs
        node_ids = [n.get('id', '') for n in nodes_created]

        # Calculate connection score
        score = self.metrics.score_cluster(node_ids, links_created)

        # Validate link targets
        target_validation = self.metrics.validate_targets(
            primary_node_type, links_created, nodes_created
        )

        # Get suggestions for additional links
        primary_id = node_ids[0] if node_ids else ''
        already_linked = set()
        for link in links_created:
            already_linked.add(link.get('to', ''))
            already_linked.add(link.get('from', ''))

        suggestions = self.metrics.suggest_links(
            primary_id, primary_node_type, space_id, already_linked
        )

        # Determine overall validity
        valid = (
            target_validation.valid and
            score.orphan_count == 0 and
            score.links_per_node >= ConnectionScore.LINKS_MIN
        )

        # Build report
        report = self._build_report(
            primary_node_type, nodes_created, links_created,
            score, target_validation, suggestions, valid
        )

        return {
            'valid': valid,
            'score': score,
            'target_validation': target_validation,
            'suggestions': suggestions,
            'report': report,
        }

    def _build_report(
        self,
        primary_node_type: str,
        nodes_created: List[Dict],
        links_created: List[Dict],
        score: ConnectionScore,
        target_validation: TargetValidation,
        suggestions: List[LinkSuggestion],
        valid: bool
    ) -> str:
        """Build comprehensive validation report."""
        lines = [
            "",
            "╔══════════════════════════════════════════════════════════════╗",
            "║                  CLUSTER VALIDATION REPORT                   ║",
            "╚══════════════════════════════════════════════════════════════╝",
            "",
            f"Primary Node Type: {primary_node_type}",
            f"Nodes Created: {len(nodes_created)}",
            f"Links Created: {len(links_created)}",
            "",
        ]

        # Nodes list
        lines.append("NODES:")
        for node in nodes_created[:10]:
            lines.append(f"  - {node.get('id', 'unknown')}")
        if len(nodes_created) > 10:
            lines.append(f"  ... and {len(nodes_created) - 10} more")

        # Links summary
        lines.append("\nLINKS:")
        link_types = {}
        for link in links_created:
            lt = link.get('properties', {}).get('direction', link.get('type', 'relates'))
            link_types[lt] = link_types.get(lt, 0) + 1
        for lt, count in sorted(link_types.items()):
            lines.append(f"  - {lt}: {count}")

        # Connection score
        lines.append("\n" + self.metrics.format_score(score))

        # Target validation
        lines.append("\nTARGET VALIDATION:")
        if target_validation.valid:
            lines.append("  ✓ All link targets valid")
        else:
            for err in target_validation.errors:
                lines.append(f"  ✗ {err}")
        for warn in target_validation.warnings:
            lines.append(f"  ⚠ {warn}")

        # Suggestions
        if suggestions:
            required = [s for s in suggestions if s.priority >= 10]
            if required:
                lines.append(f"\nMISSING REQUIRED LINKS ({len(required)}):")
                for s in required:
                    lines.append(f"  - [{s.direction}] -> {s.target_type}")

        # Overall verdict
        lines.append("\n" + "=" * 60)
        if valid:
            lines.append("RESULT: ✓ CLUSTER VALID - Ready to commit")
        else:
            lines.append("RESULT: ✗ CLUSTER INVALID - Fix errors before commit")
        lines.append("=" * 60)

        return "\n".join(lines)


# =============================================================================
# CLI HELPER
# =============================================================================

def score_cluster_command(
    node_ids: List[str],
    link_defs: List[Dict],
    graph_name: str = None
) -> ConnectionScore:
    """Score a cluster from CLI."""
    graph_ops = None
    if graph_name:
        try:
            from runtime.physics.graph.graph_ops import GraphOps
            graph_ops = GraphOps(graph_name=graph_name)
        except:
            pass

    metrics = ClusterMetrics(graph_ops)
    return metrics.score_cluster(node_ids, link_defs)


def cluster_validate_command(
    root_node_id: str,
    primary_type: str = None,
    graph_name: str = None
) -> Dict[str, Any]:
    """Validate a cluster from CLI."""
    try:
        from runtime.physics.graph.graph_ops import GraphOps
        graph_ops = GraphOps(graph_name=graph_name)
    except:
        graph_ops = None

    validator = ClusterValidator(graph_ops)

    # 1. Fetch cluster nodes and links
    if not graph_ops:
        return {'valid': False, 'report': "Error: Graph connection required for manual validation."}

    # Identify primary type if not provided
    if not primary_type:
        primary_type = validator.metrics._get_node_type(root_node_id)

    # Fetch nodes in cluster (connected via contains or about/relates within same space)
    # For now, we'll use a simple heuristic: root node + its immediate neighbors
    # that are not in other modules.
    query = """
    MATCH (root {id: $root_id})
    OPTIONAL MATCH (root)-[r]-(neighbor)
    WHERE NOT neighbor:Moment OR r:ABOUT OR r:EXPRESSES
    RETURN root, collect(neighbor) as neighbors, collect(r) as links
    """
    results = graph_ops._query(query, {'root_id': root_node_id})

    if not results:
        return {'valid': False, 'report': f"Error: Node {root_node_id} not found."}

    root_node = results[0]['root']
    neighbors = results[0]['neighbors']
    links_data = results[0]['links']

    # Convert to format expected by ClusterValidator
    nodes_created = [root_node] + neighbors
    links_created = []
    for link in links_data:
        # We need to determine from/to and type
        # This is a bit tricky with undirected MATCH, but we can use the graph properties
        # For simplicity, we'll mock the minimal link dict needed by validator
        links_created.append({
            'from': link.get('source', ''), # Assuming these exist in link object from GraphOps
            'to': link.get('target', ''),
            'type': link.get('type', 'relates'),
            'properties': link.get('properties', {})
        })

    return validator.validate_cluster(
        primary_type,
        nodes_created,
        links_created
    )


if __name__ == "__main__":
    # Demo
    print("Cluster Metrics Demo")
    print("=" * 40)

    # Sample cluster
    nodes = ['health_test', 'dock_input', 'dock_output', 'moment_create']
    links = [
        {'from': 'space_module', 'to': 'health_test', 'type': 'contains'},
        {'from': 'health_test', 'to': 'validation_v1', 'type': 'relates', 'properties': {'direction': 'verifies'}},
        {'from': 'dock_input', 'to': 'health_test', 'type': 'attached_to'},
        {'from': 'dock_output', 'to': 'health_test', 'type': 'attached_to'},
        {'from': 'dock_input', 'to': 'func_run', 'type': 'observes'},
        {'from': 'dock_output', 'to': 'func_verify', 'type': 'observes'},
        {'from': 'moment_create', 'to': 'health_test', 'type': 'about'},
        {'from': 'actor_agent', 'to': 'moment_create', 'type': 'expresses'},
    ]

    metrics = ClusterMetrics()
    score = metrics.score_cluster(nodes, links)
    print(metrics.format_score(score))
