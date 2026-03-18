"""
Link Scoring — v1.7.2 SubEntity Traversal Scoring

Implements the link score formula for SubEntity traversal decisions.
This module is the core of the "SEEKING" phase in the SubEntity state machine.

FORMULA:
    link_score = semantic × polarity[direction] × (1 - permanence) × self_novelty × sibling_divergence

WHERE:
    - semantic: cosine similarity between intention and link embedding
    - polarity[direction]: +1 or -1 based on traversal direction (a→b or b→a)
    - permanence: weight / (weight + 1) — how frozen the link is
    - self_novelty: 1 - max(cos(link, path)) — avoid backtracking
    - sibling_divergence: 1 - max(cos(link, sibling.crystallization_embedding)) — spread exploration

v1.7.2 CHANGES:
    - D5: Branch threshold is simple count (len >= 2), not ratio
    - Link scoring handles path selection via score ranking

DOCS: docs/physics/ALGORITHM_Physics.md (v1.7.2 SubEntity section)
"""

from typing import List, Dict, Any, Optional, Tuple
from math import sqrt


# =============================================================================
# COSINE SIMILARITY
# =============================================================================

def cosine_similarity(a: List[float], b: List[float]) -> float:
    """
    Calculate cosine similarity between two embedding vectors.

    Args:
        a: First embedding vector
        b: Second embedding vector

    Returns:
        Cosine similarity in [-1, 1] range.
        Returns 0.0 if either vector is empty or zero-norm.
    """
    if not a or not b or len(a) != len(b):
        return 0.0

    dot = sum(x * y for x, y in zip(a, b))
    norm_a = sqrt(sum(x * x for x in a))
    norm_b = sqrt(sum(x * x for x in b))

    if norm_a == 0.0 or norm_b == 0.0:
        return 0.0

    return dot / (norm_a * norm_b)


def max_cosine_against_set(
    embedding: List[float],
    embedding_set: List[List[float]]
) -> float:
    """
    Find maximum cosine similarity between an embedding and a set of embeddings.

    Used for:
    - self_novelty: max similarity to path embeddings
    - sibling_divergence: max similarity to sibling crystallization embeddings

    Args:
        embedding: The embedding to compare
        embedding_set: Set of embeddings to compare against

    Returns:
        Maximum cosine similarity found. Returns 0.0 if set is empty.
    """
    if not embedding or not embedding_set:
        return 0.0

    max_sim = 0.0
    for other in embedding_set:
        if other:
            sim = cosine_similarity(embedding, other)
            if sim > max_sim:
                max_sim = sim

    return max_sim


# =============================================================================
# PERMANENCE
# =============================================================================

def calculate_permanence(weight: float) -> float:
    """
    Calculate permanence from link weight.

    Permanence represents how "frozen" a link is:
    - weight 0 → permanence 0 (fully dynamic, easy to traverse)
    - weight 1 → permanence 0.5
    - weight ∞ → permanence → 1.0 (fully permanent, hard to traverse)

    Formula: permanence = weight / (weight + 1)

    Args:
        weight: Link weight (unbounded, >= 0)

    Returns:
        Permanence in [0, 1) range
    """
    if weight is None:
        weight = 1.0
    if weight < 0:
        return 0.0
    return weight / (weight + 1.0)


# =============================================================================
# POLARITY
# =============================================================================

def get_polarity(
    link: Dict[str, Any],
    from_node_id: str
) -> float:
    """
    Get polarity for traversal direction.

    Supports multiple formats:
    - v1.8.1: polarity as list [a→b, b→a]
    - v1.6.1: polarity_ab and polarity_ba as separate fields
    - Legacy: direction-based (support/oppose/elaborate)

    Args:
        link: Link dict with node_a, node_b, and optional polarity fields
        from_node_id: ID of the node we're traversing FROM

    Returns:
        Polarity in [-1, +1] range (float)
    """
    node_a = link.get('node_a', '')
    node_b = link.get('node_b', '')

    # Check v1.8.1 list format first: polarity = [a→b, b→a]
    polarity = link.get('polarity')
    if polarity is not None:
        if isinstance(polarity, (list, tuple)) and len(polarity) >= 2:
            if from_node_id == node_a:
                return float(polarity[0])
            elif from_node_id == node_b:
                return float(polarity[1])
            else:
                # Unknown direction, use average
                return float((polarity[0] + polarity[1]) / 2)
        elif isinstance(polarity, (int, float)):
            return float(polarity)

    # Check v1.6.1 explicit polarity fields
    if from_node_id == node_a:
        if 'polarity_ab' in link:
            return float(link['polarity_ab'])
    elif from_node_id == node_b:
        if 'polarity_ba' in link:
            return float(link['polarity_ba'])

    # Fall back to direction-based polarity (legacy)
    direction = link.get('direction')
    if direction == 'support':
        return 1.0
    elif direction == 'oppose':
        return -1.0
    elif direction in ('elaborate', 'subsume', 'supersede'):
        return 0.5

    # Default: positive polarity (allow traversal)
    return 0.5


# =============================================================================
# LINK SCORE FORMULA
# =============================================================================

def calculate_link_score(
    link: Dict[str, Any],
    from_node_id: str,
    intention_embedding: List[float],
    path_embeddings: List[List[float]],
    sibling_embeddings: List[List[float]],
) -> Tuple[float, Dict[str, float]]:
    """
    Calculate link score for SubEntity traversal decision.

    FORMULA:
        link_score = semantic × polarity[direction] × (1 - permanence) × self_novelty × sibling_divergence

    Args:
        link: Link dict with embedding, weight, node_a, node_b, direction fields
        from_node_id: ID of the node we're traversing FROM
        intention_embedding: SubEntity's intention embedding (what we're looking for)
        path_embeddings: Embeddings of links already traversed (for self_novelty)
        sibling_embeddings: Crystallization embeddings of siblings (for divergence)

    Returns:
        Tuple of (score, components dict) where components contains individual factors
    """
    link_embedding = link.get('embedding')
    weight = link.get('weight', 1.0)

    # 1. Semantic similarity
    if link_embedding and intention_embedding:
        semantic = cosine_similarity(link_embedding, intention_embedding)
    else:
        semantic = 0.5  # neutral if no embeddings

    # 2. Polarity
    polarity = get_polarity(link, from_node_id)

    # 3. Permanence factor (1 - permanence)
    permanence = calculate_permanence(weight)
    permanence_factor = 1.0 - permanence

    # 4. Self-novelty (avoid backtracking)
    if link_embedding and path_embeddings:
        max_path_sim = max_cosine_against_set(link_embedding, path_embeddings)
        self_novelty = 1.0 - max_path_sim
    else:
        self_novelty = 1.0  # fully novel if no path yet

    # 5. Sibling divergence (spread exploration)
    if link_embedding and sibling_embeddings:
        max_sibling_sim = max_cosine_against_set(link_embedding, sibling_embeddings)
        sibling_divergence = 1.0 - max_sibling_sim
    else:
        sibling_divergence = 1.0  # fully divergent if no siblings

    # Calculate final score
    score = semantic * polarity * permanence_factor * self_novelty * sibling_divergence

    components = {
        'semantic': semantic,
        'polarity': polarity,
        'permanence': permanence,
        'permanence_factor': permanence_factor,
        'self_novelty': self_novelty,
        'sibling_divergence': sibling_divergence,
    }

    return score, components


def score_outgoing_links(
    links: List[Dict[str, Any]],
    from_node_id: str,
    intention_embedding: List[float],
    path_embeddings: List[List[float]],
    sibling_embeddings: List[List[float]],
    min_score: float = 0.0,
) -> List[Tuple[Dict[str, Any], float, Dict[str, float]]]:
    """
    Score all outgoing links from a node and return sorted by score.

    Args:
        links: List of link dicts
        from_node_id: ID of the node we're traversing FROM
        intention_embedding: SubEntity's intention embedding
        path_embeddings: Embeddings of links already traversed
        sibling_embeddings: Crystallization embeddings of siblings
        min_score: Minimum score threshold (links below this are excluded)

    Returns:
        List of (link, score, components) tuples, sorted by score descending
    """
    results = []

    for link in links:
        # Only consider links connected to from_node_id
        node_a = link.get('node_a', '')
        node_b = link.get('node_b', '')

        if node_a != from_node_id and node_b != from_node_id:
            continue

        score, components = calculate_link_score(
            link=link,
            from_node_id=from_node_id,
            intention_embedding=intention_embedding,
            path_embeddings=path_embeddings,
            sibling_embeddings=sibling_embeddings,
        )

        if score >= min_score:
            results.append((link, score, components))

    # Sort by score descending
    results.sort(key=lambda x: x[1], reverse=True)

    return results


def get_target_node_id(link: Dict[str, Any], from_node_id: str) -> Optional[str]:
    """
    Get the target node ID when traversing a link from a given node.

    Args:
        link: Link dict with node_a, node_b
        from_node_id: ID of the node we're traversing FROM

    Returns:
        ID of the target node, or None if from_node_id not in link
    """
    node_a = link.get('node_a', '')
    node_b = link.get('node_b', '')

    if from_node_id == node_a:
        return node_b
    elif from_node_id == node_b:
        return node_a
    else:
        return None


# =============================================================================
# BRANCH DETECTION
# =============================================================================

def should_branch(
    outgoing_scores: List[Tuple[Dict[str, Any], float, Dict[str, float]]],
    min_links: int = 2,
) -> bool:
    """
    Determine if SubEntity should branch at current position.

    v1.7.2 Design Decision (D5): Simple count threshold.
    Branch IF len(outgoing_links with positive score) >= min_links.

    Link scoring handles path selection — all viable paths get explored
    via branching, and scores determine priority.

    Args:
        outgoing_scores: Scored links from score_outgoing_links()
        min_links: Minimum links to trigger branching (default 2)

    Returns:
        True if should branch, False otherwise
    """
    # v1.7.2: Simple count threshold, not ratio
    # Count links with positive scores
    positive_links = [s for s in outgoing_scores if s[1] > 0]
    return len(positive_links) >= min_links


def select_branch_candidates(
    outgoing_scores: List[Tuple[Dict[str, Any], float, Dict[str, float]]],
    max_branches: int = 3,
    min_relative_score: float = 0.5,
) -> List[Tuple[Dict[str, Any], float, Dict[str, float]]]:
    """
    Select links to branch on.

    Args:
        outgoing_scores: Scored links from score_outgoing_links()
        max_branches: Maximum number of branches (default 3)
        min_relative_score: Minimum score relative to top (default 0.5 = 50%)

    Returns:
        List of (link, score, components) for branch candidates
    """
    if not outgoing_scores:
        return []

    top_score = outgoing_scores[0][1]
    if top_score <= 0:
        return []

    candidates = []
    for link, score, components in outgoing_scores[:max_branches]:
        relative_score = score / top_score
        if relative_score >= min_relative_score:
            candidates.append((link, score, components))

    return candidates
