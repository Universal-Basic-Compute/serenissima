"""F3: Anti-Sybil Repatriation.

Funds sent to wallets not registered in the L4 registry are still
attributed to the sender for tax purposes.  They are automatically
repatriated: 95 % back to the sender, 5 % penalty to the UBC pool.

See: docs/economy/metabolic/ALGORITHM_Metabolic_Economy.md  §F3
"""

from __future__ import annotations

from typing import Dict, List, Set, Tuple


# ---------------------------------------------------------------------------
# Type aliases
# ---------------------------------------------------------------------------
# A transfer record: (sender_entity_id, destination_wallet, amount)
TransferRecord = Tuple[str, str, float]


def detect_off_grid(
    transfers: List[TransferRecord],
    registered_wallets: Set[str],
) -> List[TransferRecord]:
    """Identify transfers whose destination is NOT in the L4 registry.

    Parameters
    ----------
    transfers : list of (sender_id, destination_wallet, amount)
        All outbound $MIND transfers in the current period.
    registered_wallets : set of str
        Wallet addresses currently registered in L4.

    Returns
    -------
    list of TransferRecord
        Subset of *transfers* where destination is off-grid.

    Invariant V6 / I8
    ------------------
    Every returned transfer is attributed to exactly one entity (the sender).
    """
    off_grid: List[TransferRecord] = []
    for sender, destination, amount in transfers:
        if amount < 0:
            raise ValueError(
                f"Transfer amount must be non-negative, got {amount} "
                f"from {sender} to {destination}"
            )
        if destination not in registered_wallets:
            off_grid.append((sender, destination, amount))
    return off_grid


def compute_repatriation(
    amount: float,
    penalty_rate: float = 0.05,
) -> Tuple[float, float]:
    """Compute the repatriation split for an off-grid amount.

    Parameters
    ----------
    amount : float
        Total $MIND to repatriate (>= 0).
    penalty_rate : float
        Fraction lost as penalty (default 0.05 = 5 %).

    Returns
    -------
    (repatriated, penalty) : (float, float)
        repatriated — amount returned to the sender's primary wallet.
        penalty     — amount sent to the UBC pool.

        Invariant V3: repatriated + penalty == amount  (conservation).
        The entity's total wealth decreases by exactly penalty_rate * amount.
    """
    if amount < 0:
        raise ValueError(f"amount must be non-negative, got {amount}")
    if not (0 <= penalty_rate <= 1):
        raise ValueError(f"penalty_rate must be in [0, 1], got {penalty_rate}")

    penalty = amount * penalty_rate
    repatriated = amount - penalty  # avoids floating-point drift vs amount * (1 - rate)

    # Conservation check
    assert abs((repatriated + penalty) - amount) < 1e-12, (
        f"Conservation violated: {repatriated} + {penalty} != {amount}"
    )

    return repatriated, penalty


def aggregate_off_grid_by_sender(
    off_grid_transfers: List[TransferRecord],
) -> Dict[str, float]:
    """Sum off-grid amounts per sender entity.

    Useful for computing W_offgrid_i = SUM of all off-grid $MIND
    attributed to entity i.

    Parameters
    ----------
    off_grid_transfers : list of (sender_id, destination_wallet, amount)

    Returns
    -------
    dict mapping sender_id → total off-grid amount.
    """
    totals: Dict[str, float] = {}
    for sender, _dest, amount in off_grid_transfers:
        totals[sender] = totals.get(sender, 0.0) + amount
    return totals
