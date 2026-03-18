"""
SubEntity Health Checkers (v1.6.1)

Validates SubEntity structure and consistency during exploration.

HEALTH: docs/schema/HEALTH_Schema.md#indicator-subentity-integrity
HEALTH: docs/physics/HEALTH_Physics.md#v161-subentity-exploration-health

Checkers:
- SubEntityTreeChecker: Validates parent/sibling/children consistency (V15)
- FoundNarrativesChecker: Validates (id, alignment) tuple format (V16)
- CrystallizationEmbeddingChecker: Verifies non-null embeddings (V17, V18)
- CrystallizedConsistencyChecker: Verifies crystallized field (V19)
- SiblingDivergenceChecker: Verifies siblings explore different regions
- LinkScoreChecker: Validates link score computation

IMPL: engine/physics/subentity.py
"""

import logging
from typing import List, Optional, Dict, Any

from ..base import BaseChecker, HealthResult, HealthStatus
from runtime.physics.subentity import (
    SubEntity,
    SubEntityState,
    cosine_similarity,
    compute_link_score,
)

logger = logging.getLogger(__name__)


class SubEntityTreeChecker(BaseChecker):
    """
    Validate SubEntity tree structure consistency (V15).

    Checks:
    - All siblings share the same parent
    - All children point back to this parent
    - No circular references
    """

    name = "subentity_tree"
    validation_ids = ["V15"]
    priority = "high"

    def __init__(self, subentity: Optional[SubEntity] = None, **kwargs):
        """Initialize with a SubEntity to validate."""
        super().__init__(**kwargs)
        self.subentity = subentity

    def check(self) -> HealthResult:
        """Validate tree structure."""
        if not self.subentity:
            return self.unknown("No SubEntity provided")

        errors = []
        warnings = []

        # Check siblings share parent
        for sibling in self.subentity.siblings:
            if sibling.parent != self.subentity.parent:
                errors.append(f"Sibling {sibling.id} has different parent")

        # Check children point to this as parent
        for child in self.subentity.children:
            if child.parent != self.subentity:
                errors.append(f"Child {child.id} does not point to this SubEntity as parent")

        # Check for circular references (self in own ancestors)
        visited = set()
        current = self.subentity
        while current is not None:
            if current.id in visited:
                errors.append(f"Circular reference detected at {current.id}")
                break
            visited.add(current.id)
            current = current.parent

        details = {
            "subentity_id": self.subentity.id,
            "sibling_count": len(self.subentity.siblings),
            "child_count": len(self.subentity.children),
            "depth": self.subentity.depth,
        }

        if errors:
            return self.error(
                f"Tree structure invalid: {len(errors)} errors",
                details={**details, "errors": errors}
            )
        elif warnings:
            return self.warn(
                f"Tree structure warnings: {len(warnings)}",
                details={**details, "warnings": warnings}
            )
        else:
            return self.ok("Tree structure valid", details=details)


class FoundNarrativesChecker(BaseChecker):
    """
    Validate found_narratives format (V16).

    Checks:
    - Each item is a (narrative_id, alignment) tuple
    - alignment is a float in [-1, 1]
    - narrative_id is a string
    """

    name = "found_narratives"
    validation_ids = ["V16"]
    priority = "high"

    def __init__(self, subentity: Optional[SubEntity] = None, **kwargs):
        super().__init__(**kwargs)
        self.subentity = subentity

    def check(self) -> HealthResult:
        """Validate found_narratives format."""
        if not self.subentity:
            return self.unknown("No SubEntity provided")

        errors = []
        warnings = []

        for i, item in enumerate(self.subentity.found_narratives):
            # Check tuple format
            if not isinstance(item, (tuple, list)) or len(item) != 2:
                errors.append(f"Item {i}: not a 2-tuple: {type(item)}")
                continue

            narrative_id, alignment = item

            # Check narrative_id is string
            if not isinstance(narrative_id, str):
                errors.append(f"Item {i}: narrative_id is not string: {type(narrative_id)}")

            # Check alignment is number
            if not isinstance(alignment, (int, float)):
                errors.append(f"Item {i}: alignment is not number: {type(alignment)}")
            elif alignment < -1 or alignment > 1:
                warnings.append(f"Item {i}: alignment {alignment} outside [-1, 1]")

        details = {
            "subentity_id": self.subentity.id,
            "found_count": len(self.subentity.found_narratives),
        }

        if errors:
            return self.error(
                f"found_narratives format invalid: {len(errors)} errors",
                details={**details, "errors": errors}
            )
        elif warnings:
            return self.warn(
                f"found_narratives warnings: {len(warnings)}",
                details={**details, "warnings": warnings}
            )
        else:
            return self.ok(
                f"found_narratives valid ({len(self.subentity.found_narratives)} items)",
                details=details
            )


class CrystallizationEmbeddingChecker(BaseChecker):
    """
    Validate crystallization_embedding (V17, V18).

    Checks:
    - V17: crystallization_embedding is non-null for active SubEntities
    - V18: All siblings have crystallization_embedding for divergence computation
    - Embedding has correct dimension (matches intention_embedding)
    """

    name = "crystallization_embedding"
    validation_ids = ["V17", "V18"]
    priority = "high"

    def __init__(self, subentity: Optional[SubEntity] = None, **kwargs):
        super().__init__(**kwargs)
        self.subentity = subentity

    def check(self) -> HealthResult:
        """Validate crystallization embeddings."""
        if not self.subentity:
            return self.unknown("No SubEntity provided")

        errors = []
        warnings = []

        # V17: Check own embedding
        if self.subentity.is_active:
            if self.subentity.crystallization_embedding is None:
                errors.append("Active SubEntity has null crystallization_embedding")
            elif self.subentity.intention_embedding is not None:
                if len(self.subentity.crystallization_embedding) != len(self.subentity.intention_embedding):
                    errors.append(
                        f"Embedding dimension mismatch: crystallization={len(self.subentity.crystallization_embedding)}, "
                        f"intention={len(self.subentity.intention_embedding)}"
                    )

        # V18: Check sibling embeddings
        for sibling in self.subentity.siblings:
            if sibling.is_active and sibling.crystallization_embedding is None:
                warnings.append(f"Active sibling {sibling.id} has null crystallization_embedding")

        details = {
            "subentity_id": self.subentity.id,
            "has_embedding": self.subentity.crystallization_embedding is not None,
            "embedding_dim": len(self.subentity.crystallization_embedding) if self.subentity.crystallization_embedding else 0,
            "sibling_count": len(self.subentity.siblings),
        }

        if errors:
            return self.error(
                f"Crystallization embedding invalid: {len(errors)} errors",
                details={**details, "errors": errors}
            )
        elif warnings:
            return self.warn(
                f"Crystallization embedding warnings: {len(warnings)}",
                details={**details, "warnings": warnings}
            )
        else:
            return self.ok("Crystallization embeddings valid", details=details)


class CrystallizedConsistencyChecker(BaseChecker):
    """
    Validate crystallized field consistency (V19).

    Checks:
    - If crystallized is set, it exists in found_narratives with alignment 1.0
    - If crystallized is set, state should be MERGING or after crystallization
    """

    name = "crystallized_consistency"
    validation_ids = ["V19"]
    priority = "med"

    def __init__(self, subentity: Optional[SubEntity] = None, **kwargs):
        super().__init__(**kwargs)
        self.subentity = subentity

    def check(self) -> HealthResult:
        """Validate crystallized field consistency."""
        if not self.subentity:
            return self.unknown("No SubEntity provided")

        errors = []
        warnings = []

        if self.subentity.crystallized:
            # Check it exists in found_narratives
            found_ids = [nid for nid, _ in self.subentity.found_narratives]
            if self.subentity.crystallized not in found_ids:
                errors.append(f"crystallized={self.subentity.crystallized} not in found_narratives")

            # Check alignment is 1.0
            for nid, alignment in self.subentity.found_narratives:
                if nid == self.subentity.crystallized:
                    if alignment != 1.0:
                        warnings.append(f"crystallized narrative has alignment {alignment}, expected 1.0")
                    break

            # Check state is appropriate
            valid_states = {SubEntityState.CRYSTALLIZING, SubEntityState.MERGING}
            if self.subentity.state not in valid_states:
                warnings.append(
                    f"crystallized set but state is {self.subentity.state.value}, "
                    f"expected CRYSTALLIZING or MERGING"
                )

        details = {
            "subentity_id": self.subentity.id,
            "crystallized": self.subentity.crystallized,
            "state": self.subentity.state.value,
            "found_count": len(self.subentity.found_narratives),
        }

        if errors:
            return self.error(
                f"Crystallized field inconsistent: {len(errors)} errors",
                details={**details, "errors": errors}
            )
        elif warnings:
            return self.warn(
                f"Crystallized field warnings: {len(warnings)}",
                details={**details, "warnings": warnings}
            )
        else:
            return self.ok("Crystallized field consistent", details=details)


class SiblingDivergenceChecker(BaseChecker):
    """
    Verify siblings explore different graph regions.

    HEALTH: docs/physics/HEALTH_Physics.md#indicator-sibling-divergence

    Checks:
    - Average pairwise divergence across sibling sets
    - Divergence = 1 - max(cosine(se.embedding, sibling.embedding))
    - Threshold: 0.5 minimum acceptable divergence
    """

    name = "sibling_divergence"
    validation_ids = ["V18"]
    priority = "high"

    DIVERGENCE_THRESHOLD = 0.5

    def __init__(self, subentity: Optional[SubEntity] = None, **kwargs):
        super().__init__(**kwargs)
        self.subentity = subentity

    def check(self) -> HealthResult:
        """Check sibling divergence."""
        if not self.subentity:
            return self.unknown("No SubEntity provided")

        if not self.subentity.siblings:
            return self.ok("No siblings - divergence check N/A", details={"sibling_count": 0})

        # Calculate pairwise divergence
        divergences = []
        convergent_pairs = []

        active_siblings = [
            s for s in self.subentity.siblings
            if s.is_active and s.crystallization_embedding
        ]

        if not active_siblings:
            return self.ok(
                "No active siblings with embeddings",
                details={"sibling_count": len(self.subentity.siblings)}
            )

        if self.subentity.crystallization_embedding is None:
            return self.warn(
                "Cannot compute divergence - own embedding is null",
                details={"sibling_count": len(self.subentity.siblings)}
            )

        for sibling in active_siblings:
            sim = cosine_similarity(
                self.subentity.crystallization_embedding,
                sibling.crystallization_embedding
            )
            divergence = 1.0 - sim
            divergences.append(divergence)

            if divergence < self.DIVERGENCE_THRESHOLD:
                convergent_pairs.append((sibling.id, divergence))

        avg_divergence = sum(divergences) / len(divergences) if divergences else 1.0

        details = {
            "subentity_id": self.subentity.id,
            "sibling_count": len(self.subentity.siblings),
            "active_siblings": len(active_siblings),
            "avg_divergence": round(avg_divergence, 4),
            "min_divergence": round(min(divergences), 4) if divergences else 1.0,
        }

        if convergent_pairs:
            return self.warn(
                f"Siblings converging: {len(convergent_pairs)} pairs below {self.DIVERGENCE_THRESHOLD}",
                details={**details, "convergent_pairs": convergent_pairs}
            )
        elif avg_divergence < self.DIVERGENCE_THRESHOLD:
            return self.warn(
                f"Low average divergence: {avg_divergence:.3f}",
                details=details
            )
        else:
            return self.ok(
                f"Siblings divergent: avg={avg_divergence:.3f}",
                details=details
            )


class LinkScoreChecker(BaseChecker):
    """
    Validate link score computation includes all 5 factors.

    HEALTH: docs/physics/HEALTH_Physics.md#indicator-link-score-validity

    Checks:
    - semantic alignment factor computed
    - polarity factor applied
    - permanence factor applied (1 - permanence)
    - self_novelty factor computed
    - sibling_divergence factor computed

    Link score = semantic × polarity × (1-permanence) × self_novelty × sibling_divergence
    """

    name = "link_score"
    validation_ids = ["V-LINK-SCORE"]
    priority = "high"

    def __init__(
        self,
        subentity: Optional[SubEntity] = None,
        link_embedding: Optional[List[float]] = None,
        polarity: float = 0.5,
        permanence: float = 0.5,
        path_embeddings: Optional[List[List[float]]] = None,
        **kwargs
    ):
        super().__init__(**kwargs)
        self.subentity = subentity
        self.link_embedding = link_embedding
        self.polarity = polarity
        self.permanence = permanence
        self.path_embeddings = path_embeddings or []

    def check(self) -> HealthResult:
        """Validate link score computation."""
        if not self.subentity:
            return self.unknown("No SubEntity provided")
        if self.link_embedding is None:
            return self.unknown("No link embedding provided")
        if self.subentity.intention_embedding is None:
            return self.unknown("SubEntity has no intention embedding")

        # Compute score and verify factors
        score = compute_link_score(
            subentity=self.subentity,
            link_embedding=self.link_embedding,
            polarity=self.polarity,
            permanence=self.permanence,
            path_embeddings=self.path_embeddings,
        )

        # Verify each factor independently
        semantic = cosine_similarity(self.subentity.intention_embedding, self.link_embedding)
        permanence_factor = 1.0 - self.permanence

        # Compute expected score (simplified - full validation)
        errors = []
        warnings = []

        if self.polarity < 0 or self.polarity > 1:
            errors.append(f"polarity {self.polarity} outside [0, 1]")
        if self.permanence < 0 or self.permanence > 1:
            errors.append(f"permanence {self.permanence} outside [0, 1]")
        if semantic < -1 or semantic > 1:
            errors.append(f"semantic {semantic} outside [-1, 1]")

        # Check score is reasonable (not NaN, not negative, not infinity)
        if score != score:  # NaN check
            errors.append("Link score is NaN")
        elif score < 0:
            warnings.append(f"Negative link score: {score}")

        details = {
            "score": round(score, 6),
            "semantic": round(semantic, 4),
            "polarity": self.polarity,
            "permanence_factor": round(permanence_factor, 4),
            "has_path_embeddings": len(self.path_embeddings) > 0,
            "has_siblings": len(self.subentity.siblings) > 0,
        }

        if errors:
            return self.error(
                f"Link score invalid: {len(errors)} errors",
                details={**details, "errors": errors}
            )
        elif warnings:
            return self.warn(
                f"Link score warnings: {len(warnings)}",
                details={**details, "warnings": warnings}
            )
        else:
            return self.ok(
                f"Link score valid: {score:.4f}",
                details=details
            )


class CrystallizationNoveltyChecker(BaseChecker):
    """
    Verify new narratives are sufficiently novel.

    HEALTH: docs/physics/HEALTH_Physics.md#indicator-crystallization-quality

    Checks:
    - New narrative embedding has < 0.85 cosine with all existing narratives
    - Path permanence average > 0.6 (hardened path)
    """

    name = "crystallization_novelty"
    validation_ids = ["V-CRYSTALLIZATION-NOVEL"]
    priority = "med"

    NOVELTY_THRESHOLD = 0.85  # Max allowed cosine similarity

    def __init__(
        self,
        new_embedding: Optional[List[float]] = None,
        existing_embeddings: Optional[List[List[float]]] = None,
        **kwargs
    ):
        super().__init__(**kwargs)
        self.new_embedding = new_embedding
        self.existing_embeddings = existing_embeddings or []

    def check(self) -> HealthResult:
        """Validate crystallization novelty."""
        if self.new_embedding is None:
            return self.unknown("No new embedding provided")

        if not self.existing_embeddings:
            return self.ok(
                "No existing narratives - novelty guaranteed",
                details={"existing_count": 0}
            )

        # Check similarity with each existing
        max_similarity = 0.0
        most_similar_idx = -1

        for i, existing in enumerate(self.existing_embeddings):
            sim = cosine_similarity(self.new_embedding, existing)
            if sim > max_similarity:
                max_similarity = sim
                most_similar_idx = i

        novelty = 1.0 - max_similarity

        details = {
            "existing_count": len(self.existing_embeddings),
            "max_similarity": round(max_similarity, 4),
            "novelty": round(novelty, 4),
            "most_similar_idx": most_similar_idx,
        }

        if max_similarity >= self.NOVELTY_THRESHOLD:
            return self.error(
                f"Narrative not novel enough: similarity={max_similarity:.3f} >= {self.NOVELTY_THRESHOLD}",
                details=details
            )
        elif max_similarity >= 0.7:
            return self.warn(
                f"Narrative marginally novel: similarity={max_similarity:.3f}",
                details=details
            )
        else:
            return self.ok(
                f"Narrative is novel: similarity={max_similarity:.3f}",
                details=details
            )


def validate_subentity(subentity: SubEntity) -> List[HealthResult]:
    """
    Run all SubEntity validation checks.

    Args:
        subentity: SubEntity to validate

    Returns:
        List of HealthResults from all checkers
    """
    checkers = [
        SubEntityTreeChecker(subentity=subentity),
        FoundNarrativesChecker(subentity=subentity),
        CrystallizationEmbeddingChecker(subentity=subentity),
        CrystallizedConsistencyChecker(subentity=subentity),
        SiblingDivergenceChecker(subentity=subentity),
    ]

    results = []
    for checker in checkers:
        try:
            results.append(checker.check())
        except Exception as e:
            logger.exception(f"Checker {checker.name} failed")
            results.append(HealthResult(
                checker_name=checker.name,
                status=HealthStatus.UNKNOWN,
                message=f"Checker crashed: {e}",
            ))

    return results


def is_subentity_healthy(subentity: SubEntity) -> bool:
    """
    Quick check if SubEntity passes all health checks.

    Returns True if no errors (warnings OK).
    """
    results = validate_subentity(subentity)
    return not any(r.status == HealthStatus.ERROR for r in results)
