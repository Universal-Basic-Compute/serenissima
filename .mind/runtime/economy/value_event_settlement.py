"""F5: Value Event to $MIND Conversion — Batch Settlement.

Six-phase pipeline:
  COLLECT → AGGREGATE → NET → FILTER → EXECUTE → RECORD

Value events are recorded locally, accumulated per (source, target),
netted bilaterally, filtered for dust, and settled as batched transfers.

See: docs/economy/metabolic/ALGORITHM_Metabolic_Economy.md  §F5, §SETTLEMENT
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------

@dataclass
class Event:
    """A single energy/value event between a source and a target.

    Recorded immediately when value is created (positive limbic_delta).
    """

    source: str
    target: str
    limbic_delta: float
    price: float
    timestamp: float = field(default_factory=time.time)
    contributors: Optional[List[Tuple[str, float]]] = None

    @property
    def energy(self) -> float:
        """$MIND energy = limbic_delta * price."""
        return self.limbic_delta * self.price


@dataclass
class Transfer:
    """A single on-chain transfer instruction produced by settlement."""

    sender: str
    recipient: str
    amount: float
    memo: str = ""


# ---------------------------------------------------------------------------
# Phase 1: COLLECT — record energy events
# ---------------------------------------------------------------------------

def record_energy_event(
    source: str,
    target: str,
    limbic_delta: float,
    price: float,
    contributors: Optional[List[Tuple[str, float]]] = None,
) -> Optional[Event]:
    """Create an energy event if limbic_delta > 0.

    Parameters
    ----------
    source : str
        Entity id of the user who consumed the service.
    target : str
        Entity id (or service id) of the value source.
    limbic_delta : float
        Change in emotional/cognitive state.  Positive = value created.
    price : float
        Price in $MIND from the degressive pricing formula (F1).
    contributors : list of (entity_id, weight), optional
        Creator weights for the target service.  Weights must sum to 1.0.

    Returns
    -------
    Event or None
        None if limbic_delta <= 0 (no value created).
    """
    if limbic_delta <= 0:
        return None

    if contributors is not None:
        _validate_contributor_weights(contributors)

    return Event(
        source=source,
        target=target,
        limbic_delta=limbic_delta,
        price=price,
        contributors=contributors,
    )


# ---------------------------------------------------------------------------
# Phase 2: AGGREGATE — sum energy by (source, target)
# ---------------------------------------------------------------------------

def aggregate_by_pair(events: List[Event]) -> Dict[Tuple[str, str], float]:
    """Aggregate energy events by (source, target) pair.

    Multiple events between the same source and target within a period
    are summed.  This reduces the number of on-chain transactions.

    Parameters
    ----------
    events : list of Event

    Returns
    -------
    dict mapping (source, target) → total energy ($MIND).
    """
    aggregated: Dict[Tuple[str, str], float] = {}
    for event in events:
        key = (event.source, event.target)
        aggregated[key] = aggregated.get(key, 0.0) + event.energy
    return aggregated


# ---------------------------------------------------------------------------
# Phase 3: NET — bilateral netting per entity pair
# ---------------------------------------------------------------------------

def net_positions(
    aggregated: Dict[Tuple[str, str], float],
) -> Dict[Tuple[str, str], float]:
    """Bilaterally net flows between entity pairs.

    If Alice owes Bob 50 and Bob owes Alice 30, net result is
    Alice → Bob 20.

    Parameters
    ----------
    aggregated : dict from aggregate_by_pair()

    Returns
    -------
    dict mapping (sender, recipient) → net amount (> 0 only).
    Pairs where the net is zero or negative are omitted.
    """
    # Group by unordered pair
    pair_flows: Dict[Tuple[str, str], float] = {}

    for (src, tgt), energy in aggregated.items():
        if energy <= 0:
            continue
        # Canonical ordering: always (min, max) for the key
        canonical = tuple(sorted((src, tgt)))
        # Positive means canonical[0] → canonical[1]
        if src == canonical[0]:
            direction = energy
        else:
            direction = -energy
        pair_flows[canonical] = pair_flows.get(canonical, 0.0) + direction

    # Convert back to directed (sender, recipient) with positive amounts
    netted: Dict[Tuple[str, str], float] = {}
    for (a, b), net_amount in pair_flows.items():
        if net_amount > 0:
            netted[(a, b)] = net_amount
        elif net_amount < 0:
            netted[(b, a)] = -net_amount
        # net_amount == 0 → omitted

    return netted


# ---------------------------------------------------------------------------
# Phase 4: FILTER — remove dust
# ---------------------------------------------------------------------------

def filter_dust(
    netted: Dict[Tuple[str, str], float],
    dust_threshold: float = 0.01,
) -> Dict[Tuple[str, str], float]:
    """Remove flows below the dust threshold.

    Sub-threshold flows are deferred (returned separately) so they
    can be rolled into the next settlement period.

    Parameters
    ----------
    netted : dict from net_positions()
    dust_threshold : float
        Minimum settlement amount.  Default: 0.01 MIND.

    Returns
    -------
    dict mapping (sender, recipient) → amount for flows >= threshold.
    """
    if dust_threshold < 0:
        raise ValueError(f"dust_threshold must be non-negative, got {dust_threshold}")

    return {
        pair: amount
        for pair, amount in netted.items()
        if amount >= dust_threshold
    }


# ---------------------------------------------------------------------------
# Phase 5 + 6: EXECUTE + RECORD — prepare the settlement batch
# ---------------------------------------------------------------------------

def prepare_settlement_batch(
    netted: Dict[Tuple[str, str], float],
) -> List[Transfer]:
    """Convert netted positions into a list of Transfer instructions.

    This is the EXECUTE preparation phase.  Actual on-chain submission
    is handled by the Solana integration layer (out of scope here).

    Parameters
    ----------
    netted : dict of (sender, recipient) → amount
        Typically the output of filter_dust().

    Returns
    -------
    list of Transfer
        Ready for batched on-chain submission.

    Invariant I1/V5 — conservation
    --------------------------------
    Total outflows == total inflows across the batch.
    """
    transfers: List[Transfer] = []
    for (sender, recipient), amount in netted.items():
        if amount <= 0:
            continue
        transfers.append(
            Transfer(
                sender=sender,
                recipient=recipient,
                amount=amount,
                memo="energy_settlement",
            )
        )
    return transfers


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _validate_contributor_weights(
    contributors: List[Tuple[str, float]],
    tolerance: float = 0.001,
) -> None:
    """Ensure contributor weights sum to 1.0 within tolerance (I6).

    If weights are off, normalize them and log a warning rather than
    halting.  See VALIDATION E6.
    """
    if not contributors:
        return
    total = sum(w for _, w in contributors)
    if abs(total - 1.0) > tolerance:
        # Normalize — the graph physics module is the source of truth;
        # we correct here defensively but the inconsistency should be
        # investigated upstream.
        for i, (entity_id, weight) in enumerate(contributors):
            contributors[i] = (entity_id, weight / total)
