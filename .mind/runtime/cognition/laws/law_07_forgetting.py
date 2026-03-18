"""
Law 7 — Forgetting / Weakening

Function: STABILIZE (by subtraction)
Tick: slow (every FORGETTING_INTERVAL ticks)

What is never reactivated or used loses weight and availability.
Prevents cognitive clutter, makes room for real learning, distinguishes
durable from transient.

Spec: docs/cognition/l1/ALGORITHM_L1_Physics.md § Law 7
"""

from __future__ import annotations

from dataclasses import dataclass, field

from ..constants import (
    FORGETTING_INTERVAL,
    IDENTITY_DECAY_MULTIPLIER,
    LINK_MIN_WEIGHT,
    LONG_TERM_DECAY,
    MIN_WEIGHT,
)
from ..models import CitizenCognitiveState, Link, NodeType


# ---------------------------------------------------------------------------
# Result
# ---------------------------------------------------------------------------

@dataclass
class ForgettingResult:
    """Tracks what Law 7 did during a forgetting pass."""
    tick: int
    nodes_decayed: list[str] = field(default_factory=list)
    nodes_made_dormant: list[str] = field(default_factory=list)
    links_decayed: int = 0
    links_dissolved: list[tuple[str, str, str]] = field(default_factory=list)
    total_weight_removed: float = 0.0


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def forget(
    state: CitizenCognitiveState,
    tick: int,
) -> ForgettingResult:
    """Run Law 7 forgetting over the cognitive graph.

    Parameters
    ----------
    state:
        The full L1 cognitive state (mutated in place).
    tick:
        Current tick number.

    Returns
    -------
    ForgettingResult with bookkeeping of what changed.
    """
    if tick % FORGETTING_INTERVAL != 0:
        return ForgettingResult(tick=tick)

    result = ForgettingResult(tick=tick)

    # ------------------------------------------------------------------
    # Step 1: Node weight decay
    # ------------------------------------------------------------------
    for node in state.nodes.values():
        decay = LONG_TERM_DECAY

        # Identity protection: values and core narratives decay slower
        is_identity_protected = (
            node.node_type == NodeType.VALUE
            or (node.node_type == NodeType.NARRATIVE and node.self_relevance > 0.7)
        )
        if is_identity_protected:
            decay *= IDENTITY_DECAY_MULTIPLIER  # 0.25 — 4x slower decay

        # High stability further reduces decay
        # Stability in [0, 1] — at stability=1 the node is maximally
        # resistant.  We scale decay by (1 - stability) so a fully
        # stable node effectively does not decay.
        decay *= (1.0 - node.stability)

        weight_before = node.weight
        node.weight *= (1.0 - decay)
        weight_lost = weight_before - node.weight

        if weight_lost > 0.0:
            result.nodes_decayed.append(node.id)
            result.total_weight_removed += weight_lost

    # ------------------------------------------------------------------
    # Step 2: Link weight decay
    # ------------------------------------------------------------------
    for link in state.links:
        link.weight *= (1.0 - LONG_TERM_DECAY)
        result.links_decayed += 1

    # ------------------------------------------------------------------
    # Step 3: Link dissolution
    # ------------------------------------------------------------------
    dissolved: list[Link] = []
    for link in state.links:
        if link.weight < LINK_MIN_WEIGHT and not link.is_structural:
            dissolved.append(link)

    for link in dissolved:
        state.remove_link(link)
        result.links_dissolved.append(
            (link.source_id, link.target_id, link.link_type.value)
        )

    # ------------------------------------------------------------------
    # Step 4: Node dormancy
    # ------------------------------------------------------------------
    for node in state.nodes.values():
        if node.weight < MIN_WEIGHT:
            # Mark dormant: zero energy, but do NOT delete.
            # The node can be reawakened by a future stimulus via Law 1.
            node.energy = 0.0
            result.nodes_made_dormant.append(node.id)

    return result
