"""
Link Models — Generic Schema Types

The universal link type that connects nodes.
Based on schema.yaml v2.1

v2.1 CHANGES:
    - Removed Plutchik emotion axes (replaced by limbic system: valence, arousal, drives)
    - Single link type: `linked` — all semantics in properties
    - Semantic axes: hierarchy, polarity, permanence
    - synthesis: natural language description of relationship

MIGRATION (old type → v2.1):
    contains → hierarchy: -0.7, synthesis: "contains"
    expresses → hierarchy: 0.3, synthesis: "expresses"
    about → hierarchy: 0.2, synthesis: "is about"
    relates → hierarchy: 0.0, synthesis: "{verb}"
    supports → hierarchy: 0.3, synthesis: "supports"
    contradicts → hierarchy: 0.3, synthesis: "contradicts"

TESTS:
    engine/tests/test_models.py::TestActorNarrativeLink
    engine/tests/test_models.py::TestNarrativeNarrativeLink

SEE ALSO:
    docs/schema/schema.yaml
"""

import time
from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, Field

from .base import BeliefSource, PathDifficulty


def _now_s() -> int:
    """Current Unix timestamp in seconds."""
    return int(time.time())


# =============================================================================
# LINK BASE (v1.8.1)
# =============================================================================

class LinkBase(BaseModel):
    """Unified link model for schema v1.8.1.

    Single link type 'linked' — all semantics encoded in properties:
        - node_a, node_b: bidirectional endpoints
        - weight, energy: physics state
        - polarity: [a→b, b→a] directional flow strength
        - hierarchy: -1 (contains) to +1 (elaborates)
        - permanence: 0 (speculative) to 1 (definitive)
        - synthesis: computed natural language description (regenerated on drift)
        - embedding: from embed(synthesis)

    Nature Input Flow:
        1. Agent provides 'nature' string (e.g., "suddenly proves, with admiration")
        2. link_vocab.parse_nature() → floats (hierarchy, polarity, permanence)
        3. synthesis regenerated from floats when embedding drifts

    Hot vs Cold:
        link.energy × link.weight > COLD_THRESHOLD → HOT → in physics
        link.energy × link.weight ≤ COLD_THRESHOLD → COLD → excluded
    """
    # === Identity ===
    node_a: str = Field(description="First node ID")
    node_b: str = Field(description="Second node ID")

    # === Physics State ===
    weight: float = Field(
        default=1.0, ge=0.0,
        description="Importance + accumulated depth"
    )
    energy: float = Field(
        default=0.0, ge=0.0,
        description="Current activation"
    )

    # === Semantic Axes ===
    polarity: List[float] = Field(
        default=[0.5, 0.5],
        description="[a→b, b→a] flow strength, each in [0, 1]"
    )
    hierarchy: float = Field(
        default=0.0, ge=-1.0, le=1.0,
        description="-1 = contains, +1 = elaborates"
    )
    permanence: float = Field(
        default=0.5, ge=0.0, le=1.0,
        description="0 = speculative, 1 = definitive"
    )

    # === Semantics ===
    synthesis: str = Field(
        default="is linked to",
        description="Natural language description (regenerated from floats on drift)"
    )
    embedding: Optional[List[float]] = Field(
        default=None,
        exclude=True,
        description="Semantic embedding from embed(synthesis)"
    )

    # === Temporal (auto-managed) ===
    created_at_s: int = Field(
        default_factory=_now_s,
        description="Unix timestamp of creation (auto-generated)"
    )
    updated_at_s: int = Field(
        default_factory=_now_s,
        description="Unix timestamp of last modification (auto-updated)"
    )
    last_traversed_at_s: Optional[int] = Field(
        default=None,
        description="Unix timestamp of last traversal (auto-updated)"
    )

    @property
    def heat_score(self) -> float:
        """Calculate heat score for top-N filtering.

        v1.2: score = energy × weight
        """
        return self.energy * self.weight

    def is_hot(self, threshold: float = 0.01) -> bool:
        """Check if link is hot (in physics) vs cold (excluded).

        v1.2: hot if energy × weight > COLD_THRESHOLD
        """
        return self.heat_score > threshold

    def embeddable_text(self) -> str:
        """Return synthesis for embedding (v1.8).

        Synthesis is the human-readable natural language description
        of the link relationship. Embedding is computed as:
            normalize(node_a.embedding + embed(synthesis) + node_b.embedding)
        """
        return self.synthesis

    def compute_embedding(
        self,
        node_a_embedding: List[float],
        node_b_embedding: List[float],
        embed_fn,
    ) -> List[float]:
        """
        Compute link embedding from node embeddings and synthesis.

        Formula: normalize(node_a.embedding + embed(synthesis) + node_b.embedding)

        Args:
            node_a_embedding: Embedding vector of source node
            node_b_embedding: Embedding vector of target node
            embed_fn: Function that takes text and returns embedding vector

        Returns:
            Normalized embedding vector
        """
        import numpy as np

        # Get synthesis embedding
        synthesis_embedding = embed_fn(self.synthesis)

        # Sum all three embeddings
        a = np.array(node_a_embedding)
        b = np.array(node_b_embedding)
        s = np.array(synthesis_embedding)

        combined = a + s + b

        # Normalize to unit vector
        norm = np.linalg.norm(combined)
        if norm > 0:
            combined = combined / norm

        return combined.tolist()

    def touch(self) -> None:
        """Update updated_at_s to current time."""
        self.updated_at_s = _now_s()

    def mark_traversed(self) -> None:
        """Mark as traversed by energy flow."""
        self.last_traversed_at_s = _now_s()


class ActorNarrative(BaseModel):
    """
    ACTOR_NARRATIVE - What an actor knows, believes, doubts, hides, or spreads.

    This link IS how actors know things. There is no "knowledge" stat.
    Aldric knows about the betrayal because he has a link to that narrative
    with heard=1.0 and believes=0.9.

    History: Every memory is mediated through a BELIEVES link. Actors can be
    wrong, confidence varies, sources can be traced.
    """
    # Link endpoints
    actor_id: str
    narrative_id: str

    # Knowledge (0-1) - how much do they know/believe?
    heard: float = Field(default=0.0, ge=0.0, le=1.0, description="Has encountered this story")
    believes: float = Field(default=0.0, ge=0.0, le=1.0, description="Holds as true")
    doubts: float = Field(default=0.0, ge=0.0, le=1.0, description="Actively uncertain")
    denies: float = Field(default=0.0, ge=0.0, le=1.0, description="Rejects as false")

    # Action (0-1) - what are they doing with this knowledge?
    hides: float = Field(default=0.0, ge=0.0, le=1.0, description="Knows but conceals")
    spreads: float = Field(default=0.0, ge=0.0, le=1.0, description="Actively promoting")

    # Origin
    originated: float = Field(default=0.0, ge=0.0, le=1.0, description="Created this narrative")

    # Metadata - how did they learn?
    source: BeliefSource = BeliefSource.NONE
    from_whom: str = Field(default="", description="Who told them")
    when: Optional[datetime] = None
    where: Optional[str] = Field(default=None, description="Place ID where they learned this")


class NarrativeNarrative(BaseModel):
    """
    NARRATIVE_NARRATIVE - How stories relate: contradict, support, elaborate, subsume, supersede.

    These links create story structure. Contradicting narratives create drama.
    Supporting narratives create belief clusters. Superseding narratives
    let the world evolve.
    """
    # Link endpoints
    source_narrative_id: str
    target_narrative_id: str

    # Relationship strengths (0-1)
    contradicts: float = Field(default=0.0, ge=0.0, le=1.0, description="Cannot both be true")
    supports: float = Field(default=0.0, ge=0.0, le=1.0, description="Reinforce each other")
    elaborates: float = Field(default=0.0, ge=0.0, le=1.0, description="Adds detail")
    subsumes: float = Field(default=0.0, ge=0.0, le=1.0, description="Specific case of")
    supersedes: float = Field(default=0.0, ge=0.0, le=1.0, description="Replaces - old fades")


class ActorSpace(BaseModel):
    """
    ACTOR_SPACE - Where an actor physically is (ground truth).

    This is GROUND TRUTH, not belief. An actor IS at a space,
    regardless of what anyone believes.
    """
    # Link endpoints
    actor_id: str
    space_id: str

    # Physical state
    present: float = Field(default=0.0, ge=0.0, le=1.0, description="1=here, 0=not here")
    visible: float = Field(default=1.0, ge=0.0, le=1.0, description="0=hiding, 1=visible")


class ActorThing(BaseModel):
    """
    ACTOR_THING - What an actor physically carries (ground truth).

    Ground truth. They HAVE it or they don't.
    Separate from ownership narratives (who SHOULD have it).
    """
    # Link endpoints
    actor_id: str
    thing_id: str

    # Physical state
    carries: float = Field(default=0.0, ge=0.0, le=1.0, description="1=has it, 0=doesn't")
    carries_hidden: float = Field(default=0.0, ge=0.0, le=1.0, description="1=secretly, 0=openly")


class ThingSpace(BaseModel):
    """
    THING_SPACE - Where an uncarried thing physically is (ground truth).

    Where things ARE, not where people think they are.
    """
    # Link endpoints
    thing_id: str
    space_id: str

    # Physical state
    located: float = Field(default=0.0, ge=0.0, le=1.0, description="1=here, 0=not here")
    hidden: float = Field(default=0.0, ge=0.0, le=1.0, description="1=concealed, 0=visible")
    specific_location: str = Field(default="", description="Where exactly")


class SpaceSpace(BaseModel):
    """
    SPACE_SPACE - How locations connect: contains, path, borders (ground truth).

    Geography determines travel time, which affects proximity,
    which affects how much actors matter to the player.
    """
    # Link endpoints
    source_space_id: str
    target_space_id: str

    # Spatial relationships
    contains: float = Field(default=0.0, ge=0.0, le=1.0, description="This space is inside that")
    path: float = Field(default=0.0, ge=0.0, le=1.0, description="Can travel between")
    path_distance: str = Field(default="", description="How far: '2 days', '4 hours'")
    path_difficulty: PathDifficulty = PathDifficulty.MODERATE
    borders: float = Field(default=0.0, ge=0.0, le=1.0, description="Share a border")

    def travel_days(self) -> float:
        """Parse path_distance into days for proximity calculation."""
        if not self.path_distance:
            return 1.0

        dist = self.path_distance.lower()
        if 'adjacent' in dist or 'same' in dist:
            return 0.0
        elif 'hour' in dist:
            # Extract number of hours
            import re
            match = re.search(r'(\d+)', dist)
            if match:
                return float(match.group(1)) / 24.0
            return 0.1
        elif 'day' in dist:
            import re
            match = re.search(r'(\d+)', dist)
            if match:
                return float(match.group(1))
            return 1.0
        else:
            return 1.0
