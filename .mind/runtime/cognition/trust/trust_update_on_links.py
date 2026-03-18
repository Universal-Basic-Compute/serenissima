"""
Trust Update on Links — Phase T1

Spec: docs/trust_mechanics/ALGORITHM_Trust_Mechanics.md section 2

Updates trust and friction on a link based on the Limbic Delta signal.

Key design decisions:
  - Positive limbic delta -> trust grows (asymptotic, beta=0.05)
  - Negative limbic delta -> friction grows (asymptotic, gamma=0.08)
  - Negative deltas do NOT reduce trust directly (see section 2.2)
  - Trust decay comes from Law 7, not from negative interactions
  - Affinity/aversion co-evolve with trust/friction
  - All updates use (1 - current_value) tempering to prevent overshoot

Trust on links ONLY, never on nodes.
"""

from __future__ import annotations

from dataclasses import dataclass

from ..models import Link

# Learning rates from ALGORITHM_Trust_Mechanics.md section 2.1
TRUST_BETA = 0.05       # Trust learning rate (positive LD)
FRICTION_GAMMA = 0.08   # Friction learning rate (negative LD, faster = negativity bias)
AFFINITY_RATE = 0.02    # Affinity co-evolution rate
AVERSION_RATE = 0.03    # Aversion co-evolution rate


@dataclass
class TrustUpdateResult:
    """Diagnostic output from a single trust update operation."""
    trust_delta: float = 0.0
    friction_delta: float = 0.0
    affinity_delta: float = 0.0
    aversion_delta: float = 0.0


def update_link_trust(
    link: Link,
    limbic_delta: float,
    dt: float = 1.0,
) -> TrustUpdateResult:
    """Update trust and friction on a link based on limbic delta.

    Only positive deltas increase trust.
    Negative deltas increase friction (not decrease trust directly).
    Trust decrease comes from Law 7 decay, not from negative interactions.

    Parameters
    ----------
    link:
        The link to update (mutated in place). Must have trust, friction,
        affinity, and aversion fields.
    limbic_delta:
        Signed limbic delta from compute_limbic_delta(). Positive = beneficial.
    dt:
        Time step multiplier (default 1.0 for one tick).

    Returns
    -------
    TrustUpdateResult with deltas applied for diagnostics.
    """
    result = TrustUpdateResult()

    if abs(limbic_delta) < 1e-9:
        return result

    if limbic_delta > 0:
        # --- Trust gain: asymptotic, same shape as Law 6 consolidation ---
        # delta_trust = beta * LD * (1 - T) * dt
        trust_delta = TRUST_BETA * limbic_delta * (1.0 - link.trust) * dt
        link.trust = min(1.0, link.trust + trust_delta)
        result.trust_delta = trust_delta

        # Affinity co-evolves with trust on positive interactions
        affinity_delta = AFFINITY_RATE * limbic_delta * (1.0 - link.affinity)
        link.affinity = min(1.0, link.affinity + affinity_delta)
        result.affinity_delta = affinity_delta

    if limbic_delta < 0:
        # --- Friction gain: negativity bias (gamma > beta) ---
        # delta_friction = gamma * |LD| * (1 - F) * dt
        friction_delta = FRICTION_GAMMA * abs(limbic_delta) * (1.0 - link.friction) * dt
        link.friction = min(1.0, link.friction + friction_delta)
        result.friction_delta = friction_delta

        # Aversion co-evolves with friction on negative interactions
        aversion_delta = AVERSION_RATE * abs(limbic_delta) * (1.0 - link.aversion)
        link.aversion = min(1.0, link.aversion + aversion_delta)
        result.aversion_delta = aversion_delta

    return result
