"""
Law 2 — Propagation Through Links (Surplus Spill-Over)

Spec: docs/cognition/l1/ALGORITHM_L1_Physics.md § Law 2

Energy flows from active nodes to their neighbors, but only the SURPLUS
above PROPAGATION_THRESHOLD propagates. Sub-threshold nodes propagate
nothing. After propagation, every source sits at exactly the threshold
(its surplus has been distributed).

Conservation guarantee: total system energy is approximately conserved.
Minor loss to friction is expected and correct — friction converts kinetic
energy to heat (lost from the graph).

Cascade depth: propagation runs ONCE per tick. Deep associations emerge
over multiple ticks, not in a single cascade.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from ..constants import PROPAGATION_SAFETY_CAP, PROPAGATION_THRESHOLD
from ..models import CitizenCognitiveState, Link, Node


@dataclass
class PropagationResult:
    """Stats returned by a single propagation pass."""
    energy_propagated: float = 0.0        # total surplus distributed
    energy_lost_to_friction: float = 0.0  # energy absorbed by link friction
    sources_count: int = 0                # nodes that had surplus to spill
    flows_count: int = 0                  # individual link flows executed
    nodes_capped: int = 0                 # targets that hit PROPAGATION_SAFETY_CAP
    flows: list[FlowRecord] = field(default_factory=list)


@dataclass
class FlowRecord:
    """Debug/audit record for a single link flow."""
    source_id: str
    target_id: str
    outflow: float         # energy leaving source via this link
    received: float        # energy actually received by target (after friction)
    friction_loss: float   # outflow - received


def propagate_energy(state: CitizenCognitiveState) -> PropagationResult:
    """Execute one pass of surplus spill-over propagation.

    Algorithm (per spec):
      1. For each node, compute surplus = max(0, energy - PROPAGATION_THRESHOLD).
      2. For each source with surplus > 0, gather outgoing links.
      3. Compute each link's raw affinity via link.effective_transfer.
      4. Normalize per source so total outflow = surplus.
      5. Target receives outflow * (1 - friction).  Source depletes to threshold.
      6. Cap targets at PROPAGATION_SAFETY_CAP.
    """
    result = PropagationResult()

    # --- Phase 1: Identify sources with surplus ---
    sources: list[tuple[Node, float]] = []
    for node in state.nodes.values():
        surplus = node.energy - PROPAGATION_THRESHOLD
        if surplus > 0.0:
            sources.append((node, surplus))

    if not sources:
        return result

    # Pre-build per-source outgoing link index (avoids repeated O(L) scans).
    outgoing_by_source: dict[str, list[Link]] = {}
    for link in state.links:
        outgoing_by_source.setdefault(link.source_id, []).append(link)

    # --- Phase 2: Compute and apply flows ---
    # Accumulate incoming energy in a buffer so that a node receiving energy
    # in this tick does NOT become a new source within the same tick.
    incoming_buffer: dict[str, float] = {}

    for source_node, surplus in sources:
        outgoing_links = outgoing_by_source.get(source_node.id, [])
        if not outgoing_links:
            continue

        # Step 2 (spec): raw affinity per outgoing link.
        # effective_transfer already combines weight * activation_gain * (1 - friction).
        # For normalization we need the absolute value because gain can be negative
        # (e.g. conflicts_with links carry inhibitory flow).
        raw_affinities: list[tuple[Link, float]] = []
        total_abs_affinity = 0.0
        for link in outgoing_links:
            # Only propagate to targets that actually exist in the graph.
            if link.target_id not in state.nodes:
                continue
            affinity = link.effective_transfer
            raw_affinities.append((link, affinity))
            total_abs_affinity += abs(affinity)

        if total_abs_affinity == 0.0:
            continue

        # Step 3 (spec): normalize per source — total |outflow| = surplus.
        result.sources_count += 1

        for link, affinity in raw_affinities:
            # Normalized share: preserves sign (inhibitory links send negative flow).
            share = affinity / total_abs_affinity
            outflow = surplus * share  # signed: positive = excitatory, negative = inhibitory

            # Energy lost to friction on this link.
            # The effective_transfer already factored out (1 - friction) for the
            # affinity ranking, but the ACTUAL energy received by the target should
            # additionally lose friction from the raw outflow amount. The spec says:
            #   "target.energy += outflow * (1 - link.friction)"
            # We use abs(outflow) for friction accounting and preserve sign for
            # the actual energy delta.
            friction_loss = abs(outflow) * link.friction
            received = outflow * (1.0 - link.friction)

            incoming_buffer[link.target_id] = (
                incoming_buffer.get(link.target_id, 0.0) + received
            )

            result.energy_propagated += abs(outflow)
            result.energy_lost_to_friction += friction_loss
            result.flows_count += 1
            result.flows.append(FlowRecord(
                source_id=source_node.id,
                target_id=link.target_id,
                outflow=outflow,
                received=received,
                friction_loss=friction_loss,
            ))

        # Step 4 (spec): source depletes to threshold.
        source_node.energy = PROPAGATION_THRESHOLD

    # --- Phase 3: Apply incoming energy and enforce safety cap ---
    for target_id, delta in incoming_buffer.items():
        target_node = state.nodes.get(target_id)
        if target_node is None:
            continue

        new_energy = target_node.energy + delta

        # Safety cap: no node exceeds PROPAGATION_SAFETY_CAP after propagation.
        if new_energy > PROPAGATION_SAFETY_CAP:
            new_energy = PROPAGATION_SAFETY_CAP
            result.nodes_capped += 1

        # Floor at 0 — inhibitory flow can push energy negative; clamp.
        if new_energy < 0.0:
            new_energy = 0.0

        target_node.energy = new_energy

    return result
