"""
SubEntity — Temporary Consciousness Traversal (v2.1)

A SubEntity is a temporary consciousness fragment that traverses the graph
with query (what to find) and intention (why finding it).

Schema: docs/schema/schema.yaml v2.0
Patterns: docs/physics/subentity/PATTERNS_SubEntity.md (P1-P11)
Algorithm: docs/physics/subentity/ALGORITHM_SubEntity.md

v2.1 CHANGES (Semantic Intention):
- Removed IntentionType enum (SUMMARIZE, VERIFY, etc.) - was rigid and keyword-based
- Removed INTENTION_WEIGHTS dict - intention weight is now fixed constant (0.25)
- Intention meaning is now fully semantic via intention_embedding
- Simpler, more flexible: any intention string, embedded semantically

v2.0 CHANGES (Awareness Depth + Breadth):
- awareness_depth: [up, down] - unbounded accumulator tracking hierarchy traversals
- progress_history: list of deltas toward intention (for fatigue detection)
- Fatigue-based stopping: stop when progress stagnates for 5 steps
- Children crystallize systematically (unless 90%+ match found)
- NO propagation from children to parent — graph is source of truth
- See: docs/physics/mechanisms/MECHANISMS_Awareness_Depth_Breadth.md

v1.9 CHANGES (Energy Injection):
- SubEntity injects energy at EACH traversal step (no decay)
- Injection = criticality × STATE_MULTIPLIER[state]
- Permanence converts energy to weight: weight_gain = injection × permanence
- Creates "heat trails" that persist after exploration
- New ABSORBING state for content processing

v1.8 CHANGES (Query vs Intention):
- query + query_embedding: WHAT we're searching for (semantic matching)
- intention + intention_embedding: WHY we're searching (traversal coloring)
- Link score combines query and intention alignment

v1.7.2 DESIGN DECISIONS:
- D1: sibling_ids are strings, resolved via ExplorationContext (lazy refs)
- D3: found_narratives is dict[str, float] with max(alignment) merge
- D5: Branch threshold is len(outgoing) >= 2

STATE MACHINE:
    SEEKING      -> exploring, choosing next link by score
    BRANCHING    -> multiple valid paths, running children on Moments
    ABSORBING    -> processing content at current position (v1.9)
    RESONATING   -> arrived at narrative, measuring alignment
    REFLECTING   -> backpropagating colors through path
    CRYSTALLIZING -> creating new narrative from traversal
    MERGING      -> integrating child results, returning to parent

KEY FORMULAS (v2.1):
    injection = criticality × STATE_MULTIPLIER[state]
    weight_gain = injection × permanence (energy → weight conversion)
    alignment = 0.75 × query_alignment + 0.25 × intention_alignment  (INTENTION_WEIGHT=0.25)
    link_score = base × alignment × self_novelty × sibling_divergence × emotional_factor
    crystallization_embedding = 0.4×query + 0.25×intention + 0.3×position + 0.2×found + 0.1×path
    criticality = (1 - satisfaction) × (depth / (depth + 1))

STATE MULTIPLIERS:
    SEEKING: 0.5       # Low: exploring, not yet committed
    ABSORBING: 1.0     # Normal: absorbing content
    RESONATING: 2.0    # High: found aligned narrative
    CRYSTALLIZING: 1.5 # Medium-high: creating new narrative

TESTS: engine/tests/test_subentity.py
"""

from __future__ import annotations
from dataclasses import dataclass, field
from enum import Enum
from typing import List, Dict, Optional, Tuple, TYPE_CHECKING
import uuid

if TYPE_CHECKING:
    from numpy import ndarray


class ExplorationContext:
    """
    Shared context for SubEntity exploration.

    Maintains registry of all SubEntities for lazy ref resolution.
    This is the single source of truth for SubEntity lookups.
    """

    def __init__(self):
        self._registry: Dict[str, 'SubEntity'] = {}

    def register(self, se: 'SubEntity') -> None:
        """Register a SubEntity in the context."""
        self._registry[se.id] = se
        se._context = self

    def get(self, se_id: str) -> Optional['SubEntity']:
        """Get SubEntity by ID."""
        return self._registry.get(se_id)

    def exists(self, se_id: str) -> bool:
        """Check if SubEntity exists in context."""
        return se_id in self._registry

    def unregister(self, se_id: str) -> None:
        """Remove SubEntity from context."""
        self._registry.pop(se_id, None)

    def all_active(self) -> List['SubEntity']:
        """Get all active (non-terminal) SubEntities."""
        return [se for se in self._registry.values() if se.is_active]


# =============================================================================
# INTENTION WEIGHT (v2.1)
# =============================================================================
# Fixed weight for intention vs query in link scoring.
# The intention is expressed semantically via intention_embedding, not via enum.
# v2.0 had IntentionType enum with 5 types and fixed weights - removed.
# Now: single constant, embedding carries the semantic meaning.
#
# Formula in compute_link_score:
#   alignment = (1 - INTENTION_WEIGHT) × query_alignment + INTENTION_WEIGHT × intention_alignment
#
# Value 0.25 = balanced (query matters 75%, intention matters 25%)
INTENTION_WEIGHT = 0.25


class SubEntityState(str, Enum):
    """SubEntity state machine states.

    Transitions:
        SEEKING:
            - position.node_type == 'narrative' -> RESONATING
            - no link with score > 0 -> terminate, signal parent
            - on Moment AND multiple links with ratio < 2:1 -> BRANCHING
            - else -> advance to best link, stay SEEKING

        BRANCHING:
            - run children, each starts SEEKING
            - parent waits for all children
            - when all children done -> MERGING

        ABSORBING:
            - processing content at current position
            - always -> SEEKING or RESONATING

        RESONATING:
            - always -> REFLECTING

        REFLECTING:
            - alignment strong -> signal parent done (MERGING)
            - alignment weak + criticality > 0.8 -> CRYSTALLIZING
            - alignment mid -> SEEKING

        CRYSTALLIZING:
            - creates narrative, backprops -> MERGING

        MERGING:
            - integrates child results -> signal parent done
    """
    SEEKING = "seeking"
    BRANCHING = "branching"
    ABSORBING = "absorbing"  # v1.9: absorbing content at node
    RESONATING = "resonating"
    REFLECTING = "reflecting"
    CRYSTALLIZING = "crystallizing"
    MERGING = "merging"


# =============================================================================
# STATE MULTIPLIERS (v1.9)
# =============================================================================
# Energy injection strength varies by state. SubEntity injects energy at each
# traversal step with no decay, creating "heat trails" along paths.
#
# Formula: injection = criticality × STATE_MULTIPLIER[state]
#
# Rationale:
#   SEEKING (0.5): Exploring cautiously, low commitment
#   ABSORBING (1.0): Baseline energy for content absorption
#   RESONATING (2.0): Strong alignment found, amplify signal
#   CRYSTALLIZING (1.5): Creating narrative, elevated but focused

STATE_MULTIPLIER = {
    SubEntityState.SEEKING: 0.5,
    SubEntityState.BRANCHING: 0.5,       # Same as seeking (exploration phase)
    SubEntityState.ABSORBING: 1.0,
    SubEntityState.RESONATING: 2.0,
    SubEntityState.REFLECTING: 0.5,      # Same as seeking (review phase)
    SubEntityState.CRYSTALLIZING: 1.5,
    SubEntityState.MERGING: 0.0,         # Terminal, no injection
}


# Valid state transitions
VALID_TRANSITIONS = {
    SubEntityState.SEEKING: {
        SubEntityState.BRANCHING,
        SubEntityState.ABSORBING,  # v1.9: can transition to absorbing
        SubEntityState.RESONATING,
        SubEntityState.REFLECTING,
        SubEntityState.SEEKING,  # stay seeking after traversal
    },
    SubEntityState.BRANCHING: {
        SubEntityState.MERGING,
        SubEntityState.REFLECTING,
    },
    SubEntityState.ABSORBING: {  # v1.9: absorbing can continue seeking or crystallize
        SubEntityState.SEEKING,
        SubEntityState.RESONATING,
        SubEntityState.REFLECTING,
        SubEntityState.CRYSTALLIZING,  # v1.9: if alignment > 0.7 AND novelty > 0.7
    },
    SubEntityState.RESONATING: {
        SubEntityState.REFLECTING,
        SubEntityState.SEEKING,  # continue after weak resonance
    },
    SubEntityState.REFLECTING: {
        SubEntityState.SEEKING,
        SubEntityState.CRYSTALLIZING,
        SubEntityState.MERGING,
    },
    SubEntityState.CRYSTALLIZING: {
        SubEntityState.SEEKING,  # v1.9: return to seeking after crystallization
        SubEntityState.MERGING,
    },
    SubEntityState.MERGING: set(),  # terminal state
}


class SubEntityTransitionError(Exception):
    """Raised when an invalid state transition is attempted."""
    pass


@dataclass
class SubEntity:
    """
    Temporary consciousness fragment that traverses the graph.

    NOT persistent — exists only during exploration.
    Creates Narratives when crystallizing on novel patterns.

    v1.7.2 Design Decisions:
        - sibling_ids/children_ids are string arrays (lazy refs via ExplorationContext)
        - found_narratives is dict[str, float] with max(alignment) on merge
        - siblings/children properties resolve IDs at access time

    Attributes:
        id: Unique identifier for this SubEntity
        actor_id: The actor who runed this exploration
        origin_moment: Moment that triggered this exploration
        parent_id: Parent SubEntity ID (null for root)
        sibling_ids: IDs of other children of same parent
        children_ids: IDs of runed SubEntities from branching

        state: Current state in the state machine
        position: Current node ID
        path: Traversal history as [(link_id, node_id), ...]
        depth: Current traversal depth

        intention: Text description of what we're looking for
        intention_embedding: Vector embedding of intention

        found_narratives: {narrative_id: max_alignment} dict
        crystallization_embedding: What this SubEntity would become if crystallized
        satisfaction: How much of the intention has been found [0, 1]
        crystallized: Narrative ID if this SubEntity created one

    """

    # === Identity ===
    id: str = field(default_factory=lambda: f"se_{uuid.uuid4().hex[:8]}")
    actor_id: str = ""
    origin_moment: str = ""

    # === Tree structure (lazy refs via IDs) ===
    parent_id: Optional[str] = None
    sibling_ids: List[str] = field(default_factory=list)
    children_ids: List[str] = field(default_factory=list)
    _context: Optional[ExplorationContext] = field(default=None, repr=False)

    # === State ===
    state: SubEntityState = SubEntityState.SEEKING
    position: str = ""
    run_position: str = ""  # v1.9: where the SubEntity was created
    path: List[Tuple[str, str]] = field(default_factory=list)  # [(link_id, node_id), ...]
    depth: int = 0

    # === Awareness Depth + Breadth (v2.0) ===
    # awareness_depth[0] = UP (toward abstraction, hierarchy > 0.2)
    # awareness_depth[1] = DOWN (toward details, hierarchy < -0.2)
    # Unbounded accumulator, not compressed to [0,1]
    awareness_depth: List[float] = field(default_factory=lambda: [0.0, 0.0])
    # progress_history = list of deltas toward intention per step
    # Used for fatigue detection (stagnation = stop)
    progress_history: List[float] = field(default_factory=list)

    # === Query + Intention (v2.1) ===
    # Query: WHAT we're searching for (semantic matching)
    query: str = ""
    query_embedding: Optional[List[float]] = None
    # Intention: WHY we're searching (semantic via embedding, not enum)
    intention: str = ""
    intention_embedding: Optional[List[float]] = None

    # === Findings (evolve during traversal) ===
    found_narratives: Dict[str, float] = field(default_factory=dict)  # {id: max_alignment}
    crystallization_embedding: Optional[List[float]] = None
    satisfaction: float = 0.0
    crystallized: Optional[str] = None  # narrative_id if created one

    def __post_init__(self):
        """Initialize crystallization_embedding from query if provided (v1.8)."""
        if self.crystallization_embedding is None and self.query_embedding is not None:
            # Start with query embedding (what we're searching for)
            self.crystallization_embedding = list(self.query_embedding)

    @property
    def intention_weight(self) -> float:
        """Get intention weight for link scoring (v2.1 - fixed constant)."""
        return INTENTION_WEIGHT

    # === Lazy ref properties ===

    @property
    def parent(self) -> Optional['SubEntity']:
        """Resolve parent_id to SubEntity via context."""
        if self.parent_id and self._context:
            return self._context.get(self.parent_id)
        return None

    @property
    def siblings(self) -> List['SubEntity']:
        """Resolve sibling_ids to SubEntities via context."""
        if not self._context:
            return []
        return [
            self._context.get(sid)
            for sid in self.sibling_ids
            if self._context.exists(sid)
        ]

    @property
    def children(self) -> List['SubEntity']:
        """Resolve children_ids to SubEntities via context."""
        if not self._context:
            return []
        return [
            self._context.get(cid)
            for cid in self.children_ids
            if self._context.exists(cid)
        ]

    # === State Machine ===

    def can_transition_to(self, new_state: SubEntityState) -> bool:
        """Check if transition to new_state is valid."""
        return new_state in VALID_TRANSITIONS.get(self.state, set())

    def transition_to(self, new_state: SubEntityState) -> None:
        """
        Transition to a new state.

        Raises:
            SubEntityTransitionError: If transition is invalid
        """
        if not self.can_transition_to(new_state):
            raise SubEntityTransitionError(
                f"Invalid transition: {self.state.value} -> {new_state.value}. "
                f"Valid targets: {[s.value for s in VALID_TRANSITIONS.get(self.state, set())]}"
            )
        self.state = new_state

    @property
    def is_terminal(self) -> bool:
        """Check if SubEntity is in a terminal state (MERGING)."""
        return self.state == SubEntityState.MERGING

    @property
    def is_active(self) -> bool:
        """Check if SubEntity is still actively exploring."""
        return self.state in {
            SubEntityState.SEEKING,
            SubEntityState.BRANCHING,
            SubEntityState.ABSORBING,  # v1.9
            SubEntityState.RESONATING,
            SubEntityState.REFLECTING,
            SubEntityState.CRYSTALLIZING,
        }

    @property
    def run_node(self) -> str:
        """Node ID where this SubEntity was created (v1.9)."""
        return self.run_position or self.position

    @property
    def focus_node(self) -> str:
        """Node ID currently being focused on (v1.9)."""
        return self.position

    # === Criticality ===

    @property
    def criticality(self) -> float:
        """
        Compute criticality: how desperately does this SubEntity need to find something?

        Formula: (1 - satisfaction) × (depth / (depth + 1))

        High criticality:
            - Accepts weaker alignments
            - Branches more aggressively
            - More likely to crystallize

        Returns:
            Criticality in [0, 1]
        """
        depth_factor = self.depth / (self.depth + 1) if self.depth > 0 else 0.0
        return (1.0 - self.satisfaction) * depth_factor

    # === Energy Injection (v1.9) ===

    def compute_energy_injection(self) -> float:
        """
        Compute energy to inject at this traversal step (v1.9).

        Formula: injection = criticality × STATE_MULTIPLIER[state]

        No decay during traversal — permanence converts energy to weight.
        This creates "heat trails" that persist after exploration.

        Returns:
            Energy injection amount (>= 0)
        """
        multiplier = STATE_MULTIPLIER.get(self.state, 0.0)
        return self.criticality * multiplier

    def inject_energy_to_node(self, node: Dict) -> Tuple[float, float]:
        """
        Inject energy into the focus node and convert to weight via permanence (v1.9).

        The injected energy doesn't decay but converts to weight based on
        the node's permanence. Higher permanence = more weight gain.

        Formula:
            energy_injection = criticality × STATE_MULTIPLIER[state]
            weight_gain = energy_injection × node.permanence
            node.energy += energy_injection
            node.weight += weight_gain

        Args:
            node: The node dict to inject energy into (modified in place)

        Returns:
            Tuple of (energy_injected, weight_gained)
        """
        injection = self.compute_energy_injection()
        if injection <= 0:
            return (0.0, 0.0)

        # Get node's permanence (default 0.0 if not set)
        permanence = node.get('permanence', 0.0)

        # Inject energy (additive, no decay)
        current_energy = node.get('energy', 0.0)
        node['energy'] = current_energy + injection

        # Convert portion to weight based on permanence
        weight_gain = injection * permanence
        current_weight = node.get('weight', 0.0)
        node['weight'] = current_weight + weight_gain

        return (injection, weight_gain)

    def inject_energy_to_link(self, link: Dict) -> Tuple[float, float]:
        """
        Inject energy into a traversed link and convert to weight via permanence (v1.9).

        Same formula as node injection but applied to links.

        Args:
            link: The link dict to inject energy into (modified in place)

        Returns:
            Tuple of (energy_injected, weight_gained)
        """
        injection = self.compute_energy_injection()
        if injection <= 0:
            return (0.0, 0.0)

        permanence = link.get('permanence', 0.0)

        current_energy = link.get('energy', 0.0)
        link['energy'] = current_energy + injection

        weight_gain = injection * permanence
        current_weight = link.get('weight', 0.0)
        link['weight'] = current_weight + weight_gain

        return (injection, weight_gain)

    # === Awareness Depth + Breadth (v2.0) ===

    def update_depth(self, link_hierarchy: float) -> None:
        """
        Update awareness depth based on link hierarchy (v2.0).

        Called after each link traversal in SEEKING.

        - hierarchy > 0.2: UP (toward abstraction)
        - hierarchy < -0.2: DOWN (toward details)
        - |hierarchy| <= 0.2: PEER (no depth change)

        Depth is unbounded accumulator, not compressed to [0, 1].

        Args:
            link_hierarchy: The hierarchy value of the traversed link [-1, 1]
        """
        if link_hierarchy > 0.2:
            # UP: toward abstraction
            self.awareness_depth[0] += link_hierarchy
        elif link_hierarchy < -0.2:
            # DOWN: toward details
            self.awareness_depth[1] += abs(link_hierarchy)
        # PEER links (|hierarchy| <= 0.2) don't affect depth

    def update_progress(self) -> None:
        """
        Track progress toward intention (v2.0).

        Called after updating crystallization_embedding.
        Measures how close crystallization is to intention and stores delta.

        Progress interpretation:
        - delta > 0: Getting closer to intention
        - delta < 0: Moving away from intention
        - delta ≈ 0: Stagnating
        """
        if self.crystallization_embedding is None or self.intention_embedding is None:
            return

        current = cosine_similarity(self.crystallization_embedding, self.intention_embedding)

        if self.progress_history:
            previous = self.progress_history[-1]
            delta = current - previous
        else:
            delta = current  # First step

        self.progress_history.append(delta)

    def is_fatigued(self, window: int = 5, threshold: float = 0.05) -> bool:
        """
        Check if exploration should stop due to fatigue (v2.0).

        Fatigue = no meaningful progress for N consecutive steps.
        Used as stopping condition instead of arbitrary threshold.

        Args:
            window: Number of recent steps to check (default: 5)
            threshold: Maximum delta to be considered stagnant (default: 0.05)

        Returns:
            True if all recent deltas are below threshold (fatigued)
        """
        if len(self.progress_history) < window:
            return False

        recent = self.progress_history[-window:]
        return all(abs(d) < threshold for d in recent)

    # === Crystallization Embedding ===

    def update_crystallization_embedding(
        self,
        position_embedding: Optional[List[float]] = None,
        found_embeddings: Optional[Dict[str, Tuple[List[float], float]]] = None,
        path_embeddings: Optional[List[Tuple[List[float], float]]] = None,
    ) -> None:
        """
        Update crystallization_embedding at EACH step (v1.8).

        Formula (query + intention):
            crystallization_embedding = weighted_sum([
                (0.4, query_embedding),          # What we searched for
                (intent_weight, intention_embedding),  # Why we searched
                (0.3, position.embedding),
                (0.2, mean(n.embedding for n in found_narratives, weighted by alignment)),
                (0.1, mean(link.embedding for link in path))
            ])

        This enables sibling divergence — siblings compare embeddings to spread.

        Args:
            position_embedding: Embedding of current position node
            found_embeddings: {narrative_id: (embedding, alignment)} for found narratives
            path_embeddings: [(embedding, polarity), ...] for path links
        """
        if self.query_embedding is None:
            return

        dim = len(self.query_embedding)
        result = [0.0] * dim
        total_weight = 0.0

        # 1. Query (weight 0.4) - what we searched for
        w_query = 0.4
        for i in range(dim):
            result[i] += w_query * self.query_embedding[i]
        total_weight += w_query

        # 2. Intention (weight based on intention_type) - why we searched
        if self.intention_embedding and len(self.intention_embedding) == dim:
            w_intent = self.intention_weight
            for i in range(dim):
                result[i] += w_intent * self.intention_embedding[i]
            total_weight += w_intent

        # 3. Position (weight 0.3)
        if position_embedding and len(position_embedding) == dim:
            w_position = 0.3
            for i in range(dim):
                result[i] += w_position * position_embedding[i]
            total_weight += w_position

        # 4. Found narratives (weight 0.2, weighted by alignment from dict)
        if found_embeddings:
            w_found = 0.2
            found_sum = [0.0] * dim
            found_weight = 0.0
            for narr_id, (emb, alignment) in found_embeddings.items():
                if emb and len(emb) == dim:
                    abs_align = abs(alignment)
                    for i in range(dim):
                        found_sum[i] += emb[i] * abs_align
                    found_weight += abs_align

            if found_weight > 0:
                for i in range(dim):
                    result[i] += w_found * (found_sum[i] / found_weight)
                total_weight += w_found

        # 5. Path (weight 0.1, weighted by polarity)
        if path_embeddings:
            w_path = 0.1
            path_sum = [0.0] * dim
            path_weight = 0.0
            for emb, polarity in path_embeddings:
                if emb and len(emb) == dim:
                    for i in range(dim):
                        path_sum[i] += emb[i] * polarity
                    path_weight += polarity

            if path_weight > 0:
                for i in range(dim):
                    result[i] += w_path * (path_sum[i] / path_weight)
                total_weight += w_path

        # Normalize
        if total_weight > 0:
            result = [x / total_weight for x in result]

        # Final L2 normalization
        norm = sum(x * x for x in result) ** 0.5
        if norm > 0:
            result = [x / norm for x in result]

        self.crystallization_embedding = result

    # === Tree Operations ===

    def run_child(
        self,
        target_position: str,
        via_link: str,
        context: Optional[ExplorationContext] = None,
    ) -> SubEntity:
        """
        Run a child SubEntity for branching.

        v1.7.2: Uses parent_id and sibling_ids (lazy refs), not object references.
        Must register with context for lazy resolution.

        Args:
            target_position: Node ID where child starts
            via_link: Link ID traversed to reach child
            context: ExplorationContext for registration (uses self._context if None)

        Returns:
            New child SubEntity (registered with context)
        """
        ctx = context or self._context

        child = SubEntity(
            actor_id=self.actor_id,
            origin_moment=self.origin_moment,
            parent_id=self.id,  # v1.7.2: ID not object
            sibling_ids=[],  # Will be set after all children runed
            state=SubEntityState.SEEKING,
            position=target_position,
            path=self.path + [(via_link, target_position)],
            depth=self.depth + 1,
            # v2.1: Query + Intention (both inherited, semantic via embedding)
            query=self.query,
            query_embedding=list(self.query_embedding) if self.query_embedding else None,
            intention=self.intention,
            intention_embedding=list(self.intention_embedding) if self.intention_embedding else None,
            crystallization_embedding=list(self.crystallization_embedding) if self.crystallization_embedding else None,
        )

        # Register child in context for lazy ref resolution
        if ctx:
            ctx.register(child)

        # Track child ID (not object)
        self.children_ids.append(child.id)
        return child

    def set_sibling_references(self) -> None:
        """
        Set sibling_ids for all children after running.

        v1.7.2: Sets sibling_ids (string array), resolved via context at access time.
        Must be called after all children are runed via run_child().
        """
        for child in self.children:
            child.sibling_ids = [cid for cid in self.children_ids if cid != child.id]

    def merge_child_results(self) -> List['SubEntity']:
        """
        Merge results from all children after they complete (v2.0).

        v2.0 CHANGE: NO PROPAGATION from children to parent.
        - Children crystallize systematically to graph (unless 90%+ match found)
        - Parent.found_narratives is UNCHANGED
        - Graph is the source of truth, not parent memory

        Returns:
            List of children that should crystallize (use should_child_crystallize)

        v1.7.2 (REMOVED):
            - found_narratives: NO LONGER merged from children
            - satisfaction: NO LONGER aggregated from children
        """
        # v2.0: Children that should crystallize (not yet done)
        children_to_crystallize = []
        for child in self.children:
            # v2.0: Check if child should crystallize (unless found 90%+ match)
            if should_child_crystallize(child) and not child.crystallized:
                children_to_crystallize.append(child)

        # v2.0: NO propagation of found_narratives or satisfaction
        # Parent continues with its own findings only
        # Graph persists child knowledge via crystallization

        return children_to_crystallize

    # === Satisfaction ===

    def update_satisfaction(self, alignment: float, narrative_weight: float = 1.0) -> None:
        """
        Update satisfaction after resonating with a narrative.

        v1.7.2: found_narratives is dict[str, float], sum values for total.

        Formula:
            boost = alignment × weight / (sum_found_alignments + 1)
            satisfaction = min(1.0, satisfaction + boost)

        Args:
            alignment: Alignment with the narrative [-1, 1]
            narrative_weight: Weight of the narrative
        """
        if alignment <= 0:
            return

        # v1.7.2: found_narratives is dict, sum values directly
        total_alignment = sum(abs(a) for a in self.found_narratives.values()) + 1.0
        boost = alignment * narrative_weight / total_alignment
        self.satisfaction = min(1.0, self.satisfaction + boost)

    # === Serialization ===

    def to_dict(self) -> dict:
        """Serialize to dictionary (for debugging/logging)."""
        return {
            "id": self.id,
            "actor_id": self.actor_id,
            "origin_moment": self.origin_moment,
            "parent_id": self.parent_id,  # v1.7.2: already an ID
            "sibling_ids": self.sibling_ids,  # v1.7.2: already ID array
            "children_ids": self.children_ids,  # v1.7.2: already ID array
            "state": self.state.value,
            "position": self.position,
            "path": self.path,
            "depth": self.depth,
            # v2.0: Awareness Depth + Breadth
            "awareness_depth": self.awareness_depth,  # [up, down]
            "progress_history": self.progress_history,
            "is_fatigued": self.is_fatigued(),
            # v2.1: Query + Intention (semantic via embedding)
            "query": self.query,
            "intention": self.intention,
            "found_narratives": self.found_narratives,  # v1.7.2: dict[str, float]
            "satisfaction": self.satisfaction,
            "criticality": self.criticality,
            "crystallized": self.crystallized,
            "emotions": self.get_emotions(),
        }


# =============================================================================
# LINK SCORING (v1.6.1)
# =============================================================================

def cosine_similarity(a: Optional[List[float]], b: Optional[List[float]]) -> float:
    """
    Compute cosine similarity between two vectors.

    Returns 0.0 if either vector is None or empty.
    """
    if not a or not b:
        return 0.0
    if len(a) != len(b):
        return 0.0

    dot = sum(x * y for x, y in zip(a, b))
    norm_a = sum(x * x for x in a) ** 0.5
    norm_b = sum(x * x for x in b) ** 0.5

    if norm_a == 0 or norm_b == 0:
        return 0.0

    return dot / (norm_a * norm_b)


def compute_self_novelty(
    subentity: SubEntity,
    link_embedding: Optional[List[float]],
    path_embeddings: List[List[float]],
) -> float:
    """
    Compute self-novelty: avoid links similar to what we've already traversed.

    Formula: 1 - max(cos(link.embedding, p.embedding) for p in path)

    Args:
        subentity: The SubEntity computing the score
        link_embedding: Embedding of the candidate link
        path_embeddings: Embeddings of links already in the path

    Returns:
        Self-novelty in [0, 1], where 1 = completely novel
    """
    if not link_embedding or not path_embeddings:
        return 1.0

    max_sim = max(
        cosine_similarity(link_embedding, p_emb)
        for p_emb in path_embeddings
        if p_emb
    )

    return max(0.0, 1.0 - max_sim)


def compute_sibling_divergence(
    subentity: SubEntity,
    link_embedding: Optional[List[float]],
) -> float:
    """
    Compute sibling divergence: avoid paths siblings are exploring.

    Formula: 1 - max(cos(link.embedding, s.crystallization_embedding) for s in siblings)

    Args:
        subentity: The SubEntity computing the score
        link_embedding: Embedding of the candidate link

    Returns:
        Sibling divergence in [0, 1], where 1 = maximally divergent
    """
    if not link_embedding or not subentity.siblings:
        return 1.0

    active_siblings = [
        s for s in subentity.siblings
        if s.is_active and s.crystallization_embedding
    ]

    if not active_siblings:
        return 1.0

    max_sim = max(
        cosine_similarity(link_embedding, s.crystallization_embedding)
        for s in active_siblings
    )

    return max(0.0, 1.0 - max_sim)


def compute_link_score(
    subentity: SubEntity,
    link_embedding: Optional[List[float]],
    polarity: float,
    permanence: float,
    path_embeddings: List[List[float]],
) -> float:
    """
    Compute link score for traversal decision (v1.8).

    Formula (query + intention):
        query_alignment = cosine(query_embedding, link_embedding)
        intention_alignment = cosine(intention_embedding, link_embedding)
        alignment = (1 - intent_weight) × query_alignment + intent_weight × intention_alignment
        link_score = alignment × polarity × (1 - permanence) × self_novelty × sibling_divergence

    Args:
        subentity: The SubEntity evaluating the link
        link_embedding: Embedding of the candidate link
        polarity: Polarity in the traversal direction [0, 1]
        permanence: How permanent the link is [0, 1]
        path_embeddings: Embeddings of links already in the path

    Returns:
        Link score (higher = better candidate)
    """
    # Query alignment: does this link lead to what we're searching for?
    query_alignment = cosine_similarity(subentity.query_embedding, link_embedding)

    # Intention alignment: does this link serve our purpose?
    intention_alignment = cosine_similarity(subentity.intention_embedding, link_embedding)

    # Combined alignment (v1.8)
    intent_weight = subentity.intention_weight
    alignment = (1 - intent_weight) * query_alignment + intent_weight * intention_alignment

    # Self-novelty: avoid backtracking
    self_novelty = compute_self_novelty(subentity, link_embedding, path_embeddings)

    # Sibling divergence: spread exploration
    sibling_divergence = compute_sibling_divergence(subentity, link_embedding)

    # Combine factors
    # polarity and permanence are already in [0, 1]
    # (1 - permanence) means less permanent links are more explorable
    score = alignment * polarity * (1 - permanence) * self_novelty * sibling_divergence

    return score


# =============================================================================
# CHILD CRYSTALLIZATION (v2.0)
# =============================================================================

def should_child_crystallize(child: SubEntity) -> bool:
    """
    Determine if a child SubEntity should crystallize on merge (v2.0).

    Children crystallize systematically, EXCEPT when they found a high-match narrative.
    This ensures knowledge persists to the graph (source of truth) rather than being
    lost in parent memory.

    Rule:
    - If child found a 90%+ match narrative: DON'T crystallize (already exists)
    - Otherwise: CRYSTALLIZE (persist the exploration as new knowledge)

    Args:
        child: The child SubEntity to check

    Returns:
        True if child should crystallize, False if it found what it was looking for
    """
    if child.found_narratives:
        best_match = max(child.found_narratives.values())
        if best_match >= 0.9:
            return False  # Found it, no need to create new

    return True  # Crystallize our journey


# =============================================================================
# FACTORY FUNCTIONS
# =============================================================================

def create_subentity(
    actor_id: str,
    origin_moment: str,
    query: str,
    query_embedding: Optional[List[float]] = None,
    intention: str = "",
    intention_embedding: Optional[List[float]] = None,
    start_position: Optional[str] = None,
    context: Optional[ExplorationContext] = None,
) -> SubEntity:
    """
    Create a new root SubEntity for exploration (v2.1).

    v2.1: Removed IntentionType enum - intention is semantic via embedding.
    v1.8: Separate query (what to find) from intention (why finding).
    v1.7.2: Optionally registers with ExplorationContext for lazy ref resolution.

    Args:
        actor_id: The actor running this exploration
        origin_moment: The moment that triggered exploration
        query: Text of what to search for
        query_embedding: Vector embedding of query
        intention: Text of why searching (optional, defaults to query if empty)
        intention_embedding: Vector embedding of intention (optional, defaults to query_embedding)
        start_position: Starting node ID (defaults to actor_id)
        context: ExplorationContext for registration (optional)

    Returns:
        New SubEntity ready for exploration (registered if context provided)
    """
    # Default intention to query if not provided
    actual_intention = intention or query
    actual_intention_embedding = intention_embedding or query_embedding

    se = SubEntity(
        actor_id=actor_id,
        origin_moment=origin_moment,
        position=start_position or actor_id,
        query=query,
        query_embedding=query_embedding,
        intention=actual_intention,
        intention_embedding=actual_intention_embedding,
        crystallization_embedding=list(query_embedding) if query_embedding else None,
    )

    if context:
        context.register(se)

    return se
