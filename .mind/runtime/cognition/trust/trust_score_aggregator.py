"""
Trust Score Aggregation — Phase T4

Spec: docs/trust_mechanics/ALGORITHM_Trust_Mechanics.md section 4

Compute an aggregate trust score for an actor from all inbound
trust-carrying links. The score is ALWAYS computed on demand, NEVER
stored on nodes. Caching with TTL is permitted but the link topology
is always the source of truth.

Formula (section 4.1 — weighted mean):
    trust_score = sum(trust_i * w_i) / sum(w_i)
    w_i = energy_i * recency_factor_i
    recency_factor_i = exp(-lambda_recency * age_days_i)

Result always in [0, 1].
"""

from __future__ import annotations

import math
import time

from ..models import CitizenCognitiveState, Link

# --- Constants ---

# Recency decay rate: controls how fast old links lose influence.
# lambda=0.1 means a 100-day-old link has recency_factor ~ 0.00005.
LAMBDA_RECENCY = 0.1

# Minimum weight threshold for a link to be considered in aggregation.
# Links with weight below this are noise, not signal.
MIN_LINK_WEIGHT = 1e-6

# Seconds per day (for converting timestamps to day-based recency).
SECONDS_PER_DAY = 86400.0


def _recency_factor(age_days: float) -> float:
    """Compute exponential recency decay.

    recency_factor = exp(-lambda * age_days)

    Recent interactions (age_days~0) contribute fully.
    Old interactions decay exponentially.
    """
    return math.exp(-LAMBDA_RECENCY * max(0.0, age_days))


def compute_trust_score(
    actor_id: str,
    state: CitizenCognitiveState,
    *,
    now: float | None = None,
) -> float:
    """Compute aggregate trust score for an actor from inbound links.

    Parameters
    ----------
    actor_id:
        The node ID of the actor to score.
    state:
        Full cognitive state containing nodes and links.
    now:
        Current timestamp in seconds since epoch. Defaults to time.time().

    Returns
    -------
    float in [0, 1]. Returns 0.0 if no inbound trust-carrying links exist.
    """
    if now is None:
        now = time.time()

    # Gather all inbound links that carry trust signal.
    inbound = [
        link for link in state.links
        if link.target_id == actor_id and link.trust > 0
    ]

    if not inbound:
        return 0.0

    weighted_sum = 0.0
    weight_sum = 0.0

    for link in inbound:
        # Age in days since last co-activation (or creation if never activated).
        last_active = link.last_co_activated_at
        if last_active <= 0:
            # Never co-activated: use a large age to heavily discount.
            age_days = 365.0
        else:
            age_days = max(0.0, (now - last_active) / SECONDS_PER_DAY)

        recency = _recency_factor(age_days)

        # Weight = link energy * recency_factor
        # If link.energy is zero (dormant), fall back to link.weight
        # so that established but quiet links still contribute.
        energy_signal = link.energy if link.energy > 0 else link.weight
        w = energy_signal * recency

        if w < MIN_LINK_WEIGHT:
            continue

        weighted_sum += link.trust * w
        weight_sum += w

    if weight_sum < MIN_LINK_WEIGHT:
        return 0.0

    score = weighted_sum / weight_sum

    # Clamp to [0, 1] for safety.
    return max(0.0, min(1.0, score))
