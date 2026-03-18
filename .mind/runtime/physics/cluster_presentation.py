"""
Cluster Presentation System (v1.9.2)

Transforms raw exploration clusters into readable, actionable presentations.
Filters 200+ nodes down to 20-30 with structure-aware formatting.

v1.9.1: Added content blocks — each node in path displays its content in ``` block.
v1.9.2: Unified render_cluster for response and crystallizing scenarios.

Patterns: docs/physics/cluster-presentation/PATTERNS_Cluster_Presentation.md
Algorithm: docs/physics/cluster-presentation/ALGORITHM_Cluster_Presentation.md

DESIGN DECISIONS:
- D1: Presentation format is Markdown (agent-readable)
- D2: Filtering is intention-driven (same cluster, different views)
- D3: Synthesis unfolds from compact floats to prose
- D4: Stats always included (agent knows what's hidden)
- D5: Content blocks show node content inline (v1.9.1)
- D6: render_cluster works for both response and crystallizing (v1.9.2)
"""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Set, Tuple, Any, Literal
from enum import Enum
from collections import defaultdict

from .link_scoring import cosine_similarity


# =============================================================================
# INTENTION TYPE (for presentation filtering)
# =============================================================================
# This enum is used only for presentation logic - which sections to show.
# It is NOT used for link scoring (that uses fixed INTENTION_WEIGHT in subentity.py).

class IntentionType(str, Enum):
    """
    Intention types for presentation filtering.

    Different intentions show different sections in the cluster presentation.
    """
    SUMMARIZE = "summarize"    # Show: response, path, temporal, tensions
    VERIFY = "verify"          # Show: response, path, tensions, gaps
    FIND_NEXT = "find_next"    # Show: response, path, temporal, gaps
    EXPLORE = "explore"        # Show: all sections
    RETRIEVE = "retrieve"      # Show: response, path, gaps


from .synthesis_unfold import (
    parse_node_synthesis,
    parse_link_synthesis,
    unfold_node,
    unfold_link,
    to_adverb,
    to_participle,
)


# =============================================================================
# DATA STRUCTURES
# =============================================================================

@dataclass
class ClusterNode:
    """A node in the cluster."""
    id: str
    node_type: str
    name: str
    synthesis: str
    embedding: List[float] = field(default_factory=list)
    weight: float = 1.0
    energy: float = 0.0
    status: Optional[str] = None
    type: Optional[str] = None  # narrative type (implementation, etc.)
    content: Optional[str] = None  # v1.9.1: Node content for display in path


@dataclass
class ClusterLink:
    """A link in the cluster."""
    id: str
    source_id: str
    target_id: str
    synthesis: str
    embedding: List[float] = field(default_factory=list)
    weight: float = 1.0
    energy: float = 0.0
    permanence: float = 0.0


@dataclass
class RawCluster:
    """Raw cluster from exploration (before filtering)."""
    nodes: List[ClusterNode]
    links: List[ClusterLink]
    traversed_link_ids: Set[str] = field(default_factory=set)


@dataclass
class ClusterStats:
    """Statistics about the cluster."""
    traversed_nodes: int
    traversed_links: int
    presented_nodes: int
    presented_links: int
    responses: int = 0
    convergences: int = 0
    tensions: int = 0
    divergences: int = 0
    gaps: int = 0


@dataclass
class Gap:
    """A gap in the cluster."""
    type: str  # 'dead_end', 'missing', 'weak'
    node: Optional[ClusterNode] = None
    source: Optional[ClusterNode] = None
    target: Optional[ClusterNode] = None
    subject: Optional[str] = None


@dataclass
class PresentedCluster:
    """Filtered and formatted cluster for presentation."""
    markdown: str
    nodes: List[ClusterNode]
    links: List[ClusterLink]
    stats: ClusterStats
    responses: List[ClusterNode] = field(default_factory=list)
    tensions: List[ClusterNode] = field(default_factory=list)
    convergences: List[ClusterNode] = field(default_factory=list)
    gaps: List[Gap] = field(default_factory=list)
    available_details: List[str] = field(default_factory=list)


# =============================================================================
# MARKERS
# =============================================================================

class Marker(str, Enum):
    """Presentation markers."""
    RESPONSE = "◆ RESPONSE"
    BRANCHING = "◆ BRANCHING"
    TENSION = "⚡"
    CONVERGENCE = "→"
    GAP = "○"
    CHOSEN = "✓"


# =============================================================================
# POINT OF INTEREST DETECTION
# =============================================================================

def find_direct_response(
    nodes: List[ClusterNode],
    intention_type: IntentionType,
    query_embedding: List[float],
) -> List[ClusterNode]:
    """
    Find nodes that directly answer the intention.

    Returns 1-5 nodes based on intention type.
    """
    if intention_type == IntentionType.FIND_NEXT:
        # Moments with status=possible
        matches = [n for n in nodes if n.node_type == 'moment' and n.status == 'possible']
        return matches[:5]

    if intention_type == IntentionType.RETRIEVE:
        # Implementation narratives
        matches = [n for n in nodes if n.node_type == 'narrative' and n.type == 'implementation']
        return matches[:5]

    if intention_type == IntentionType.VERIFY:
        # Return nodes with tensions (handled separately)
        return []

    # Default: highest alignment to query
    if not query_embedding:
        return nodes[:5]

    scored = [
        (n, cosine_similarity(n.embedding, query_embedding) if n.embedding else 0.0)
        for n in nodes
    ]
    scored.sort(key=lambda x: -x[1])
    return [n for n, _ in scored[:5]]


def find_convergences(
    nodes: List[ClusterNode],
    links: List[ClusterLink],
) -> List[ClusterNode]:
    """
    Find nodes with 3+ incoming links in the cluster.
    """
    incoming_count: Dict[str, int] = defaultdict(int)
    for link in links:
        incoming_count[link.target_id] += 1

    node_map = {n.id: n for n in nodes}
    return [node_map[nid] for nid, count in incoming_count.items()
            if count >= 3 and nid in node_map]


def find_tensions(
    nodes: List[ClusterNode],
    links: List[ClusterLink],
) -> List[ClusterNode]:
    """
    Find nodes with contradictory incoming links (weight opposition).
    """
    tensions = []

    for node in nodes:
        incoming = [l for l in links if l.target_id == node.id]
        if len(incoming) < 2:
            continue

        # Detect tension via weight variance (high variance = tension)
        weights = [l.weight for l in incoming]
        if weights and len(weights) >= 2:
            avg = sum(weights) / len(weights)
            variance = sum((w - avg) ** 2 for w in weights) / len(weights)
            if variance > 0.2:
                tensions.append(node)

    return tensions


def find_divergences(
    nodes: List[ClusterNode],
    links: List[ClusterLink],
    traversed_link_ids: Set[str],
) -> List[ClusterNode]:
    """
    Find nodes with 3+ outgoing links that were traversed.
    """
    outgoing_count: Dict[str, int] = defaultdict(int)
    for link in links:
        if link.id in traversed_link_ids:
            outgoing_count[link.source_id] += 1

    node_map = {n.id: n for n in nodes}
    return [node_map[nid] for nid, count in outgoing_count.items()
            if count >= 3 and nid in node_map]


def find_gaps(
    nodes: List[ClusterNode],
    links: List[ClusterLink],
    intention_type: IntentionType,
) -> List[Gap]:
    """
    Find gaps relevant to the intention.
    """
    gaps = []
    node_map = {n.id: n for n in nodes}

    # Dead ends (no outgoing links)
    sources = {l.source_id for l in links}
    dead_ends = [n for n in nodes if n.id not in sources]

    # Weak links
    weak_links = [l for l in links if l.permanence < 0.3]

    # Filter by intention
    if intention_type == IntentionType.VERIFY:
        # All gaps relevant for verification
        for node in dead_ends:
            gaps.append(Gap(type='dead_end', node=node))
        for link in weak_links[:5]:
            gaps.append(Gap(
                type='weak',
                source=node_map.get(link.source_id),
                target=node_map.get(link.target_id),
            ))

    elif intention_type == IntentionType.FIND_NEXT:
        # Only gaps that block finding the next moment
        for node in dead_ends:
            if node.status == 'possible':
                gaps.append(Gap(type='dead_end', node=node))

    elif intention_type == IntentionType.RETRIEVE:
        # Gaps in documentation
        for node in dead_ends:
            if node.node_type == 'narrative':
                gaps.append(Gap(type='dead_end', node=node))

    return gaps


# =============================================================================
# PATH BUILDING
# =============================================================================

def build_main_path(
    start_id: str,
    response_nodes: List[ClusterNode],
    links: List[ClusterLink],
    intention_embedding: List[float],
) -> List[List[str]]:
    """
    Build paths from start to each response node.

    Returns list of paths, where each path is [node_id, link_id, node_id, ...]
    """
    if not response_nodes:
        return []

    # Build link maps
    incoming_by_target: Dict[str, List[ClusterLink]] = defaultdict(list)
    for link in links:
        incoming_by_target[link.target_id].append(link)

    paths = []

    for response in response_nodes:
        path = []
        current = response.id
        visited = set()

        while current != start_id and current not in visited:
            visited.add(current)
            incoming = incoming_by_target.get(current, [])

            if not incoming:
                break

            # Best link by weight × energy × alignment
            def link_score(l: ClusterLink) -> float:
                base = l.weight * (l.energy + 0.1)
                if intention_embedding and l.embedding:
                    base *= (1 + cosine_similarity(l.embedding, intention_embedding))
                return base

            best = max(incoming, key=link_score)

            path.insert(0, current)
            path.insert(0, best.id)
            current = best.source_id

        path.insert(0, start_id)
        paths.append(path)

    return paths


def get_path_node_ids(paths: List[List[str]], links: List[ClusterLink]) -> Set[str]:
    """Extract all node IDs from paths."""
    link_map = {l.id: l for l in links}
    node_ids = set()

    for path in paths:
        for item in path:
            if item in link_map:
                link = link_map[item]
                node_ids.add(link.source_id)
                node_ids.add(link.target_id)
            else:
                node_ids.add(item)

    return node_ids


# =============================================================================
# SCORING AND FILTERING
# =============================================================================

def score_node(
    node: ClusterNode,
    response_ids: Set[str],
    main_path_ids: Set[str],
    convergence_ids: Set[str],
    tension_ids: Set[str],
    divergence_ids: Set[str],
    intention_embedding: List[float],
) -> float:
    """
    Score a node for presentation priority.

    Higher score = more important to present.
    """
    score = 0.0

    if node.id in response_ids:
        score += 10.0
    if node.id in main_path_ids:
        score += 5.0
    if node.id in convergence_ids:
        score += 3.0
    if node.id in tension_ids:
        score += 3.0
    if node.id in divergence_ids:
        score += 2.0

    score += node.weight * 0.5
    score += node.energy * 0.3

    if intention_embedding and node.embedding:
        score += cosine_similarity(node.embedding, intention_embedding) * 2.0

    return score


def select_nodes(
    nodes: List[ClusterNode],
    links: List[ClusterLink],
    responses: List[ClusterNode],
    convergences: List[ClusterNode],
    tensions: List[ClusterNode],
    divergences: List[ClusterNode],
    main_path_ids: Set[str],
    intention_embedding: List[float],
    max_nodes: int = 30,
) -> List[ClusterNode]:
    """
    Select top nodes for presentation, ensuring main path is intact.
    """
    response_ids = {n.id for n in responses}
    convergence_ids = {n.id for n in convergences}
    tension_ids = {n.id for n in tensions}
    divergence_ids = {n.id for n in divergences}

    # Score all nodes
    scored = [
        (node, score_node(
            node, response_ids, main_path_ids,
            convergence_ids, tension_ids, divergence_ids,
            intention_embedding
        ))
        for node in nodes
    ]
    scored.sort(key=lambda x: -x[1])

    # Take top nodes
    presented = [n for n, _ in scored[:max_nodes]]
    presented_ids = {n.id for n in presented}

    # Ensure main path intact
    node_map = {n.id: n for n in nodes}
    for node_id in main_path_ids:
        if node_id not in presented_ids and node_id in node_map:
            presented.append(node_map[node_id])

    return presented


def filter_links(
    links: List[ClusterLink],
    presented_node_ids: Set[str],
) -> List[ClusterLink]:
    """Keep only links between presented nodes."""
    return [
        l for l in links
        if l.source_id in presented_node_ids and l.target_id in presented_node_ids
    ]


# =============================================================================
# SYNTHESIS UNFOLDING
# =============================================================================

def unfold_node_synthesis(node: ClusterNode, lang: str = 'en') -> str:
    """
    Convert compact node synthesis to prose.

    Uses the full parsing and unfolding from synthesis_unfold.

    Input: "surprising reliable the Revelation, incandescent (ongoing)"
    Output: "The narrative **Revelation**, surprisingly and reliably, is incandescent and ongoing."
    """
    return unfold_node(node.synthesis, node_type=node.node_type, lang=lang)


def unfold_link_synthesis(link: ClusterLink, target_name: str = "", lang: str = 'en') -> str:
    """
    Convert compact link synthesis to prose.

    Uses the full parsing and unfolding from synthesis_unfold.

    Input: "suddenly definitively establishes, with admiration"
    Output: "It suddenly, definitively, established, with admiration, **target**."
    """
    return unfold_link(link.synthesis, target_name=target_name, lang=lang)


# =============================================================================
# FORMATTING
# =============================================================================

def format_header(query: str, intention: str) -> str:
    """Format the header section."""
    return f"""**Query:** "{query}"

**Intention:** "{intention}"
"""


def format_response(responses: List[ClusterNode]) -> str:
    """Format the response section."""
    if not responses:
        return """### Response

No direct response found.
"""

    if len(responses) == 1:
        return f"""### Response

{responses[0].synthesis}
"""

    items = '\n'.join(f"- {r.synthesis}" for r in responses)
    return f"""### Response

{items}
"""


def format_content_block(content: Optional[str], indent: str = "") -> List[str]:
    """
    Format a content block with proper indentation.

    v1.9.1: Each node shows its content in a ``` block after synthesis.
    Returns empty list if no content.
    """
    if not content or not content.strip():
        return []

    lines = []
    lines.append(f"{indent}```")
    lines.append(f"{indent}{content}")
    lines.append(f"{indent}```")
    return lines


def format_path_tree(
    path: List[str],
    nodes: Dict[str, ClusterNode],
    links: Dict[str, ClusterLink],
    response_ids: Set[str],
    branching_ids: Set[str],
) -> str:
    """
    Format a path as a tree with content blocks.

    v1.9.1: Each node includes its content in a ``` block after synthesis.

    path: [node_id, link_id, node_id, ...]
    """
    lines = []

    for i, item_id in enumerate(path):
        if item_id in nodes:
            node = nodes[item_id]
            marker = ""
            if node.id in response_ids:
                marker = f"  {Marker.RESPONSE.value}"
            elif node.id in branching_ids:
                marker = f"  {Marker.BRANCHING.value}"

            lines.append(f"{node.synthesis}{marker}")

            # v1.9.1: Add content block if present
            content_lines = format_content_block(node.content)
            lines.extend(content_lines)

        elif item_id in links:
            link = links[item_id]
            lines.append("  │")
            lines.append(f"  └─ {link.synthesis}")
            lines.append("     │")
            lines.append("     ▼")

    return '\n'.join(lines)


def format_branching(
    node: ClusterNode,
    outgoing_links: List[ClusterLink],
    targets: Dict[str, ClusterNode],
) -> str:
    """
    Format a branching node with multiple outgoing paths.

    v1.9.1: Each target includes its content block.
    """
    lines = [f"{node.synthesis}  {Marker.BRANCHING.value}"]

    # Add content for branching node
    content_lines = format_content_block(node.content)
    lines.extend(content_lines)

    lines.append("  │")

    for i, link in enumerate(outgoing_links):
        target = targets.get(link.target_id)
        is_last = (i == len(outgoing_links) - 1)

        if is_last:
            lines.append(f"  └─ {link.synthesis}")
            lines.append("     │")
            lines.append("     ▼")
            if target:
                lines.append(f"{target.synthesis}")
                content_lines = format_content_block(target.content)
                lines.extend(content_lines)
        else:
            lines.append(f"  ├─ {link.synthesis}")
            lines.append("  │  │")
            lines.append("  │  ▼")
            if target:
                lines.append(f"  │  {target.synthesis}")
                content_lines = format_content_block(target.content, "  │  ")
                lines.extend(content_lines)
            lines.append("  │")

    return '\n'.join(lines)


def format_paths_section(
    paths: List[List[str]],
    nodes: Dict[str, ClusterNode],
    links: Dict[str, ClusterLink],
    response_ids: Set[str],
    divergence_ids: Set[str],
) -> str:
    """Format the full paths section with content blocks."""
    if not paths:
        return ""

    # Format the main path
    path_tree = format_path_tree(
        paths[0], nodes, links, response_ids, divergence_ids
    )

    return f"""### Path

```
{path_tree}
```
"""


def format_tension(
    node: ClusterNode,
    incoming_links: List[ClusterLink],
    sources: Dict[str, ClusterNode],
) -> str:
    """Format a tension."""
    lines = [
        f"{Marker.TENSION.value} On **{node.name}**:",
        "",
        "| Source | Relation |",
        "|--------|----------|",
    ]

    for link in incoming_links:
        source = sources.get(link.source_id)
        source_name = source.name if source else link.source_id
        lines.append(f"| {source_name} | {link.synthesis} |")

    return '\n'.join(lines)


def format_tensions_section(
    tensions: List[ClusterNode],
    links: List[ClusterLink],
    nodes: Dict[str, ClusterNode],
) -> str:
    """Format all tensions."""
    if not tensions:
        return ""

    sections = ["### Tensions", ""]

    for node in tensions:
        incoming = [l for l in links if l.target_id == node.id]
        sections.append(format_tension(node, incoming, nodes))
        sections.append("")

    return '\n'.join(sections)


def format_convergences_section(
    convergences: List[ClusterNode],
    links: List[ClusterLink],
    nodes: Dict[str, ClusterNode],
) -> str:
    """Format convergence points."""
    if not convergences:
        return ""

    lines = ["### Convergences", ""]

    for node in convergences:
        incoming = [l for l in links if l.target_id == node.id]
        lines.append(f"{Marker.CONVERGENCE.value} {node.synthesis} ({len(incoming)} paths)")
        lines.append("")
        lines.append("Sources:")
        for link in incoming[:5]:  # Limit to 5 sources
            source = nodes.get(link.source_id)
            source_synth = source.synthesis if source else link.source_id
            lines.append(f"- {source_synth} {link.synthesis}")
        lines.append("")

    return '\n'.join(lines)


def format_gaps_section(gaps: List[Gap]) -> str:
    """Format gaps."""
    if not gaps:
        return ""

    lines = ["### Gaps", ""]

    for gap in gaps:
        if gap.type == 'dead_end' and gap.node:
            lines.append(f"{Marker.GAP.value} {gap.node.synthesis} has no outgoing links.")
        elif gap.type == 'missing' and gap.subject:
            lines.append(f"{Marker.GAP.value} No narrative covers {gap.subject}.")
        elif gap.type == 'weak' and gap.source and gap.target:
            lines.append(f"{Marker.GAP.value} Weak link (permanence < 0.3) between {gap.source.name} and {gap.target.name}.")

    return '\n'.join(lines)


def format_stats(stats: ClusterStats) -> str:
    """Format cluster statistics."""
    return f"""### Cluster Stats

- Nodes traversed: {stats.traversed_nodes}
- Nodes presented: {stats.presented_nodes}
- Links traversed: {stats.traversed_links}
- Links presented: {stats.presented_links}

Points of interest:
- Responses: {stats.responses}
- Convergences: {stats.convergences}
- Tensions: {stats.tensions}
- Divergences: {stats.divergences}
- Gaps: {stats.gaps}
"""


def should_include_section(section: str, intention_type: IntentionType) -> bool:
    """Check if section should be included based on intention."""
    SECTION_MATRIX = {
        IntentionType.SUMMARIZE: {'response', 'path', 'temporal', 'tensions'},
        IntentionType.FIND_NEXT: {'response', 'path', 'temporal', 'gaps'},
        IntentionType.VERIFY: {'response', 'path', 'tensions', 'gaps'},
        IntentionType.RETRIEVE: {'response', 'path', 'gaps'},
        IntentionType.EXPLORE: {'response', 'path', 'tensions', 'convergences', 'gaps', 'stats'},
    }
    return section in SECTION_MATRIX.get(intention_type, {'response', 'path', 'stats'})


# =============================================================================
# MAIN PRESENTATION FUNCTION
# =============================================================================

def present_cluster(
    raw_cluster: RawCluster,
    query: str,
    intention: str,
    intention_type: IntentionType,
    query_embedding: List[float],
    intention_embedding: List[float],
    start_id: str,
    max_nodes: int = 30,
) -> PresentedCluster:
    """
    Transform raw cluster into presented cluster.

    This is the main entry point for cluster presentation.

    Args:
        raw_cluster: The raw exploration result
        query: What we searched for
        intention: Why we searched
        intention_type: How to traverse/filter
        query_embedding: Embedding of query
        intention_embedding: Embedding of intention
        start_id: Starting node ID
        max_nodes: Maximum nodes to present

    Returns:
        PresentedCluster with markdown and metadata
    """
    nodes = raw_cluster.nodes
    links = raw_cluster.links

    # Step 1: Identify points of interest
    responses = find_direct_response(nodes, intention_type, query_embedding)
    convergences = find_convergences(nodes, links)
    tensions = find_tensions(nodes, links)
    divergences = find_divergences(nodes, links, raw_cluster.traversed_link_ids)
    gaps = find_gaps(nodes, links, intention_type)

    # Step 2: Build main path
    main_paths = build_main_path(start_id, responses, links, intention_embedding)
    main_path_ids = get_path_node_ids(main_paths, links)

    # Step 3: Select nodes (includes scoring and truncation)
    presented_nodes = select_nodes(
        nodes, links,
        responses, convergences, tensions, divergences,
        main_path_ids, intention_embedding, max_nodes
    )

    # Step 4: Filter links
    presented_node_ids = {n.id for n in presented_nodes}
    presented_links = filter_links(links, presented_node_ids)

    # Build lookup maps
    node_map = {n.id: n for n in presented_nodes}
    link_map = {l.id: l for l in presented_links}

    # Step 5: Format markdown
    sections = []

    # Header (always)
    sections.append(format_header(query, intention))

    # Response (always)
    sections.append(format_response(responses))

    # Path
    if should_include_section('path', intention_type) and main_paths:
        response_ids = {r.id for r in responses}
        divergence_ids = {d.id for d in divergences}
        sections.append(format_paths_section(
            main_paths, node_map, link_map, response_ids, divergence_ids
        ))

    # Tensions
    if should_include_section('tensions', intention_type) and tensions:
        sections.append(format_tensions_section(tensions, presented_links, node_map))

    # Convergences
    if should_include_section('convergences', intention_type) and convergences:
        sections.append(format_convergences_section(convergences, presented_links, node_map))

    # Gaps
    if should_include_section('gaps', intention_type) and gaps:
        sections.append(format_gaps_section(gaps))

    # Stats (always for EXPLORE, optional otherwise)
    stats = ClusterStats(
        traversed_nodes=len(raw_cluster.nodes),
        traversed_links=len(raw_cluster.links),
        presented_nodes=len(presented_nodes),
        presented_links=len(presented_links),
        responses=len(responses),
        convergences=len(convergences),
        tensions=len(tensions),
        divergences=len(divergences),
        gaps=len(gaps),
    )

    if should_include_section('stats', intention_type):
        sections.append(format_stats(stats))

    # Available details (nodes not presented but might be relevant)
    available_details = []
    for node in nodes:
        if node.id not in presented_node_ids and node.weight > 0.5:
            available_details.append(f"Detail: {node.name}")

    markdown = '\n---\n\n'.join(sections)

    return PresentedCluster(
        markdown=markdown,
        nodes=presented_nodes,
        links=presented_links,
        stats=stats,
        responses=responses,
        tensions=tensions,
        convergences=convergences,
        gaps=gaps,
        available_details=available_details[:10],
    )


# =============================================================================
# CONVENIENCE FUNCTIONS
# =============================================================================

def cluster_from_dicts(
    nodes: List[Dict[str, Any]],
    links: List[Dict[str, Any]],
    traversed_link_ids: Optional[Set[str]] = None,
) -> RawCluster:
    """
    Create a RawCluster from dictionary representations.

    Useful for converting graph query results.
    """
    cluster_nodes = [
        ClusterNode(
            id=n.get('id', ''),
            node_type=n.get('node_type', 'unknown'),
            name=n.get('name', n.get('id', '')),
            synthesis=n.get('synthesis', n.get('name', '')),
            embedding=n.get('embedding', []),
            weight=n.get('weight', 1.0),
            energy=n.get('energy', 0.0),
            status=n.get('status'),
            type=n.get('type'),
            content=n.get('content', n.get('prose', n.get('description'))),  # v1.9.1
        )
        for n in nodes
    ]

    cluster_links = [
        ClusterLink(
            id=l.get('id', ''),
            source_id=l.get('source_id', l.get('from', '')),
            target_id=l.get('target_id', l.get('to', '')),
            synthesis=l.get('synthesis', l.get('type', '')),
            embedding=l.get('embedding', []),
            weight=l.get('weight', 1.0),
            energy=l.get('energy', 0.0),
            permanence=l.get('permanence', 0.0),
        )
        for l in links
    ]

    return RawCluster(
        nodes=cluster_nodes,
        links=cluster_links,
        traversed_link_ids=traversed_link_ids or set(),
    )


# =============================================================================
# RENDER CLUSTER (for crystallization and response)
# =============================================================================

RenderMode = Literal['response', 'crystallize', 'compact']


async def render_cluster(
    path: List[Tuple[str, str]],
    focus_node: Dict[str, Any],
    graph: Any,  # GraphInterface
    intention: str = "",
    intention_embedding: Optional[List[float]] = None,
    mode: RenderMode = 'response',
    lang: str = 'en',
) -> str:
    """
    Render a cluster from exploration path to content string.

    v1.9.2: Unified rendering for both response and crystallizing scenarios.

    Used for:
    - Response (mode='response'): Full tree format with markers and content blocks
    - Crystallization (mode='crystallize'): Prose narrative from traversal path
    - Compact (mode='compact'): Simple path description

    Args:
        path: List of (link_id, node_id) tuples from traversal
        focus_node: The focus node dict at end of path
        graph: GraphInterface for fetching node/link data
        intention: Why searching (for context)
        intention_embedding: Embedding for scoring
        mode: Rendering mode - 'response', 'crystallize', or 'compact'
        lang: Language for synthesis unfolding ('en' or 'fr')

    Returns:
        Content string suitable for narrative or response
    """
    if not path:
        name = focus_node.get('name', 'Unknown')
        return f"{intention}: {name}" if intention else name

    # Build nodes and links from path
    nodes: List[ClusterNode] = []
    links: List[ClusterLink] = []
    traversed_ids: Set[str] = set()

    # Add focus node
    focus_name = focus_node.get('name', focus_node.get('id', 'focus'))
    focus_cluster_node = ClusterNode(
        id=focus_node.get('id', ''),
        node_type=focus_node.get('node_type', 'unknown'),
        name=focus_name,
        synthesis=focus_node.get('synthesis', focus_name),
        embedding=focus_node.get('embedding', []),
        weight=focus_node.get('weight', 1.0),
        energy=focus_node.get('energy', 0.0),
        content=focus_node.get('content'),
    )
    nodes.append(focus_cluster_node)

    # Fetch path nodes and links
    for link_id, node_id in path:
        traversed_ids.add(link_id)

        # Fetch node
        if graph.get_node:
            node = await graph.get_node(node_id)
            if node:
                node_name = node.get('name', node_id)
                nodes.append(ClusterNode(
                    id=node_id,
                    node_type=node.get('node_type', 'unknown'),
                    name=node_name,
                    synthesis=node.get('synthesis', node_name),
                    embedding=node.get('embedding', []),
                    weight=node.get('weight', 1.0),
                    energy=node.get('energy', 0.0),
                    content=node.get('content'),
                ))

        # Fetch link
        if hasattr(graph, 'get_link') and graph.get_link:
            link = await graph.get_link(link_id)
            if link:
                links.append(ClusterLink(
                    id=link_id,
                    source_id=link.get('from_id', ''),
                    target_id=link.get('to_id', ''),
                    synthesis=link.get('synthesis', ''),
                    embedding=link.get('embedding', []),
                    weight=link.get('weight', 1.0),
                    energy=link.get('energy', 0.0),
                    permanence=link.get('permanence', 0.0),
                ))

    # === MODE: COMPACT ===
    # Simple path description: "A → B → C → focus"
    if mode == 'compact':
        if len(nodes) <= 1:
            return f"{intention}: {focus_name}" if intention else focus_name

        path_names = [n.name for n in nodes[1:]]  # Skip focus node
        if len(path_names) > 3:
            path_desc = f"{path_names[0]} → ... → {path_names[-1]}"
        else:
            path_desc = " → ".join(path_names)

        content = f"{path_desc} → {focus_name}"
        if intention:
            content = f"{intention}: {content}"
        return content

    # === MODE: CRYSTALLIZE ===
    # Prose narrative from path - used for creating new narratives
    if mode == 'crystallize':
        lines = []
        if intention:
            lines.append(intention)
            lines.append("")

        # Build prose from path (reverse order: start → focus)
        ordered_nodes = list(reversed(nodes))
        link_map = {l.id: l for l in links}

        for i, node in enumerate(ordered_nodes):
            if i == 0:
                # First node - unfold with full prose
                lines.append(unfold_node_synthesis(node, lang=lang))
            else:
                # Find the link connecting previous node to this one
                prev_node = ordered_nodes[i - 1]
                connecting_link = None
                for link in links:
                    if (link.source_id == prev_node.id and link.target_id == node.id) or \
                       (link.source_id == node.id and link.target_id == prev_node.id):
                        connecting_link = link
                        break

                if connecting_link:
                    lines.append(unfold_link_synthesis(connecting_link, target_name=node.name, lang=lang))
                else:
                    lines.append(f"→ **{node.name}**")

            # Add content block if available
            if node.content:
                lines.append(f"> {node.content}")
                lines.append("")

        return "\n".join(lines)

    # === MODE: RESPONSE ===
    # Full tree format with markers and content blocks
    lines = []

    # Header with intention
    if intention:
        lines.append(f"**Intent:** {intention}")
        lines.append("")

    # Build tree from path (start → focus)
    ordered_nodes = list(reversed(nodes))
    node_map = {n.id: n for n in nodes}
    link_map = {l.id: l for l in links}

    lines.append("### Path")
    lines.append("")
    lines.append("```")

    for i, node in enumerate(ordered_nodes):
        is_focus = (node.id == focus_cluster_node.id)
        marker = f"  {Marker.RESPONSE.value}" if is_focus else ""

        lines.append(f"{node.synthesis}{marker}")

        # Content block
        content_lines = format_content_block(node.content)
        lines.extend(content_lines)

        # Link to next node
        if i < len(ordered_nodes) - 1:
            next_node = ordered_nodes[i + 1]
            # Find connecting link
            connecting_link = None
            for link in links:
                if (link.source_id == node.id and link.target_id == next_node.id) or \
                   (link.target_id == node.id and link.source_id == next_node.id):
                    connecting_link = link
                    break

            if connecting_link:
                lines.append("  │")
                lines.append(f"  └─ {connecting_link.synthesis}")
                lines.append("     │")
                lines.append("     ▼")

    lines.append("```")
    lines.append("")

    # Stats
    lines.append(f"**Traversal:** {len(nodes)} nodes, {len(links)} links")

    return "\n".join(lines)
