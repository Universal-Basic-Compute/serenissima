"""
L3 Weight Consolidation (Law 6)

Implements Law 6 (Weighted Consolidation) at L3 scale.
At L1, utility is gated by limbic significance. At L3, the universe
has no limbic system, so utility = structural significance:

- Service/Thing nodes: normalized_usage_count (how often invoked)
- Actor-Actor links: co_activation_frequency (how often both active together)
- Space links: presence_intensity (aggregate actor hours)

Weight change: dW = ALPHA * avg_energy * U * (1 - weight)

This module is critical for Force 2 (Metabolic Economy):
- Formula 1 (Progressive Pricing) uses U_S (service utility weight)
- Formula 4 (Batch Settlement) uses weight(thing_used)

DOCS: docs/universe/ALGORITHM_Universe_Graph.md (ALG-6, Law 6)
"""

import math
from dataclasses import dataclass, field
from typing import Optional

from runtime.universe.constants_l3_physics import L3_CONSOLIDATION_ALPHA


@dataclass
class L3ConsolidationLink:
    """Link data needed for weight consolidation.

    Tracks both the current link state and usage statistics
    for structural utility computation.
    """
    node_a: str
    node_b: str
    weight: float = 0.0
    avg_energy: float = 0.0

    # Usage statistics for structural utility
    usage_count: int = 0            # For service/thing links
    co_activation_count: int = 0    # For actor-actor links
    presence_hours: float = 0.0     # For space links

    # Link endpoint types for utility dispatch
    node_a_type: str = ""
    node_b_type: str = ""


@dataclass
class ConsolidationResult:
    """Result of a single consolidation step."""
    link_id: tuple  # (node_a, node_b)
    weight_before: float
    weight_after: float
    delta_weight: float
    structural_utility: float


def compute_structural_utility(link: L3ConsolidationLink) -> float:
    """Compute structural utility for L3 consolidation.

    At L1: U = limbic_significance (subjective value).
    At L3: U = structural_utility (objective usage).

    Dispatch by link endpoint types:
    - Service/Thing nodes: normalized_usage_count
    - Actor-Actor links: co_activation_frequency
    - Space links: presence_intensity

    The result is clamped to [0, 1] to keep dW bounded.

    Args:
        link: Link with usage statistics.

    Returns:
        Structural utility in [0, 1].
    """
    types = {link.node_a_type.lower(), link.node_b_type.lower()}

    # Service or Thing endpoints -> usage-based utility
    if "thing" in types or "service" in types:
        return _normalized_usage(link.usage_count)

    # Actor-Actor links -> co-activation frequency
    if link.node_a_type.lower() == "actor" and link.node_b_type.lower() == "actor":
        return _normalized_co_activation(link.co_activation_count)

    # Space links -> presence intensity
    if "space" in types:
        return _normalized_presence(link.presence_hours)

    # Default: use whatever statistics are available
    if link.usage_count > 0:
        return _normalized_usage(link.usage_count)
    if link.co_activation_count > 0:
        return _normalized_co_activation(link.co_activation_count)
    if link.presence_hours > 0:
        return _normalized_presence(link.presence_hours)

    return 0.0


def _normalized_usage(count: int) -> float:
    """Normalize usage count to [0, 1] using logarithmic scaling.

    log(1 + count) / log(1 + 100) gives:
    - 0 uses -> 0.0
    - 10 uses -> ~0.50
    - 50 uses -> ~0.85
    - 100 uses -> 1.0
    - >100 clamped to 1.0
    """
    if count <= 0:
        return 0.0
    return min(1.0, math.log(1 + count) / math.log(1 + 100))


def _normalized_co_activation(count: int) -> float:
    """Normalize co-activation count to [0, 1].

    Same logarithmic scaling as usage count, but with a
    lower reference (50 co-activations = 1.0).
    """
    if count <= 0:
        return 0.0
    return min(1.0, math.log(1 + count) / math.log(1 + 50))


def _normalized_presence(hours: float) -> float:
    """Normalize presence hours to [0, 1].

    1 hour -> ~0.15, 10 hours -> ~0.58, 100 hours -> 1.0.
    """
    if hours <= 0:
        return 0.0
    return min(1.0, math.log(1 + hours) / math.log(1 + 100))


def l3_consolidate(
    link: L3ConsolidationLink,
    alpha: float = L3_CONSOLIDATION_ALPHA,
) -> ConsolidationResult:
    """ALG-6 Law 6: Weight consolidation at L3.

    dW = ALPHA * avg_energy * U * (1 - weight)

    Weight is bounded [0, 1] by the (1 - weight) term, which ensures
    diminishing returns as weight approaches 1.0.

    Args:
        link: Link to consolidate. Modified in place.
        alpha: Learning rate (default from L3 constants).

    Returns:
        ConsolidationResult with before/after weights and utility.
    """
    weight_before = link.weight

    U = compute_structural_utility(link)
    dW = alpha * link.avg_energy * U * (1.0 - link.weight)

    # Weight must be non-negative
    link.weight = max(0.0, min(1.0, link.weight + dW))

    return ConsolidationResult(
        link_id=(link.node_a, link.node_b),
        weight_before=weight_before,
        weight_after=link.weight,
        delta_weight=link.weight - weight_before,
        structural_utility=U,
    )


def l3_consolidate_batch(
    links: list[L3ConsolidationLink],
    alpha: float = L3_CONSOLIDATION_ALPHA,
) -> list[ConsolidationResult]:
    """Consolidate a batch of links.

    Args:
        links: Links to consolidate. Modified in place.
        alpha: Learning rate.

    Returns:
        List of ConsolidationResults.
    """
    return [l3_consolidate(link, alpha) for link in links]
