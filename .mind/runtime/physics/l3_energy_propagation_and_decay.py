"""
L3 Energy Propagation and Decay

Implements the L3 energy model (ALG-6):
- Energy injection from L1 citizen actions into L3 universe graph
- Law 2 surplus spill-over propagation (no Law 8 compatibility filter at L3)
- Law 3 energy and recency decay (slower rates than L1)

Energy is conserved during propagation: surplus is distributed proportional
to outbound link weights, and the source node is depleted to threshold.

DOCS: docs/universe/ALGORITHM_Universe_Graph.md (ALG-6)
"""

import math
from dataclasses import dataclass
from typing import Dict, List, Optional

from runtime.universe.constants_l3_physics import (
    L3_PROPAGATION_THRESHOLD,
    L3_DECAY_RATE,
    L3_RECENCY_DECAY,
    L3_ENERGY_SPLIT_SPACE,
    L3_ENERGY_SPLIT_ACTOR,
    L3_ENERGY_SPLIT_RELATED,
)


@dataclass
class L3Node:
    """Minimal node representation for L3 physics operations.

    Not a database model. Used as an in-memory working struct
    during physics ticks. Caller is responsible for persisting changes.
    """
    id: str
    energy: float = 0.0
    recency: float = 1.0
    weight: float = 1.0
    node_type: str = "moment"


@dataclass
class L3Link:
    """Minimal link representation for L3 physics operations."""
    node_a: str
    node_b: str
    weight: float = 1.0
    energy: float = 0.0
    polarity: float = 1.0  # polarity[0] in the algorithm


@dataclass
class EnergyInjectionResult:
    """Result of an L3 energy injection."""
    moment_id: str
    space_energy_added: float
    actor_energy_added: float
    context_energy_added: float
    total_injected: float


def l3_inject_energy(
    moment: L3Node,
    space_link: L3Link,
    actor_link: L3Link,
    related_links: List[L3Link],
    energy_amount: float,
) -> EnergyInjectionResult:
    """ALG-6: Inject energy from L1 action into L3.

    Energy splits:
    - 60% to the Space (activity in context)
    - 30% to the Actor (actor was active)
    - 10% to linked Things/Narratives (contextual activation)

    Args:
        moment: The moment node receiving the energy.
        space_link: Link from moment to space.
        actor_link: Link from moment to actor.
        related_links: Links from moment to related nodes (things, narratives).
        energy_amount: Total energy to inject.

    Returns:
        EnergyInjectionResult with breakdown.

    Raises:
        ValueError: If energy_amount is negative.
    """
    if energy_amount < 0:
        raise ValueError("Energy amount must be non-negative")

    # Inject into moment
    moment.energy += energy_amount

    # Split to space
    space_share = energy_amount * L3_ENERGY_SPLIT_SPACE
    space_link.energy += space_share

    # Split to actor
    actor_share = energy_amount * L3_ENERGY_SPLIT_ACTOR
    actor_link.energy += actor_share

    # Split to related nodes (divide equally)
    context_share = energy_amount * L3_ENERGY_SPLIT_RELATED
    if related_links:
        per_link = context_share / len(related_links)
        for link in related_links:
            link.energy += per_link
    else:
        # If no related links, context share stays in moment
        context_share = 0.0

    return EnergyInjectionResult(
        moment_id=moment.id,
        space_energy_added=space_share,
        actor_energy_added=actor_share,
        context_energy_added=context_share,
        total_injected=energy_amount,
    )


def l3_propagate(
    node: L3Node,
    outbound_links: List[L3Link],
    neighbor_nodes: Dict[str, L3Node],
) -> float:
    """ALG-6 Law 2: Surplus spill-over propagation.

    If node.energy > L3_PROPAGATION_THRESHOLD, distribute surplus
    proportional to outbound link weights. No compatibility filter
    (Law 8 is off at L3). No activation_gain modulation (frozen at L3).

    Energy conservation: total energy distributed equals surplus.
    Node energy is reduced to exactly the threshold.

    Args:
        node: Source node with energy to propagate.
        outbound_links: Links from this node to neighbors.
        neighbor_nodes: Mapping of node_id -> L3Node for all neighbors.

    Returns:
        Total energy propagated (surplus).
    """
    if node.energy <= L3_PROPAGATION_THRESHOLD:
        return 0.0

    if not outbound_links:
        return 0.0

    surplus = node.energy - L3_PROPAGATION_THRESHOLD

    total_weight = sum(link.weight for link in outbound_links)
    if total_weight <= 0:
        return 0.0

    total_propagated = 0.0

    for link in outbound_links:
        share = surplus * (link.weight / total_weight) * link.polarity

        neighbor = neighbor_nodes.get(link.node_b)
        if neighbor is not None:
            neighbor.energy += share
            link.energy += share * 0.1  # Link remembers flow
            total_propagated += share

    # Deplete source to threshold
    node.energy = L3_PROPAGATION_THRESHOLD

    return total_propagated


def l3_decay(node: L3Node) -> None:
    """ALG-6 Law 3: Energy and recency decay.

    node.energy *= (1 - L3_DECAY_RATE)
    node.recency *= (1 - L3_RECENCY_DECAY)

    Both rates are slower than L1 (0.01 vs 0.02 for energy, 0.005 vs L1's rate for recency).

    Args:
        node: Node to apply decay to. Modified in place.
    """
    node.energy *= (1.0 - L3_DECAY_RATE)
    node.recency *= (1.0 - L3_RECENCY_DECAY)

    # Clamp to avoid floating point drift below zero
    if node.energy < 0.0:
        node.energy = 0.0
    if node.recency < 0.0:
        node.recency = 0.0


def l3_decay_batch(nodes: List[L3Node]) -> float:
    """Apply L3 decay to a batch of nodes.

    Args:
        nodes: List of nodes to decay. Modified in place.

    Returns:
        Total energy lost across all nodes.
    """
    total_lost = 0.0
    for node in nodes:
        energy_before = node.energy
        l3_decay(node)
        total_lost += energy_before - node.energy
    return total_lost
