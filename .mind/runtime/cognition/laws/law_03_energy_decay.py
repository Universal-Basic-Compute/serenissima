"""
Law 3 — Temporal Decay

Spec: docs/cognition/l1/ALGORITHM_L1_Physics.md § Law 3

Energy decays naturally over time, preventing everything from staying
activated and producing temporary attention windows that enable working
memory renewal.

Per-tick rules:
  - Base decay:  node.energy *= (1 - DECAY_RATE)
  - State nodes: node.energy *= (1 - DECAY_RATE * STATE_DECAY_MULTIPLIER)
  - WM nodes:    decay at half the base rate (protected by attention)
  - Recency:     node.recency *= 0.99 per tick (slow fade of freshness)

All pure arithmetic. No LLM. No external dependencies.
"""

from __future__ import annotations

from dataclasses import dataclass

from ..constants import DECAY_RATE, STATE_DECAY_MULTIPLIER
from ..models import CitizenCognitiveState, NodeType

# Recency decay factor per tick — spec says 0.99.
RECENCY_DECAY_FACTOR: float = 0.99

# Working-memory protection factor — nodes in WM decay at half rate.
# Spec: "Nodes in working memory decay slower (protected by attention)."
WM_DECAY_PROTECTION: float = 0.5


@dataclass
class DecayResult:
    """Stats returned by a single decay pass."""
    energy_decayed: float = 0.0        # total energy removed from the system
    nodes_decayed: int = 0             # nodes that had energy to decay
    state_nodes_decayed: int = 0       # state-type nodes (faster decay)
    wm_nodes_decayed: int = 0          # WM-protected nodes (slower decay)
    recency_decayed: int = 0           # nodes whose recency was reduced
    total_energy_before: float = 0.0   # sum of all node energies before decay
    total_energy_after: float = 0.0    # sum of all node energies after decay


def decay_energy(state: CitizenCognitiveState) -> DecayResult:
    """Apply temporal decay to all nodes in the cognitive state.

    Three kinds of decay run simultaneously:

    1. **Energy decay** — exponential drain per tick.
       - Base:  energy *= (1 - DECAY_RATE)
       - State nodes:  energy *= (1 - DECAY_RATE * STATE_DECAY_MULTIPLIER)
       - WM nodes:  energy *= (1 - DECAY_RATE * WM_DECAY_PROTECTION)

       State and WM modifiers stack: a state node that is also in WM uses
       STATE_DECAY_MULTIPLIER * WM_DECAY_PROTECTION as its effective rate
       multiplier — it decays faster than a normal WM node but slower than
       a state node outside WM.

    2. **Recency decay** — gradual freshness fade.
       - recency *= RECENCY_DECAY_FACTOR (0.99) per tick for every node.
    """
    result = DecayResult()

    # Build WM set for O(1) lookup.
    wm_set: set[str] = set(state.wm.node_ids)

    for node in state.nodes.values():
        energy_before = node.energy
        result.total_energy_before += energy_before

        if energy_before > 0.0:
            # Determine effective decay rate multiplier for this node.
            rate_multiplier = 1.0

            is_state = node.node_type == NodeType.STATE
            is_in_wm = node.id in wm_set

            if is_state:
                rate_multiplier *= STATE_DECAY_MULTIPLIER
                result.state_nodes_decayed += 1

            if is_in_wm:
                rate_multiplier *= WM_DECAY_PROTECTION
                result.wm_nodes_decayed += 1

            effective_rate = DECAY_RATE * rate_multiplier
            # Clamp effective_rate to [0, 1] to keep the multiplier meaningful.
            effective_rate = min(effective_rate, 1.0)

            node.energy *= (1.0 - effective_rate)
            result.nodes_decayed += 1

        # Energy can never go negative (defensive — should already be >= 0).
        if node.energy < 0.0:
            node.energy = 0.0

        result.total_energy_after += node.energy

        # Recency decay — always applied, even to zero-energy nodes.
        if node.recency > 0.0:
            node.recency *= RECENCY_DECAY_FACTOR
            # Floor recency at a tiny epsilon to avoid floating-point dust.
            if node.recency < 1e-12:
                node.recency = 0.0
            result.recency_decayed += 1

    result.energy_decayed = result.total_energy_before - result.total_energy_after
    return result
