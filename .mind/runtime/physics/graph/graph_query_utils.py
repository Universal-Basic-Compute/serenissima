"""
Graph Query Utilities

Standalone helper functions for graph query operations.
Extracted from graph_queries.py to reduce file size.

DOCS: None yet (extracted during monolith split)
"""

import json
import logging
import numpy as np
from typing import Dict, Any, List, Optional

logger = logging.getLogger(__name__)

# Fields to exclude from output (internal/technical only)
SYSTEM_FIELDS = {
    'embedding',
    'created_at', 'updated_at',
    'created_at_s', 'updated_at_s',
    'last_modified_s',
    'size_bytes',
}

# Fields to exclude from search results (keeps energy/weight for scoring display)
SEARCH_EXCLUDE_FIELDS = {
    'embedding',
    'created_at', 'updated_at',
    'created_at_s', 'updated_at_s',
    'last_modified_s',
    'size_bytes',
}


def cosine_similarity(a: List[float], b: List[float]) -> float:
    """Calculate cosine similarity between two vectors."""
    a = np.array(a)
    b = np.array(b)
    if np.linalg.norm(a) == 0 or np.linalg.norm(b) == 0:
        return 0.0
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))


def extract_node_props(node, system_fields: set = None) -> Optional[Dict[str, Any]]:
    """
    Extract properties from a FalkorDB node.

    Args:
        node: FalkorDB node object or dict
        system_fields: Fields to exclude (defaults to SYSTEM_FIELDS)

    Returns:
        Dict of cleaned properties or None if invalid
    """
    if system_fields is None:
        system_fields = SYSTEM_FIELDS

    if not node:
        return None

    try:
        # Handle FalkorDB Node objects
        if hasattr(node, 'properties'):
            labels = list(node.labels) if hasattr(node, 'labels') else []
            props = node.properties
        elif isinstance(node, list) and len(node) >= 2:
            labels = node[0] if isinstance(node[0], list) else [node[0]]
            props = node[1] if isinstance(node[1], dict) else {}
        elif isinstance(node, dict):
            labels = []
            props = node
        # Handle Neo4j v6 nodes (have get() and items() but not properties)
        elif hasattr(node, 'get') and hasattr(node, 'items'):
            labels = list(node.labels) if hasattr(node, 'labels') else []
            props = dict(node.items())
        else:
            return None

        # Clean props
        clean = {k: v for k, v in props.items() if k not in system_fields}

        # Add type from label
        if labels:
            label = labels[0] if isinstance(labels[0], str) else str(labels[0])
            clean['type'] = label.lower()

        # Parse JSON strings
        for key in ['values', 'skills', 'weather', 'details', 'about_characters',
                    'about_places', 'narratives', 'voice_phrases']:
            if key in clean and isinstance(clean[key], str):
                try:
                    clean[key] = json.loads(clean[key])
                except:
                    pass

        return clean

    except Exception as e:
        logger.warning(f"Error extracting node props: {e}")
        return None


def extract_link_props(rel, system_fields: set = None) -> Optional[Dict[str, Any]]:
    """
    Extract properties from a FalkorDB relationship.

    Args:
        rel: FalkorDB relationship object or dict
        system_fields: Fields to exclude (defaults to SYSTEM_FIELDS)

    Returns:
        Dict of cleaned properties or None if invalid
    """
    if system_fields is None:
        system_fields = SYSTEM_FIELDS

    if not rel:
        return None

    try:
        if hasattr(rel, "relation") and hasattr(rel, "properties"):
            props = rel.properties or {}
            return {
                "type": rel.relation,
                **{k: v for k, v in props.items() if k not in system_fields},
            }
        # FalkorDB relationship format varies
        if isinstance(rel, list) and len(rel) >= 3:
            rel_type = rel[0]
            props = rel[1] if isinstance(rel[1], dict) else {}
            link = {
                'type': rel_type,
                **{k: v for k, v in props.items() if k not in system_fields}
            }
            return link

        elif isinstance(rel, dict):
            cleaned = {k: v for k, v in rel.items() if k not in system_fields}
            if "type" not in cleaned and "relation" in rel:
                cleaned["type"] = rel.get("relation")
            return cleaned

        return None

    except Exception as e:
        logger.warning(f"Error extracting link props: {e}")
        return None


def to_markdown(search_result: Dict[str, Any]) -> str:
    """
    Convert search results to markdown format for LLM consumption.

    IMPORTANT: Include ALL fields. NEVER filter or summarize.
    The LLM needs complete information to make decisions.

    Args:
        search_result: Dict with 'query', 'matches', and optional 'clusters'

    Returns:
        Markdown-formatted string
    """
    lines = []
    query = search_result.get('query', '')
    matches = search_result.get('matches', [])
    clusters = search_result.get('clusters', [])

    lines.append(f"# Search: \"{query}\"\n")

    # Matches section
    lines.append("## Matches\n")
    for i, match in enumerate(matches, 1):
        node_type = match.get('type', 'unknown')
        name = match.get('name', match.get('id', 'Unknown'))
        similarity = match.get('similarity', 0)

        lines.append(f"### {i}. {name} ({node_type}) — {similarity:.2f}\n")

        # Include ALL fields (except similarity which is in header)
        for key, value in match.items():
            if key in ('type', 'name', 'similarity'):
                continue
            if value is None:
                continue

            # Format the value
            if isinstance(value, list):
                value_str = ', '.join(str(v) for v in value)
            elif isinstance(value, dict):
                value_str = json.dumps(value)
            else:
                value_str = str(value)

            lines.append(f"- **{key}:** {value_str}")

        lines.append("")  # Blank line between matches

    # Clusters section
    if clusters:
        lines.append("## Clusters\n")
        for cluster in clusters:
            root_id = cluster.get('root', 'unknown')
            root_type = cluster.get('root_type', 'unknown')
            nodes = cluster.get('nodes', [])

            lines.append(f"### Cluster: {root_id} ({root_type})\n")

            for node in nodes:
                node_name = node.get('name', node.get('id', 'Unknown'))
                node_type = node.get('type', 'unknown')
                distance = node.get('distance', 0)
                is_root = node.get('is_root', False)

                if is_root:
                    lines.append(f"**[ROOT] {node_name}** ({node_type})")
                else:
                    lines.append(f"- {node_name} ({node_type}, distance={distance})")

                # Include ALL fields for each node
                for key, value in node.items():
                    if key in ('type', 'name', 'id', 'distance', 'is_root'):
                        continue
                    if value is None:
                        continue

                    if isinstance(value, list):
                        value_str = ', '.join(str(v) for v in value)
                    elif isinstance(value, dict):
                        value_str = json.dumps(value)
                    else:
                        value_str = str(value)

                    lines.append(f"  - {key}: {value_str}")

            lines.append("")  # Blank line between clusters

    return '\n'.join(lines)


# =============================================================================
# PATH RESISTANCE (v1.2)
# =============================================================================

def calculate_link_resistance(
    weight: float,
    emotion_factor: float = 1.0
) -> float:
    """
    Calculate link resistance for path finding.

    Schema v1.2 formula: resistance = 1 / (weight × emotion_factor)
    If any factor is 0, returns infinity (path blocked).

    Args:
        weight: Link weight [0-∞]
        emotion_factor: Emotion alignment factor [0.5-1.5]

    Returns:
        Resistance value (lower is better), inf if blocked
    """
    product = weight * emotion_factor
    if product <= 0:
        return float('inf')
    return 1.0 / product


def dijkstra_with_resistance(
    edges: List[Dict[str, Any]],
    start: str,
    end: str,
    max_hops: int = 5
) -> Optional[Dict[str, Any]]:
    """
    Find shortest path using Dijkstra with v1.2 resistance formula.

    Args:
        edges: List of dicts with:
            - node_a: First node ID
            - node_b: Second node ID
            - weight: Link weight [0-∞]
            - emotion_factor: (optional) Emotion alignment [0.5-1.5]
        start: Starting node ID
        end: Target node ID
        max_hops: Maximum path length (default 5)

    Returns:
        Dict with:
            - path: List of node IDs from start to end
            - total_resistance: Sum of resistances
            - hops: Number of edges traversed
        Or None if no path found within max_hops
    """
    import heapq

    # Build adjacency list with resistances
    graph: Dict[str, List[tuple]] = {}
    for edge in edges:
        node_a = edge.get('node_a')
        node_b = edge.get('node_b')
        weight = edge.get('weight', 1.0)
        emotion_factor = edge.get('emotion_factor', 1.0)

        if not node_a or not node_b:
            continue

        resistance = calculate_link_resistance(weight, emotion_factor)

        # Bidirectional
        if node_a not in graph:
            graph[node_a] = []
        if node_b not in graph:
            graph[node_b] = []

        graph[node_a].append((node_b, resistance))
        graph[node_b].append((node_a, resistance))

    if start not in graph:
        return None

    # Dijkstra with hop limit
    # Priority queue: (resistance, hops, node, path)
    pq = [(0.0, 0, start, [start])]
    visited = set()

    while pq:
        resistance, hops, node, path = heapq.heappop(pq)

        if node == end:
            return {
                'path': path,
                'total_resistance': resistance,
                'hops': hops
            }

        if node in visited:
            continue
        visited.add(node)

        if hops >= max_hops:
            continue

        for neighbor, edge_resistance in graph.get(node, []):
            if neighbor not in visited:
                new_resistance = resistance + edge_resistance
                heapq.heappush(pq, (
                    new_resistance,
                    hops + 1,
                    neighbor,
                    path + [neighbor]
                ))

    return None


def dijkstra_single_source(
    edges: List[Dict[str, Any]],
    start: str,
    max_hops: int = 5
) -> Dict[str, float]:
    """
    Single-source Dijkstra — compute resistance to ALL reachable nodes in ONE pass.

    This is O(E log V) instead of O(N × E log V) when called per-target.

    Args:
        edges: List of dicts with node_a, node_b, weight, emotion_factor
        start: Starting node ID
        max_hops: Maximum path length (default 5)

    Returns:
        Dict mapping node_id -> total_resistance from start
        Nodes not reachable within max_hops are not included.
    """
    import heapq

    # Build adjacency list with resistances
    graph: Dict[str, List[tuple]] = {}
    for edge in edges:
        node_a = edge.get('node_a')
        node_b = edge.get('node_b')
        weight = edge.get('weight', 1.0)
        emotion_factor = edge.get('emotion_factor', 1.0)

        if not node_a or not node_b:
            continue

        resistance = calculate_link_resistance(weight, emotion_factor)

        # Bidirectional
        if node_a not in graph:
            graph[node_a] = []
        if node_b not in graph:
            graph[node_b] = []

        graph[node_a].append((node_b, resistance))
        graph[node_b].append((node_a, resistance))

    if start not in graph:
        return {start: 0.0}

    # Result: node_id -> resistance
    distances: Dict[str, float] = {start: 0.0}

    # Priority queue: (resistance, hops, node)
    pq = [(0.0, 0, start)]
    visited = set()

    while pq:
        resistance, hops, node = heapq.heappop(pq)

        if node in visited:
            continue
        visited.add(node)
        distances[node] = resistance

        if hops >= max_hops:
            continue

        for neighbor, edge_resistance in graph.get(node, []):
            if neighbor not in visited:
                new_resistance = resistance + edge_resistance
                heapq.heappush(pq, (new_resistance, hops + 1, neighbor))

    return distances


def view_to_scene_tree(view_result: Dict[str, Any]) -> Dict[str, Any]:
    """
    Convert a view query result to SceneTree format for backward compatibility.

    This allows the frontend to continue using SceneTree while we transition
    to the Moment Graph Architecture.

    Args:
        view_result: Result from get_current_view()

    Returns:
        SceneTree-compatible dict
    """
    location = view_result.get('location', {})
    characters = view_result.get('characters', [])
    active_moments = view_result.get('active_moments', [])
    transitions = view_result.get('transitions', [])

    # Build narration list from active moments
    narration = []
    for moment in active_moments:
        narration_item = {
            "content": moment.get('text', ''),
            "speaker": moment.get('speaker')
        }

        # Add clickables from transitions
        clickables = {}
        for trans in transitions:
            if trans.get('from_id') == moment.get('id'):
                words = trans.get('require_words', [])
                if isinstance(words, str):
                    words = json.loads(words)
                for word in (words or []):
                    clickables[word] = {
                        "speaks": f"Tell me about {word}",
                        "intent": "explore",
                        "waitingMessage": "..."
                    }

        if clickables:
            narration_item['clickable'] = clickables

        narration.append(narration_item)

    return {
        "id": f"scene_{location.get('id', 'unknown')}",
        "location": {
            "place": location.get('id', ''),
            "name": location.get('name', ''),
            "region": location.get('type', ''),
            "time": "present"
        },
        "characters": [c.get('id') for c in characters],
        "atmosphere": location.get('details', []) if isinstance(location.get('details'), list) else [],
        "narration": narration,
        "voices": []
    }
