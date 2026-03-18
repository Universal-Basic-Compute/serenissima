"""
Law 5 — Co-activation Reinforcement (Hebb's Law)

Function: STABILIZE

What activates together strengthens its link. When two nodes are simultaneously
in working memory, their connecting link gains weight proportional to their
co-activation signal. If no link exists, a new ASSOCIATES link is created.

Spec: docs/cognition/l1/ALGORITHM_L1_Physics.md § Law 5
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from itertools import combinations

from ..constants import ACTIVATION_THRESHOLD, LEARNING_RATE
from ..models import CitizenCognitiveState, Link, LinkType, Node


# ---------------------------------------------------------------------------
# Result dataclass
# ---------------------------------------------------------------------------

@dataclass
class ReinforcementResult:
    """Stats returned by a single co-activation reinforcement pass."""
    pairs_reinforced: int = 0
    links_created: int = 0
    total_weight_added: float = 0.0
    pair_details: list[dict[str, object]] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Initial weight for newly-created association links — low so they must be
# reinforced multiple times before they become significant.
_NEW_ASSOCIATE_WEIGHT: float = 0.05


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _find_links_between(
    state: CitizenCognitiveState,
    id_a: str,
    id_b: str,
) -> list[Link]:
    """Return all links connecting *id_a* and *id_b* (either direction)."""
    results: list[Link] = []
    for link in state.links:
        if (link.source_id == id_a and link.target_id == id_b) or \
           (link.source_id == id_b and link.target_id == id_a):
            results.append(link)
    return results


def _coactivation_signal(node_a: Node, node_b: Node) -> float:
    """
    Coactivation strength between two nodes.

    From spec: coactivation(a, b) = min(a.energy, b.energy)
    if both above activation threshold, else 0.

    Using min() makes the signal limited by the weaker partner,
    preventing a single hyper-active node from dominating.
    """
    if node_a.energy < ACTIVATION_THRESHOLD or node_b.energy < ACTIVATION_THRESHOLD:
        return 0.0
    return min(node_a.energy, node_b.energy)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def reinforce_coactivation(state: CitizenCognitiveState) -> ReinforcementResult:
    """
    Reinforce links between co-active working-memory nodes.

    For every pair of nodes currently in WM:
    1. Compute coactivation signal = min(energy_a, energy_b).
    2. Find connecting links and strengthen them:
         link.weight += LEARNING_RATE * coactivation_signal
       (Spec note: modulated by node energies — we use the product
        form from the task spec: LEARNING_RATE * a.energy * b.energy
        for existing links, falling back to the min-based signal
        for the creation gate.)
    3. Increment link.co_activation_count and update timestamp.
    4. If no link exists between the pair, create a new ASSOCIATES link
       with a low initial weight.

    The weight increase is applied as a simple additive delta.
    Diminishing returns are achieved naturally: as weights grow, the
    relative contribution of each delta shrinks. Explicit sublinear
    capping (e.g. sqrt-scaling) can be added as a v2 refinement if
    weight runaway is observed empirically.
    """

    wm_node_ids = state.wm.node_ids
    if len(wm_node_ids) < 2:
        return ReinforcementResult()

    # Resolve WM nodes
    wm_nodes: list[Node] = []
    for nid in wm_node_ids:
        node = state.get_node(nid)
        if node is not None:
            wm_nodes.append(node)

    if len(wm_nodes) < 2:
        return ReinforcementResult()

    result = ReinforcementResult()
    now = time.time()

    for node_a, node_b in combinations(wm_nodes, 2):
        # Gate: both must be above activation threshold
        coact = _coactivation_signal(node_a, node_b)
        if coact <= 0.0:
            continue

        links = _find_links_between(state, node_a.id, node_b.id)

        if links:
            # Strengthen existing links
            # Task spec formula: weight += LEARNING_RATE * a.energy * b.energy
            delta = LEARNING_RATE * node_a.energy * node_b.energy

            for link in links:
                link.weight += delta
                link.co_activation_count += 1
                link.last_co_activated_at = now

            result.pairs_reinforced += 1
            result.total_weight_added += delta * len(links)
            result.pair_details.append({
                "node_a": node_a.id,
                "node_b": node_b.id,
                "delta": delta,
                "links_updated": len(links),
            })
        else:
            # Create a new ASSOCIATES link with low initial weight
            new_link = Link(
                source_id=node_a.id,
                target_id=node_b.id,
                link_type=LinkType.ASSOCIATES,
                weight=_NEW_ASSOCIATE_WEIGHT,
                co_activation_count=1,
                last_co_activated_at=now,
            )
            state.add_link(new_link)

            result.links_created += 1
            result.total_weight_added += _NEW_ASSOCIATE_WEIGHT
            result.pair_details.append({
                "node_a": node_a.id,
                "node_b": node_b.id,
                "delta": _NEW_ASSOCIATE_WEIGHT,
                "links_updated": 0,
                "link_created": True,
            })

    return result
