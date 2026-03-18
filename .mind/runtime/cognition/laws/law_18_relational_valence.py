"""
Law 18 — Relational Valence

Spec: docs/cognition/l1/ALGORITHM_L1_Physics.md section Law 18
Extended by: docs/trust_mechanics/ALGORITHM_Trust_Mechanics.md sections 1-2

Links between co-active nodes are colored affectively based on interaction
outcomes (limbic deltas). This law evolves 6 link dimensions at runtime:

  - trust:      reliability of connection, grows with positive utility
  - affinity:   attraction strength, grows with positive interactions
  - aversion:   repulsion strength, grows with negative interactions
  - friction:   resistance to energy flow, grows on repeated failures
  - valence:    net emotional charge = affinity - aversion
  - ambivalence: tension from simultaneous high affinity AND aversion

Value = Limbic Delta (NOT activity volume):
  - Commit that causes fewer errors = positive delta = value
  - Message that raises recipient's valence = value
  - Feature usage that decreases frustration = value

Trust mechanics integration (Phase T1/T2):
  When a limbic_delta is available (from DriveSnapshot comparison),
  trust/friction updates use the dedicated trust module with asymptotic
  growth: delta_trust = beta * LD * (1-T). When limbic_delta is not
  available, the energy-based heuristic is used as before.

All positive updates use asymptotic tempering:
  delta = alpha * energy * utility * (1 - current_value)
This prevents any dimension from exceeding 1.0 naturally and makes
gains progressively harder as values approach their ceiling.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Optional

from ..constants import (
    VALENCE_ALPHA,
    VALENCE_FRICTION_DECAY,
    VALENCE_FRICTION_GROWTH,
)
from ..models import CitizenCognitiveState, Link


# ---------------------------------------------------------------------------
# Result
# ---------------------------------------------------------------------------


@dataclass
class RelationalValenceResult:
    """Output of a single Law 18 pass."""

    links_updated: int = 0
    trust_deltas: dict[tuple[str, str], float] = field(default_factory=dict)
    affinity_deltas: dict[tuple[str, str], float] = field(default_factory=dict)
    aversion_deltas: dict[tuple[str, str], float] = field(default_factory=dict)
    friction_deltas: dict[tuple[str, str], float] = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Core update logic for a single link
# ---------------------------------------------------------------------------


def _asymptotic_increase(
    current: float,
    alpha: float,
    energy: float,
    utility: float,
) -> float:
    """Compute asymptotically-tempered positive delta.

    Formula: delta = alpha * energy * utility * (1 - current)

    As current approaches 1.0, the delta shrinks toward zero.
    Returns the delta (not the new value).
    """
    headroom = max(0.0, 1.0 - current)
    return alpha * energy * utility * headroom


def update_link_valence(
    link: Link,
    limbic_delta: float,
    avg_energy: float,
    *,
    alpha: float = VALENCE_ALPHA,
) -> dict[str, float]:
    """Update relational dimensions on a single link based on interaction outcome.

    Parameters
    ----------
    link:
        The link to update (mutated in place).
    limbic_delta:
        Signed interaction outcome. Positive = beneficial, negative = harmful.
        Magnitude represents strength of the signal.
    avg_energy:
        Average energy of the two endpoint nodes. Scales the update.
    alpha:
        Learning rate for asymptotic updates.

    Returns
    -------
    Dict of dimension name -> delta applied, for diagnostics.
    """
    deltas: dict[str, float] = {}
    utility = abs(limbic_delta)

    if utility < 1e-9:
        return deltas

    if limbic_delta > 0:
        # --- Positive interaction ---

        # Trust increases asymptotically
        trust_delta = _asymptotic_increase(link.trust, alpha, avg_energy, utility)
        link.trust = min(1.0, link.trust + trust_delta)
        deltas["trust"] = trust_delta

        # Affinity increases asymptotically
        affinity_delta = _asymptotic_increase(
            link.affinity, alpha, avg_energy, utility
        )
        link.affinity = min(1.0, link.affinity + affinity_delta)
        deltas["affinity"] = affinity_delta

        # Friction decreases on successful interactions
        friction_delta = min(link.friction, VALENCE_FRICTION_DECAY * utility)
        link.friction = max(0.0, link.friction - friction_delta)
        deltas["friction"] = -friction_delta

    else:
        # --- Negative interaction ---

        # Aversion increases asymptotically
        aversion_delta = _asymptotic_increase(
            link.aversion, alpha, avg_energy, utility
        )
        link.aversion = min(1.0, link.aversion + aversion_delta)
        deltas["aversion"] = aversion_delta

        # Friction increases on failed interactions
        friction_delta = _asymptotic_increase(
            link.friction, VALENCE_FRICTION_GROWTH, avg_energy, utility
        )
        link.friction = min(1.0, link.friction + friction_delta)
        deltas["friction"] = friction_delta

    # --- Derived dimensions (always recomputed) ---

    # Valence = net emotional charge
    old_valence = link.valence
    link.valence = link.affinity - link.aversion
    # Clamp to [-1, 1]
    link.valence = max(-1.0, min(1.0, link.valence))
    deltas["valence"] = link.valence - old_valence

    # Ambivalence = high when BOTH affinity AND aversion are high
    old_ambivalence = link.ambivalence
    link.ambivalence = min(link.affinity, link.aversion)
    deltas["ambivalence"] = link.ambivalence - old_ambivalence

    # Recency resets to 1.0 on any interaction
    link.recency = 1.0

    # Track co-activation
    link.co_activation_count += 1
    link.last_co_activated_at = time.time()

    return deltas


# ---------------------------------------------------------------------------
# Public API — operates on the full cognitive state
# ---------------------------------------------------------------------------


def update_relational_valence(
    state: CitizenCognitiveState,
    interaction_signals: Optional[dict[tuple[str, str], float]] = None,
    *,
    limbic_delta: Optional[float] = None,
) -> RelationalValenceResult:
    """Run Law 18 relational valence update across all eligible links.

    For links between co-active nodes (both endpoints have energy > 0),
    applies limbic-delta-driven updates to trust, affinity, aversion,
    friction, valence, and ambivalence.

    Trust mechanics integration (Phase T1/T2):
      When ``limbic_delta`` is provided (computed from DriveSnapshot
      comparison via ``trust.compute_limbic_delta``), it is used as the
      signal for ALL co-active links. This replaces the placeholder 0.1
      heuristic with a real experience-driven signal. Per-link signals
      in ``interaction_signals`` still take precedence when provided.

    Parameters
    ----------
    state:
        The citizen's full cognitive state (mutated in place).
    interaction_signals:
        Explicit limbic delta signals per link. Maps
        ``(source_id, target_id) -> float`` where positive = beneficial.
        When not provided, uses ``limbic_delta`` or the co-presence
        heuristic.
    limbic_delta:
        Global limbic delta from DriveSnapshot comparison. When provided
        and ``interaction_signals`` is None, this value is used as the
        signal for all co-active WM links, replacing the 0.1 placeholder.

    Returns
    -------
    RelationalValenceResult with counts and per-link deltas.
    """
    from ..trust import update_link_trust

    result = RelationalValenceResult()

    active_ids = {nid for nid, node in state.nodes.items() if node.energy > 0}
    wm_set = frozenset(state.wm.node_ids)

    for link in state.links:
        # Only update links between co-active nodes
        if link.source_id not in active_ids or link.target_id not in active_ids:
            continue

        # Determine the limbic delta signal for this link
        if interaction_signals is not None:
            signal = interaction_signals.get(
                (link.source_id, link.target_id), 0.0
            )
        elif limbic_delta is not None:
            # Use the real limbic delta for WM co-active links;
            # non-WM co-active links get a dampened version.
            if link.source_id in wm_set and link.target_id in wm_set:
                signal = limbic_delta
            else:
                # Co-active but not both in WM: attenuated signal
                signal = limbic_delta * 0.3
        else:
            # Fallback heuristic: co-presence in WM produces a mild positive signal
            if link.source_id in wm_set and link.target_id in wm_set:
                signal = 0.1
            else:
                signal = 0.0

        if abs(signal) < 1e-9:
            continue

        # Compute average energy of the two endpoints
        src_node = state.get_node(link.source_id)
        tgt_node = state.get_node(link.target_id)
        if src_node is None or tgt_node is None:
            continue

        avg_energy = (src_node.energy + tgt_node.energy) / 2.0

        # Apply trust-specific update via trust module
        link_key = (link.source_id, link.target_id)
        trust_result = update_link_trust(link, signal)

        if trust_result.trust_delta != 0.0:
            result.trust_deltas[link_key] = trust_result.trust_delta
        if trust_result.friction_delta != 0.0:
            result.friction_deltas[link_key] = trust_result.friction_delta

        # Apply the energy-modulated valence update (affinity, aversion,
        # valence, ambivalence, recency). This complements the trust update.
        deltas = update_link_valence(link, signal, avg_energy)

        if deltas or trust_result.trust_delta != 0.0 or trust_result.friction_delta != 0.0:
            result.links_updated += 1
            if "affinity" in deltas:
                result.affinity_deltas[link_key] = deltas.get("affinity", 0.0) + trust_result.affinity_delta
            if "aversion" in deltas:
                result.aversion_deltas[link_key] = deltas.get("aversion", 0.0) + trust_result.aversion_delta

    return result
