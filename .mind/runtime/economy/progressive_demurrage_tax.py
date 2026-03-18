"""F2: Progressive Daily Tax (Demurrage).

T_i = W_total_i * tau_base * log10(1 + W_total_i)

Every wallet is taxed daily.  The effective rate increases logarithmically
with wealth.  Revenue feeds the UBC pool.

See: docs/economy/metabolic/ALGORITHM_Metabolic_Economy.md  §F2
"""

import math


def compute_daily_tax(
    w_total: float,
    tau_base: float = 0.001,
) -> float:
    """Compute the daily demurrage tax for an entity.

    Parameters
    ----------
    w_total : float
        Total wealth attributable to the entity (>= 0).
        Includes registered wallets AND off-grid attributed funds.
    tau_base : float
        Base daily tax rate before progressive scaling (> 0).
        Default: 0.001 (0.1 %/day).

    Returns
    -------
    float
        Daily tax in $MIND.
        Invariant V2: tax >= 0  AND  tax <= w_total.

    Edge Cases
    ----------
    - w_total == 0 → tax is 0.
    - w_total < 0  → raises ValueError (wallets cannot be negative, V9).
    """
    if w_total < 0:
        raise ValueError(f"w_total must be non-negative, got {w_total}")
    if tau_base <= 0:
        raise ValueError(f"tau_base must be positive, got {tau_base}")

    if w_total == 0:
        return 0.0

    tax = w_total * tau_base * math.log10(1 + w_total)

    # Invariant V2 / I3: tax never exceeds balance.
    # Theoretically this fires only when W > 10^(1/tau_base),
    # which is 10^1000 for tau_base=0.001.  Guard anyway.
    tax = min(tax, w_total)

    assert tax >= 0, f"Tax must be non-negative, got {tax}"

    return tax
