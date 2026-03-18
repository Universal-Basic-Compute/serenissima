"""
Crystallization — v1.6.1 SubEntity Narrative Creation

When a SubEntity exploration doesn't find a satisfying existing narrative,
it crystallizes a new one from its exploration path.

ALGORITHM:
1. Compute crystallization_embedding (weighted sum of intention, position, found_narratives, path)
2. Check novelty: cosine similarity to all existing narratives must be < 0.85
3. If novel: create new Narrative with synthesized name/content
4. Link new narrative to found narratives with alignment scores
5. Set SubEntity.crystallized field

DOCS: docs/physics/ALGORITHM_Physics.md (v1.6.1 CRYSTALLIZING section)
"""

from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass, field
import time
import uuid

from runtime.physics.link_scoring import cosine_similarity, max_cosine_against_set


# =============================================================================
# CONSTANTS
# =============================================================================

# Novelty threshold: if max similarity to existing narratives >= this, don't crystallize
NOVELTY_THRESHOLD = 0.85

# Weights for crystallization embedding computation
CRYSTALLIZATION_WEIGHTS = {
    'intention': 0.4,
    'position': 0.3,
    'found_narratives': 0.2,
    'path': 0.1,
}


# =============================================================================
# CRYSTALLIZATION EMBEDDING
# =============================================================================

def weighted_embedding_sum(
    components: List[Tuple[float, Optional[List[float]]]]
) -> Optional[List[float]]:
    """
    Compute weighted sum of embeddings.

    Args:
        components: List of (weight, embedding) tuples

    Returns:
        Weighted sum embedding, or None if all inputs are None
    """
    # Find first non-None embedding to get dimension
    dim = None
    for weight, emb in components:
        if emb is not None:
            dim = len(emb)
            break

    if dim is None:
        return None

    # Compute weighted sum
    result = [0.0] * dim
    total_weight = 0.0

    for weight, emb in components:
        if emb is not None and len(emb) == dim:
            for i in range(dim):
                result[i] += weight * emb[i]
            total_weight += weight

    # Normalize by total weight
    if total_weight > 0:
        result = [v / total_weight for v in result]

    return result


def mean_embedding(embeddings: List[List[float]]) -> Optional[List[float]]:
    """
    Compute mean of embeddings.

    Args:
        embeddings: List of embedding vectors

    Returns:
        Mean embedding, or None if list is empty
    """
    if not embeddings:
        return None

    valid = [e for e in embeddings if e is not None]
    if not valid:
        return None

    dim = len(valid[0])
    result = [0.0] * dim

    for emb in valid:
        if len(emb) == dim:
            for i in range(dim):
                result[i] += emb[i]

    n = len(valid)
    return [v / n for v in result]


def compute_crystallization_embedding(
    intention_embedding: Optional[List[float]],
    position_embedding: Optional[List[float]],
    found_narrative_embeddings: List[List[float]],
    path_link_embeddings: List[List[float]],
) -> Optional[List[float]]:
    """
    Compute crystallization embedding for SubEntity.

    v1.6.1 Formula:
        crystallization_embedding = weighted_sum([
            (0.4, intention_embedding),
            (0.3, position.embedding),
            (0.2, mean(found_narratives.embeddings)),
            (0.1, mean(path_links.embeddings))
        ])

    Args:
        intention_embedding: SubEntity's original intention
        position_embedding: Current position node's embedding
        found_narrative_embeddings: Embeddings of found narratives
        path_link_embeddings: Embeddings of traversed links

    Returns:
        Crystallization embedding
    """
    found_mean = mean_embedding(found_narrative_embeddings)
    path_mean = mean_embedding(path_link_embeddings)

    components = [
        (CRYSTALLIZATION_WEIGHTS['intention'], intention_embedding),
        (CRYSTALLIZATION_WEIGHTS['position'], position_embedding),
        (CRYSTALLIZATION_WEIGHTS['found_narratives'], found_mean),
        (CRYSTALLIZATION_WEIGHTS['path'], path_mean),
    ]

    return weighted_embedding_sum(components)


def update_crystallization_embedding_incremental(
    current: Optional[List[float]],
    new_contribution: Optional[List[float]],
    contribution_weight: float = 0.1,
) -> Optional[List[float]]:
    """
    Incrementally update crystallization embedding.

    Used at each traversal step to keep embedding current.

    Args:
        current: Current crystallization embedding
        new_contribution: New embedding to blend in
        contribution_weight: Weight for new contribution (default 0.1)

    Returns:
        Updated embedding
    """
    if new_contribution is None:
        return current
    if current is None:
        return new_contribution

    if len(current) != len(new_contribution):
        return current

    old_weight = 1.0 - contribution_weight
    return [
        old_weight * c + contribution_weight * n
        for c, n in zip(current, new_contribution)
    ]


# =============================================================================
# NOVELTY CHECK
# =============================================================================

def check_novelty(
    crystallization_embedding: List[float],
    existing_narrative_embeddings: List[List[float]],
    threshold: float = NOVELTY_THRESHOLD,
) -> Tuple[bool, float, Optional[int]]:
    """
    Check if crystallization embedding is novel (different from existing narratives).

    Args:
        crystallization_embedding: Proposed new narrative embedding
        existing_narrative_embeddings: Embeddings of all existing narratives
        threshold: Maximum allowed similarity (default 0.85)

    Returns:
        Tuple of (is_novel, max_similarity, most_similar_index)
    """
    if not crystallization_embedding:
        return False, 0.0, None

    if not existing_narrative_embeddings:
        return True, 0.0, None

    max_sim = 0.0
    most_similar_idx = None

    for i, existing in enumerate(existing_narrative_embeddings):
        if existing is None:
            continue
        sim = cosine_similarity(crystallization_embedding, existing)
        if sim > max_sim:
            max_sim = sim
            most_similar_idx = i

    is_novel = max_sim < threshold
    return is_novel, max_sim, most_similar_idx


def find_similar_narratives(
    crystallization_embedding: List[float],
    narrative_embeddings: List[Tuple[str, List[float]]],
    threshold: float = NOVELTY_THRESHOLD,
) -> List[Tuple[str, float]]:
    """
    Find narratives similar to crystallization embedding.

    Args:
        crystallization_embedding: Proposed new narrative embedding
        narrative_embeddings: List of (narrative_id, embedding) tuples
        threshold: Minimum similarity to include (default 0.85)

    Returns:
        List of (narrative_id, similarity) tuples for similar narratives
    """
    if not crystallization_embedding:
        return []

    similar = []
    for narrative_id, embedding in narrative_embeddings:
        if embedding is None:
            continue
        sim = cosine_similarity(crystallization_embedding, embedding)
        if sim >= threshold:
            similar.append((narrative_id, sim))

    # Sort by similarity descending
    similar.sort(key=lambda x: x[1], reverse=True)
    return similar


# =============================================================================
# NARRATIVE CREATION
# =============================================================================

@dataclass
class CrystallizedNarrative:
    """Result of crystallization process."""
    id: str
    embedding: List[float]
    synthesis: str
    found_narratives: List[Tuple[str, float]]  # (narrative_id, alignment)
    origin_moment: Optional[str]
    created_at_s: int
    is_novel: bool
    max_similarity: float
    most_similar_id: Optional[str] = None


def generate_narrative_id() -> str:
    """Generate unique narrative ID."""
    return f"narrative_crystallized_{uuid.uuid4().hex[:8]}"


def crystallize(
    crystallization_embedding: List[float],
    synthesis: str,
    found_narratives: List[Tuple[str, float]],
    origin_moment: Optional[str],
    existing_narratives: List[Tuple[str, List[float]]],
    threshold: float = NOVELTY_THRESHOLD,
) -> Optional[CrystallizedNarrative]:
    """
    Attempt to crystallize a new narrative.

    Args:
        crystallization_embedding: Computed from SubEntity exploration
        synthesis: Generated text for narrative (from synthesis.py)
        found_narratives: List of (narrative_id, alignment) tuples
        origin_moment: Moment that runed the SubEntity
        existing_narratives: List of (id, embedding) for existing narratives
        threshold: Novelty threshold

    Returns:
        CrystallizedNarrative if novel, None if too similar to existing
    """
    if not crystallization_embedding:
        return None

    # Extract just embeddings for novelty check
    existing_embeddings = [emb for _, emb in existing_narratives if emb is not None]

    is_novel, max_sim, most_similar_idx = check_novelty(
        crystallization_embedding,
        existing_embeddings,
        threshold,
    )

    most_similar_id = None
    if most_similar_idx is not None and most_similar_idx < len(existing_narratives):
        most_similar_id = existing_narratives[most_similar_idx][0]

    if not is_novel:
        # Return info about why crystallization failed
        return CrystallizedNarrative(
            id="",
            embedding=crystallization_embedding,
            synthesis=synthesis,
            found_narratives=found_narratives,
            origin_moment=origin_moment,
            created_at_s=int(time.time()),
            is_novel=False,
            max_similarity=max_sim,
            most_similar_id=most_similar_id,
        )

    # Create new narrative
    return CrystallizedNarrative(
        id=generate_narrative_id(),
        embedding=crystallization_embedding,
        synthesis=synthesis,
        found_narratives=found_narratives,
        origin_moment=origin_moment,
        created_at_s=int(time.time()),
        is_novel=True,
        max_similarity=max_sim,
        most_similar_id=most_similar_id,
    )


# =============================================================================
# LINK CREATION FOR CRYSTALLIZED NARRATIVES
# =============================================================================

@dataclass
class CrystallizationLink:
    """Link to create for crystallized narrative."""
    source_id: str
    target_id: str
    link_type: str
    polarity_ab: float
    polarity_ba: float
    weight: float


def generate_crystallization_links(
    crystallized: CrystallizedNarrative,
) -> List[CrystallizationLink]:
    """
    Generate links for a crystallized narrative.

    Creates:
    1. Links to found narratives with alignment as polarity
    2. Link from origin moment (if exists)

    Args:
        crystallized: The crystallized narrative

    Returns:
        List of links to create
    """
    if not crystallized.is_novel or not crystallized.id:
        return []

    links = []

    # Links to found narratives
    for narrative_id, alignment in crystallized.found_narratives:
        links.append(CrystallizationLink(
            source_id=crystallized.id,
            target_id=narrative_id,
            link_type='relates',
            polarity_ab=alignment,
            polarity_ba=alignment,
            weight=0.5 * alignment,  # Weight proportional to alignment
        ))

    # Link from origin moment
    if crystallized.origin_moment:
        links.append(CrystallizationLink(
            source_id=crystallized.origin_moment,
            target_id=crystallized.id,
            link_type='about',
            polarity_ab=1.0,
            polarity_ba=0.5,
            weight=1.0,
        ))

    return links


# =============================================================================
# SUBENTITY CRYSTALLIZATION STATE
# =============================================================================

@dataclass
class SubEntityCrystallizationState:
    """
    Tracks crystallization state for a SubEntity.

    Updated at each step of exploration.
    """
    intention_embedding: Optional[List[float]] = None
    position_embedding: Optional[List[float]] = None
    found_narratives: List[Tuple[str, float, List[float]]] = field(default_factory=list)  # (id, alignment, embedding)
    path_links: List[Tuple[str, List[float]]] = field(default_factory=list)  # (link_id, embedding)
    crystallization_embedding: Optional[List[float]] = None
    crystallized: Optional[str] = None  # ID of crystallized narrative (if any)

    def add_found_narrative(
        self,
        narrative_id: str,
        alignment: float,
        embedding: Optional[List[float]],
    ) -> None:
        """Add a found narrative and update crystallization embedding."""
        if embedding:
            self.found_narratives.append((narrative_id, alignment, embedding))
            self._update_crystallization()

    def add_path_link(
        self,
        link_id: str,
        embedding: Optional[List[float]],
    ) -> None:
        """Add a traversed link and update crystallization embedding."""
        if embedding:
            self.path_links.append((link_id, embedding))
            self._update_crystallization()

    def update_position(self, position_embedding: Optional[List[float]]) -> None:
        """Update position and recalculate crystallization embedding."""
        self.position_embedding = position_embedding
        self._update_crystallization()

    def _update_crystallization(self) -> None:
        """Recalculate crystallization embedding."""
        found_embeddings = [emb for _, _, emb in self.found_narratives if emb]
        path_embeddings = [emb for _, emb in self.path_links if emb]

        self.crystallization_embedding = compute_crystallization_embedding(
            intention_embedding=self.intention_embedding,
            position_embedding=self.position_embedding,
            found_narrative_embeddings=found_embeddings,
            path_link_embeddings=path_embeddings,
        )

    def get_found_narrative_tuples(self) -> List[Tuple[str, float]]:
        """Get found narratives as (id, alignment) tuples."""
        return [(id, align) for id, align, _ in self.found_narratives]

    def attempt_crystallization(
        self,
        synthesis: str,
        origin_moment: Optional[str],
        existing_narratives: List[Tuple[str, List[float]]],
        threshold: float = NOVELTY_THRESHOLD,
    ) -> Optional[CrystallizedNarrative]:
        """
        Attempt to crystallize a new narrative from current state.

        Args:
            synthesis: Generated text for narrative
            origin_moment: Moment that runed the SubEntity
            existing_narratives: List of (id, embedding) for existing narratives
            threshold: Novelty threshold

        Returns:
            CrystallizedNarrative if successful, None if not novel
        """
        if not self.crystallization_embedding:
            self._update_crystallization()

        if not self.crystallization_embedding:
            return None

        result = crystallize(
            crystallization_embedding=self.crystallization_embedding,
            synthesis=synthesis,
            found_narratives=self.get_found_narrative_tuples(),
            origin_moment=origin_moment,
            existing_narratives=existing_narratives,
            threshold=threshold,
        )

        if result and result.is_novel:
            self.crystallized = result.id

        return result
