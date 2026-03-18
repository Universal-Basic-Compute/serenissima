"""
L3 Macro-Crystallization (Law 10)

Detects dense clusters in the universe graph and collapses them into
hub Narrative nodes. This is Law 10 at L3 scale:

- Trigger: cluster >= 50 nodes, density >= 0.15, avg weight >= 3.0
- Hub type: majority rule (moments -> narrative)
- Hub embedding: centroid of constituent embeddings
- Hub name: from medoid (closest node to centroid)
- Bidirectional links: hub contains constituents, constituents abstract to hub
- External links: hub inherits cluster's external connections

Post-crystallization cleanup is handled by Law 7 (forgetting), not by this module.
Internal links between constituents decay naturally when mediated by the hub.

DOCS: docs/universe/ALGORITHM_Universe_Graph.md (ALG-3)
"""

import math
from collections import Counter
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

from runtime.universe.constants_l3_physics import (
    L3_CRYSTALLIZATION_MIN_SIZE,
    L3_CRYSTALLIZATION_DENSITY,
    L3_CRYSTALLIZATION_WEIGHT,
    L3_CRYSTALLIZATION_DAMPING_FACTOR,
)


@dataclass
class ClusterNode:
    """Node data for crystallization analysis."""
    id: str
    node_type: str
    name: str = ""
    synthesis: str = ""
    embedding: Optional[List[float]] = None
    weight: float = 1.0
    energy: float = 0.0
    stability: float = 0.5


@dataclass
class ClusterLink:
    """Link data for crystallization analysis."""
    node_a: str
    node_b: str
    weight: float = 1.0
    trust: float = 0.0
    affinity: float = 0.0


@dataclass
class CrystallizationCandidate:
    """A cluster meeting crystallization thresholds."""
    node_ids: List[str]
    density: float
    avg_co_activation: float
    internal_link_count: int
    external_links: List[ClusterLink]  # Links crossing cluster boundary
    nodes: List[ClusterNode] = field(default_factory=list)
    internal_links: List[ClusterLink] = field(default_factory=list)


@dataclass
class CrystallizationHub:
    """Result of crystallization: the new hub node and its links."""
    hub_id: str
    hub_type: str
    hub_name: str
    hub_synthesis: str
    hub_embedding: Optional[List[float]]
    hub_weight: float
    hub_energy: float
    hub_stability: float
    # Links to create
    contains_links: List[Tuple[str, str, float]]  # (hub_id, constituent_id, weight)
    abstracts_links: List[Tuple[str, str, float]]  # (constituent_id, hub_id, weight)
    external_links: List[Tuple[str, str, float, float, float]]  # (hub_id, ext_id, weight, trust, affinity)
    total_constituent_weight: float


def detect_crystallization_candidates(
    nodes: List[ClusterNode],
    links: List[ClusterLink],
    min_size: int = L3_CRYSTALLIZATION_MIN_SIZE,
    min_density: float = L3_CRYSTALLIZATION_DENSITY,
    min_weight: float = L3_CRYSTALLIZATION_WEIGHT,
) -> List[CrystallizationCandidate]:
    """ALG-3: Find dense clusters exceeding L3 thresholds.

    Uses a greedy approach:
    1. Build adjacency from links
    2. Find connected components
    3. For each component, check density and weight thresholds

    Args:
        nodes: All nodes in the graph segment to analyze.
        links: All links in the graph segment.
        min_size: Minimum cluster size (default 50).
        min_density: Minimum edge density (default 0.15).
        min_weight: Minimum average link weight (default 3.0).

    Returns:
        List of CrystallizationCandidate objects meeting all thresholds.
    """
    node_map = {n.id: n for n in nodes}
    node_ids = set(node_map.keys())

    # Build adjacency
    adjacency: Dict[str, set] = {nid: set() for nid in node_ids}
    link_index: Dict[Tuple[str, str], ClusterLink] = {}

    for link in links:
        if link.node_a in node_ids and link.node_b in node_ids:
            adjacency[link.node_a].add(link.node_b)
            adjacency[link.node_b].add(link.node_a)
            link_index[(link.node_a, link.node_b)] = link

    # Find connected components via BFS
    visited = set()
    components: List[set] = []

    for start_id in node_ids:
        if start_id in visited:
            continue
        component = set()
        queue = [start_id]
        while queue:
            current = queue.pop(0)
            if current in visited:
                continue
            visited.add(current)
            component.add(current)
            for neighbor in adjacency.get(current, set()):
                if neighbor not in visited:
                    queue.append(neighbor)
        if component:
            components.append(component)

    def _extract_dense_core(component: set[str], min_degree: int = 2) -> set[str]:
        """Prune fringe nodes from a connected component.

        Connected components often include low-degree attachment nodes (e.g. a
        single external neighbor) that should not be crystallized into the hub.
        We iteratively remove nodes whose internal degree is below min_degree
        and keep the resulting dense core.
        """
        core = set(component)
        changed = True
        while changed and core:
            changed = False
            to_remove = []
            for node_id in core:
                degree = sum(1 for n in adjacency.get(node_id, set()) if n in core)
                if degree < min_degree:
                    to_remove.append(node_id)
            if to_remove:
                core.difference_update(to_remove)
                changed = True
        return core

    # Evaluate each component
    candidates = []

    for component in components:
        core = _extract_dense_core(component)

        if len(core) < min_size:
            continue

        # Count internal links and compute avg weight
        internal_links = []
        internal_weight_sum = 0.0

        for (a, b), link in link_index.items():
            if a in core and b in core:
                internal_links.append(link)
                internal_weight_sum += link.weight

        internal_count = len(internal_links)
        if internal_count == 0:
            continue

        # Density = internal_links / max_possible_links
        n = len(core)
        max_possible = n * (n - 1) / 2
        density = internal_count / max_possible if max_possible > 0 else 0.0

        avg_weight = internal_weight_sum / internal_count

        if density < min_density or avg_weight < min_weight:
            continue

        # Find external links
        external_links = []
        for (a, b), link in link_index.items():
            a_in = a in core
            b_in = b in core
            if a_in != b_in:  # One inside, one outside
                external_links.append(link)
        # Also check links not in link_index (links to nodes outside our set)
        for link in links:
            a_in = link.node_a in core
            b_in = link.node_b in core
            if a_in != b_in:
                if (link.node_a, link.node_b) not in link_index:
                    external_links.append(link)

        candidate = CrystallizationCandidate(
            node_ids=list(core),
            density=density,
            avg_co_activation=avg_weight,
            internal_link_count=internal_count,
            external_links=external_links,
            nodes=[node_map[nid] for nid in core],
            internal_links=internal_links,
        )
        candidates.append(candidate)

    return candidates


def _cosine_distance(a: List[float], b: List[float]) -> float:
    """Compute cosine distance between two vectors.

    Returns 1 - cosine_similarity. Range: [0, 2].
    Returns 1.0 (neutral) if either vector is zero-length.
    """
    if len(a) != len(b):
        return 1.0
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(x * x for x in b))
    if norm_a == 0.0 or norm_b == 0.0:
        return 1.0
    return 1.0 - (dot / (norm_a * norm_b))


def _mean_embedding(embeddings: List[List[float]]) -> Optional[List[float]]:
    """Compute element-wise mean of embeddings."""
    if not embeddings:
        return None
    dim = len(embeddings[0])
    result = [0.0] * dim
    for emb in embeddings:
        if len(emb) != dim:
            continue
        for i in range(dim):
            result[i] += emb[i]
    n = len(embeddings)
    return [v / n for v in result]


def crystallize(
    cluster: CrystallizationCandidate,
    hub_id: str,
    damping_factor: float = L3_CRYSTALLIZATION_DAMPING_FACTOR,
) -> CrystallizationHub:
    """ALG-3: Create hub Narrative from dense cluster.

    Steps:
    1. Determine hub type (majority rule; moments -> narrative)
    2. Compute centroid embedding
    3. Find medoid (closest node to centroid)
    4. Create hub node properties
    5. Generate bidirectional links (contains + abstracts)
    6. Generate external connection links

    Args:
        cluster: The validated CrystallizationCandidate.
        hub_id: ID to assign to the new hub node.
        damping_factor: Hub weight = sum(constituent weights) * damping (default 0.7).

    Returns:
        CrystallizationHub with all computed properties and links to create.

    Raises:
        ValueError: If cluster has no nodes.
    """
    if not cluster.nodes:
        raise ValueError("Cannot crystallize an empty cluster")

    # Step 1: Hub type via majority rule
    type_counts = Counter(n.node_type for n in cluster.nodes)
    hub_type = type_counts.most_common(1)[0][0]
    # Moments crystallize into narratives
    if hub_type == "moment":
        hub_type = "narrative"

    # Step 2: Centroid embedding
    embeddings = [n.embedding for n in cluster.nodes if n.embedding is not None]
    centroid = _mean_embedding(embeddings)

    # Step 3: Medoid (closest to centroid)
    medoid = cluster.nodes[0]
    if centroid and embeddings:
        min_dist = float("inf")
        for node in cluster.nodes:
            if node.embedding is not None:
                dist = _cosine_distance(node.embedding, centroid)
                if dist < min_dist:
                    min_dist = dist
                    medoid = node

    # Step 4: Hub properties
    total_weight = sum(n.weight for n in cluster.nodes)
    hub_weight = total_weight * damping_factor
    hub_energy = sum(n.energy for n in cluster.nodes) / len(cluster.nodes)

    # Step 5: Bidirectional links
    contains_links = []
    abstracts_links = []
    for node in cluster.nodes:
        # Hub contains constituent (hierarchy -1)
        contains_links.append((hub_id, node.id, node.weight * 0.5))
        # Constituent abstracts to hub (hierarchy +1)
        abstracts_links.append((node.id, hub_id, node.weight * 0.3))

    # Step 6: External links
    external_hub_links = []
    for ext_link in cluster.external_links:
        # Determine which endpoint is external
        cluster_ids = set(cluster.node_ids)
        if ext_link.node_a in cluster_ids:
            ext_node = ext_link.node_b
        else:
            ext_node = ext_link.node_a

        external_hub_links.append((
            hub_id,
            ext_node,
            ext_link.weight * 0.5,
            ext_link.trust,
            ext_link.affinity,
        ))

    return CrystallizationHub(
        hub_id=hub_id,
        hub_type=hub_type,
        hub_name=medoid.name,
        hub_synthesis=medoid.synthesis,
        hub_embedding=centroid,
        hub_weight=hub_weight,
        hub_energy=hub_energy,
        hub_stability=0.8,  # Hub starts stable
        contains_links=contains_links,
        abstracts_links=abstracts_links,
        external_links=external_hub_links,
        total_constituent_weight=total_weight,
    )


def validate_crystallization_preserves_weight(
    hub: CrystallizationHub,
    damping_factor: float = L3_CRYSTALLIZATION_DAMPING_FACTOR,
    tolerance: float = 1e-9,
) -> bool:
    """Verify that crystallization preserves total weight (with damping).

    INV-12 check: hub weight = total_constituent_weight * damping_factor.

    Args:
        hub: The crystallization result to validate.
        damping_factor: Expected damping factor.
        tolerance: Floating-point comparison tolerance.

    Returns:
        True if weight is correctly preserved.
    """
    expected = hub.total_constituent_weight * damping_factor
    return abs(hub.hub_weight - expected) < tolerance
