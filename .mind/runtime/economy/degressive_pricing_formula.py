"""F1: Degressive Price Formula.

P(i, S) = C_base(S) * D(S) * A(i)

Where:
    D(S) = e^{-k * U_S}            — Degressive factor (utility discount)
    A(i) = max(0.1, W_i / W_med)   — Wealth adjustment factor

The price a user pays decreases as the service becomes more successful
(higher utility weight) and adjusts based on the user's relative wealth.

See: docs/economy/metabolic/ALGORITHM_Metabolic_Economy.md  §F1
"""

import math


def compute_price(
    c_base: float,
    k: float,
    utility_weight: float,
    actor_wealth: float,
    median_wealth: float,
) -> float:
    """Compute the degressive price for a user accessing a service.

    Parameters
    ----------
    c_base : float
        Base compute cost of running the service once (>= 0).
        Measured from actual resource consumption, not set by hand.
    k : float
        Decay constant controlling discount speed (> 0).
        Higher k = faster discount with utility.  Default: 0.5.
    utility_weight : float
        Service utility weight from the knowledge graph (>= 0).
        Grows as more citizens/humans use the service.
    actor_wealth : float
        Total $MIND held by the user across all registered wallets (>= 0).
    median_wealth : float
        Median wallet balance across all active participants.
        Recomputed each settlement batch.

    Returns
    -------
    float
        The price in $MIND.  Always >= 0  (Invariant V1 / I1).

    Edge Cases
    ----------
    - median_wealth == 0  → bootstrap: A(i) = 1.0 for all users.
    - actor_wealth == 0   → A(i) = max(0.1, 0) = 0.1 (floor).
    - utility_weight == 0 → D(S) = 1.0 (no discount for new services).
    - c_base == 0         → price is 0 (service has zero compute cost).
    """
    if c_base < 0:
        raise ValueError(f"c_base must be non-negative, got {c_base}")
    if k < 0:
        raise ValueError(f"k must be non-negative, got {k}")
    if utility_weight < 0:
        raise ValueError(f"utility_weight must be non-negative, got {utility_weight}")
    if actor_wealth < 0:
        raise ValueError(f"actor_wealth must be non-negative, got {actor_wealth}")
    if median_wealth < 0:
        raise ValueError(f"median_wealth must be non-negative, got {median_wealth}")

    # D(S) — degressive factor: exponential discount from utility
    degressive_factor = math.exp(-k * utility_weight)

    # A(i) — wealth adjustment factor
    if median_wealth == 0:
        # Bootstrap condition: no liquidity yet, everyone pays base cost
        wealth_adjustment = 1.0
    else:
        wealth_adjustment = max(0.1, actor_wealth / median_wealth)

    price = c_base * degressive_factor * wealth_adjustment

    # Invariant I1: price is non-negative.
    # By construction this holds (product of non-negative terms), but
    # we enforce it explicitly to guard against floating-point anomalies.
    assert price >= 0, f"Price must be non-negative, got {price}"

    return price
