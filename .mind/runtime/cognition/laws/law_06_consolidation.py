"""
Law 6 — Utility-Gated Consolidation

Function: STABILIZE
Tick: medium (every CONSOLIDATION_INTERVAL ticks)

Useful activation becomes permanent structure. Only activations that produced
a significant limbic shift — positive OR negative — gain weight. Successes
build competence, failures and fears build limits and self-preservation.

Spec: docs/cognition/l1/ALGORITHM_L1_Physics.md § Law 6
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

from ..constants import (
    CONSOLIDATION_ALPHA,
    CONSOLIDATION_BETA,
    CONSOLIDATION_INTERVAL,
    FLASHBULB_THRESHOLD,
)
from ..models import CitizenCognitiveState, LimbicState, Node


# ---------------------------------------------------------------------------
# Result
# ---------------------------------------------------------------------------

@dataclass
class ConsolidationResult:
    """Tracks what Law 6 did during a consolidation pass."""
    tick: int
    nodes_consolidated: list[str] = field(default_factory=list)
    flashbulb_nodes: list[str] = field(default_factory=list)
    total_weight_added: float = 0.0
    total_stability_added: float = 0.0


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _compute_limbic_delta(limbic: LimbicState) -> float:
    """Compute the composite limbic delta used as utility signal.

    limbic_delta = Δsatisfaction + Δachievement - Δfrustration - Δanxiety

    Since we don't track per-node deltas, we use the current instantaneous
    drive/emotion intensities as a proxy for the shift magnitude during the
    consolidation window.  The caller may also supply a pre-computed delta
    via the public API.

    Returns the raw signed delta (caller takes abs for utility U).
    """
    satisfaction = limbic.emotions.get("satisfaction", 0.0)
    achievement = limbic.drives.get("achievement", limbic.drives.get("achievement"))
    frustration = limbic.drives.get("frustration", limbic.drives.get("frustration"))
    anxiety = limbic.emotions.get("anxiety", 0.0)

    ach_intensity = achievement.intensity if achievement else 0.0
    fru_intensity = frustration.intensity if frustration else 0.0

    return satisfaction + ach_intensity - fru_intensity - anxiety


def _coefficient_of_variation(values: list[float]) -> float:
    """Coefficient of variation: std / mean.  Returns 0.0 if insufficient data."""
    if len(values) < 2:
        return 0.0
    mean = sum(values) / len(values)
    if mean <= 0.0:
        return 0.0
    variance = sum((v - mean) ** 2 for v in values) / len(values)
    std = math.sqrt(variance)
    return std / mean


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def consolidate(
    state: CitizenCognitiveState,
    tick: int,
    *,
    limbic_delta: float | None = None,
    recent_activations: dict[str, list[float]] | None = None,
) -> ConsolidationResult:
    """Run Law 6 consolidation over the cognitive graph.

    Parameters
    ----------
    state:
        The full L1 cognitive state (mutated in place).
    tick:
        Current tick number.
    limbic_delta:
        Pre-computed signed limbic delta.  If None, derived from
        ``state.limbic`` current intensities.
    recent_activations:
        Optional mapping ``node_id -> [activation_energy_samples]`` collected
        over the consolidation window.  Used for the regularity / CV
        calculation (Step 3).  When not provided, we fall back to a
        heuristic based on ``node.activation_count`` and ``node.energy``.

    Returns
    -------
    ConsolidationResult with bookkeeping of what changed.
    """
    if tick % CONSOLIDATION_INTERVAL != 0:
        return ConsolidationResult(tick=tick)

    result = ConsolidationResult(tick=tick)

    # ------------------------------------------------------------------
    # Step 1: Utility score (magnitude of limbic shift)
    # ------------------------------------------------------------------
    if limbic_delta is None:
        limbic_delta = _compute_limbic_delta(state.limbic)

    utility = abs(limbic_delta)

    # ------------------------------------------------------------------
    # Iterate over all nodes
    # ------------------------------------------------------------------
    for node in state.nodes.values():
        # Only consolidate nodes that are at least minimally active
        if node.energy <= 0.0 and node.activation_count == 0:
            continue

        # Per-node utility is the global utility scaled by the node's
        # current energy (proxy for how involved this node was).
        # Spec Step 2 uses avg_energy_i * U.  We use current energy as
        # the best available proxy when no history is supplied.
        node_utility = utility

        # ----------------------------------------------------------
        # Check for flashbulb consolidation first
        # Spec: |limbic_delta| > FLASHBULB_THRESHOLD — both extreme
        # positive and extreme negative spikes trigger one-shot learning.
        # ----------------------------------------------------------
        is_flashbulb = utility > FLASHBULB_THRESHOLD

        if is_flashbulb:
            # Triple consolidation — immediate, one-shot learning
            weight_delta = CONSOLIDATION_ALPHA * 3.0 * (1.0 - node.weight)
            stability_delta = CONSOLIDATION_BETA * 3.0

            node.weight += weight_delta
            node.stability = min(node.stability + stability_delta, 1.0)

            result.flashbulb_nodes.append(node.id)
            result.total_weight_added += weight_delta
            result.total_stability_added += stability_delta
            result.nodes_consolidated.append(node.id)
            continue

        # Skip nodes where the utility signal is negligible
        if node_utility < 1e-6:
            continue

        # ----------------------------------------------------------
        # Step 2: Weight update (asymptotic)
        # ----------------------------------------------------------
        # ΔW = α * U * (1 - W)
        weight_delta = CONSOLIDATION_ALPHA * node_utility * (1.0 - node.weight)
        node.weight += weight_delta
        result.total_weight_added += weight_delta

        # ----------------------------------------------------------
        # Step 3: Stability update (regularity-gated)
        # ----------------------------------------------------------
        if recent_activations and node.id in recent_activations:
            samples = recent_activations[node.id]
            cv = _coefficient_of_variation(samples)
        else:
            # Heuristic fallback: treat activation_count as a regularity
            # proxy.  More activations with nonzero energy → lower
            # estimated CV (more regular).  Single or zero activations
            # → CV = 1.0 (maximally erratic).
            if node.activation_count >= 2:
                # Inverse relationship: more activations → lower CV estimate
                cv = 1.0 / node.activation_count
            else:
                cv = 1.0

        regularity = 1.0 / (1.0 + cv)
        stability_delta = CONSOLIDATION_BETA * regularity
        node.stability = min(node.stability + stability_delta, 1.0)
        result.total_stability_added += stability_delta

        result.nodes_consolidated.append(node.id)

    return result
