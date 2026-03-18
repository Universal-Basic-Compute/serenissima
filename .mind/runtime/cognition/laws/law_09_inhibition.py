"""
Law 9 — Local Inhibition / Suppression

Function: SELECT (conflict resolution)

Incompatible nodes suppress each other. When two nodes connected by a
CONTRADICTS (or CONFLICTS_WITH) link are both active, the weaker one
loses energy proportional to the stronger one's activation.

This produces local coherence: instead of twelve modes of thought
screaming simultaneously, conflicting perspectives resolve toward
a dominant one.

Spec: docs/cognition/l1/ALGORITHM_L1_Physics.md § Law 9
"""

from __future__ import annotations

from dataclasses import dataclass, field

from ..constants import ACTIVATION_THRESHOLD, INHIBITION_STRENGTH
from ..models import CitizenCognitiveState, LinkType, Node


# ---------------------------------------------------------------------------
# Result dataclass
# ---------------------------------------------------------------------------

@dataclass
class InhibitionResult:
    """Stats returned by a single inhibition pass."""
    pairs_inhibited: int = 0
    total_energy_removed: float = 0.0
    inhibition_details: list[dict[str, object]] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Constants — link types that carry inhibitory semantics
# ---------------------------------------------------------------------------

_INHIBITORY_LINK_TYPES: frozenset[LinkType] = frozenset({
    LinkType.CONTRADICTS,
    LinkType.CONFLICTS_WITH,
})


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def apply_inhibition(state: CitizenCognitiveState) -> InhibitionResult:
    """
    Apply local inhibition between conflicting co-active nodes.

    For each CONTRADICTS or CONFLICTS_WITH link:
    1. Check that both endpoints are active (energy > ACTIVATION_THRESHOLD).
    2. Identify the stronger and weaker node (by energy).
    3. The weaker node loses energy:
         weaker.energy -= INHIBITION_STRENGTH * stronger.energy * link.weight
       The link weight is included so that stronger conflict links produce
       proportionally stronger suppression.
    4. Energy is floored at 0.0 — it cannot go negative.

    If both nodes have exactly equal energy, the target (link.target_id)
    is treated as the weaker one. This breaks symmetry deterministically.
    """

    result = InhibitionResult()

    for link in state.links:
        if link.link_type not in _INHIBITORY_LINK_TYPES:
            continue

        source = state.get_node(link.source_id)
        target = state.get_node(link.target_id)

        if source is None or target is None:
            continue

        # Both must be active for inhibition to apply
        if source.energy < ACTIVATION_THRESHOLD or target.energy < ACTIVATION_THRESHOLD:
            continue

        # Determine stronger and weaker by energy
        if source.energy >= target.energy:
            stronger = source
            weaker = target
        else:
            stronger = target
            weaker = source

        # Compute suppression: INHIBITION_STRENGTH * stronger.energy
        # scaled by link weight for proportionality
        suppression = INHIBITION_STRENGTH * stronger.energy * link.weight
        energy_before = weaker.energy
        weaker.energy = max(0.0, weaker.energy - suppression)
        actual_loss = energy_before - weaker.energy

        if actual_loss > 0.0:
            result.pairs_inhibited += 1
            result.total_energy_removed += actual_loss
            result.inhibition_details.append({
                "stronger": stronger.id,
                "weaker": weaker.id,
                "link_type": link.link_type.value,
                "link_weight": link.weight,
                "suppression": suppression,
                "actual_loss": actual_loss,
                "weaker_energy_after": weaker.energy,
            })

    return result
