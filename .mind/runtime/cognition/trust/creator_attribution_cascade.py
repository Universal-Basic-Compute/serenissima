"""
Creator Attribution Cascade — Phase T3

Spec: docs/trust_mechanics/ALGORITHM_Trust_Mechanics.md section 3

When a user enjoys a thing, trace the CREATED link back to the creator
and propagate trust/energy/co-activation signals along the chain.

Laws involved:
  - Law 2  (Surplus Spill-over): energy propagates thing -> creator
  - Law 5  (Co-activation):      user + creator active -> link reinforced
  - Law 6  (Consolidation):      thing gains weight from positive utility
  - Law 18 (Relational Valence): trust/friction update on links

Multi-hop: if a thing was derived from another thing (via outbound
CREATED-like links), the cascade continues with diminishing attribution
(0.5 per hop, max 3 hops).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from ..models import CitizenCognitiveState, Link, Node
from .trust_update_on_links import update_link_trust, TrustUpdateResult

# --- Constants ---

# Consolidation learning rate (Law 6)
CONSOLIDATION_ALPHA = 0.1

# Energy propagation threshold (Law 2): thing must have energy above
# this value for surplus to spill to creator.
PROPAGATION_THRESHOLD = 0.5

# Co-activation learning rate (Law 5): Hebbian weight increase
COACTIVATION_RATE = 0.03

# Multi-hop cascade settings
MAX_CASCADE_HOPS = 3
CASCADE_DIMINISH = 0.5  # attribution halves each hop


# --- Data Classes ---

@dataclass
class TrustUpdate:
    """Record of a single trust update applied during the cascade."""
    link_source_id: str
    link_target_id: str
    trust_delta: float = 0.0
    friction_delta: float = 0.0
    weight_delta: float = 0.0
    energy_transferred: float = 0.0
    hop: int = 0


@dataclass
class CascadeResult:
    """Full result of a creator attribution cascade run."""
    updates: list[TrustUpdate] = field(default_factory=list)
    thing_weight_delta: float = 0.0
    total_energy_transferred: float = 0.0
    hops_executed: int = 0


# --- Helpers ---

def _find_link(
    state: CitizenCognitiveState,
    source_id: str,
    target_id: str,
) -> Optional[Link]:
    """Find a link between two nodes, or None."""
    for link in state.links:
        if link.source_id == source_id and link.target_id == target_id:
            return link
    return None


def _get_or_create_link(
    state: CitizenCognitiveState,
    source_id: str,
    target_id: str,
) -> Link:
    """Find or create a link between two nodes."""
    from ..models import LinkType

    existing = _find_link(state, source_id, target_id)
    if existing is not None:
        return existing

    new_link = Link(
        source_id=source_id,
        target_id=target_id,
        link_type=LinkType.ASSOCIATES,
        weight=0.1,
        trust=0.0,
    )
    state.add_link(new_link)
    return new_link


def _get_outbound_links(
    state: CitizenCognitiveState,
    node_id: str,
) -> list[Link]:
    """Return all outbound links from a node."""
    return [l for l in state.links if l.source_id == node_id]


def _get_creator_links(
    state: CitizenCognitiveState,
    thing_id: str,
) -> list[Link]:
    """Return outbound links from thing that point to actor/creator nodes.

    We treat any outbound link from a thing node as a potential creator
    link. The caller filters further if needed.
    """
    return _get_outbound_links(state, thing_id)


# --- Core Cascade ---

def attribute_to_creator(
    thing_node: Node,
    limbic_delta: float,
    state: CitizenCognitiveState,
    user_node: Optional[Node] = None,
) -> list[TrustUpdate]:
    """Trace CREATED links from a thing back to its creator(s) and
    propagate trust signals.

    Parameters
    ----------
    thing_node:
        The thing node the user interacted with.
    limbic_delta:
        The limbic delta from the user's interaction. Positive = beneficial.
    state:
        Full cognitive state (mutated in place).
    user_node:
        The user node, if available. Used for co-activation (Law 5).

    Returns
    -------
    List of TrustUpdate records documenting every update applied.
    """
    if limbic_delta <= 0:
        # Only positive interactions trigger the cascade.
        # Negative interactions increase friction via trust_update_on_links
        # but do NOT cascade to creators.
        return []

    result = _cascade_hop(
        thing_node=thing_node,
        limbic_delta=limbic_delta,
        state=state,
        user_node=user_node,
        hop=0,
        visited=set(),
    )
    return result


def _cascade_hop(
    thing_node: Node,
    limbic_delta: float,
    state: CitizenCognitiveState,
    user_node: Optional[Node],
    hop: int,
    visited: set[str],
) -> list[TrustUpdate]:
    """Execute one hop of the cascade, then recurse for derived things."""

    if hop >= MAX_CASCADE_HOPS:
        return []

    if thing_node.id in visited:
        return []
    visited.add(thing_node.id)

    updates: list[TrustUpdate] = []

    # Diminish limbic delta for each hop
    effective_delta = limbic_delta * (CASCADE_DIMINISH ** hop)
    if abs(effective_delta) < 1e-9:
        return updates

    # === STEP 1: Thing Consolidation (Law 6) ===
    # Positive limbic delta means the thing was useful.
    utility = effective_delta
    delta_w = CONSOLIDATION_ALPHA * thing_node.energy * utility * (1.0 - thing_node.weight)
    delta_w = max(0.0, delta_w)  # weight only grows from positive utility
    thing_node.weight = min(1.0, thing_node.weight + delta_w)

    # === STEP 2 & 3: Propagate to creators ===
    outbound = _get_outbound_links(state, thing_node.id)
    if not outbound:
        return updates

    total_outbound_weight = sum(l.weight for l in outbound)
    if total_outbound_weight < 1e-9:
        return updates

    # Surplus energy for propagation (Law 2)
    surplus = max(0.0, thing_node.energy - PROPAGATION_THRESHOLD)

    for link in outbound:
        target = state.get_node(link.target_id)
        if target is None:
            continue

        update = TrustUpdate(
            link_source_id=link.source_id,
            link_target_id=link.target_id,
            hop=hop,
        )

        # Trust update on thing->creator link (Law 18)
        trust_result = update_link_trust(link, effective_delta)
        update.trust_delta = trust_result.trust_delta
        update.friction_delta = trust_result.friction_delta

        # Energy transfer (Law 2) proportional to link weight
        if surplus > 0:
            share = (link.weight / total_outbound_weight) * surplus
            target.energy += share
            thing_node.energy -= share
            update.energy_transferred = share
            # Recalculate surplus after transfer
            surplus = max(0.0, thing_node.energy - PROPAGATION_THRESHOLD)

        # Co-activation with user (Law 5)
        if user_node is not None and target.energy > 0 and user_node.energy > 0:
            user_creator_link = _get_or_create_link(state, user_node.id, target.id)
            delta_link_w = (
                COACTIVATION_RATE
                * user_node.energy
                * target.energy
                * (1.0 - user_creator_link.weight)
            )
            user_creator_link.weight = min(1.0, user_creator_link.weight + delta_link_w)
            update.weight_delta = delta_link_w

        updates.append(update)

        # Recurse for derived things (multi-hop)
        if hop < MAX_CASCADE_HOPS - 1:
            child_updates = _cascade_hop(
                thing_node=target,
                limbic_delta=limbic_delta,
                state=state,
                user_node=user_node,
                hop=hop + 1,
                visited=visited,
            )
            updates.extend(child_updates)

    return updates
