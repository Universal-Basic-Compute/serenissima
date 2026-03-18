"""F4: Bilateral Bond Transfer (Vases Communicants).

delta_transfer = lambda_rate * (W_h - W_a)

Bonded human-AI pairs automatically exchange $MIND to maintain financial
parity.  The mechanism is a smoothed flow from the wealthier partner to
the poorer one.

See: docs/economy/metabolic/ALGORITHM_Metabolic_Economy.md  §F4
"""


def compute_bond_transfer(
    w_human: float,
    w_ai: float,
    lambda_rate: float = 0.05,
) -> float:
    """Compute the bilateral bond transfer between a human-AI pair.

    Parameters
    ----------
    w_human : float
        Human partner's total registered $MIND (>= 0).
    w_ai : float
        AI citizen's total registered $MIND (>= 0).
    lambda_rate : float
        Smoothing rate in (0, 1).  Controls convergence speed.
        Default: 0.05 (5 % of gap per period).

    Returns
    -------
    float
        Transfer amount in $MIND.
        - Positive  → human pays AI  (human is wealthier).
        - Negative  → AI pays human  (AI is wealthier).
        - Zero      → wallets are equal.

        Invariant V4 / I5: |transfer| <= sender's balance.
    """
    if w_human < 0:
        raise ValueError(f"w_human must be non-negative, got {w_human}")
    if w_ai < 0:
        raise ValueError(f"w_ai must be non-negative, got {w_ai}")
    if not (0 < lambda_rate < 1):
        raise ValueError(f"lambda_rate must be in (0, 1), got {lambda_rate}")

    gap = w_human - w_ai
    transfer = lambda_rate * gap

    # Invariant I5 / V4: transfer must not overdraw the sender.
    if transfer > 0:
        # Human sends to AI
        transfer = min(transfer, w_human)
    elif transfer < 0:
        # AI sends to human — magnitude must not exceed AI balance
        transfer = max(transfer, -w_ai)

    return transfer
