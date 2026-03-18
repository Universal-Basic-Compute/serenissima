"""Metabolic Economy — Organism Economics Engine.

$MIND is metabolic energy, not a store of value. This module implements
the five economic mechanisms that enforce organism dynamics:

1. Degressive Pricing (F1)       — Success subsidizes access.
2. Progressive Demurrage (F2)    — Holdings decay daily into UBC pool.
3. Anti-Sybil Repatriation (F3)  — Off-grid funds are recaptured with penalty.
4. Bilateral Bond Transfer (F4)  — Bonded pairs converge to financial parity.
5. Batch Settlement (F5)         — Value events settle on-chain periodically.

All formulas are defined in:
  docs/economy/metabolic/ALGORITHM_Metabolic_Economy.md
"""

from runtime.economy.degressive_pricing_formula import compute_price
from runtime.economy.progressive_demurrage_tax import compute_daily_tax
from runtime.economy.bilateral_bond_transfer import compute_bond_transfer
from runtime.economy.anti_sybil_repatriation import detect_off_grid, compute_repatriation
from runtime.economy.value_event_settlement import (
    record_energy_event,
    aggregate_by_pair,
    net_positions,
    filter_dust,
    prepare_settlement_batch,
    Event,
    Transfer,
)
from runtime.economy.settlement_engine import SettlementEngine

__all__ = [
    "compute_price",
    "compute_daily_tax",
    "compute_bond_transfer",
    "detect_off_grid",
    "compute_repatriation",
    "record_energy_event",
    "aggregate_by_pair",
    "net_positions",
    "filter_dust",
    "prepare_settlement_batch",
    "Event",
    "Transfer",
    "SettlementEngine",
]
