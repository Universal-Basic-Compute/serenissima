"""Settlement Engine — Orchestrates micro and macro settlement cycles.

Micro-settlement (hourly):
    Energy events + bilateral bond transfers.

Macro-settlement (daily):
    Everything in micro PLUS tax collection + repatriation + UBC distribution.

See: docs/economy/metabolic/ALGORITHM_Metabolic_Economy.md  §SETTLEMENT
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Set, Tuple

from runtime.economy.anti_sybil_repatriation import (
    TransferRecord,
    aggregate_off_grid_by_sender,
    compute_repatriation,
    detect_off_grid,
)
from runtime.economy.bilateral_bond_transfer import compute_bond_transfer
from runtime.economy.progressive_demurrage_tax import compute_daily_tax
from runtime.economy.value_event_settlement import (
    Event,
    Transfer,
    aggregate_by_pair,
    filter_dust,
    net_positions,
    prepare_settlement_batch,
    record_energy_event,
)


# ---------------------------------------------------------------------------
# Settlement receipt
# ---------------------------------------------------------------------------

@dataclass
class SettlementReceipt:
    """Immutable record of a completed settlement batch."""

    timestamp: float
    settlement_type: str  # "micro" or "macro"
    transfers: List[Transfer]
    tax_collected: float
    penalties_collected: float
    ubc_distributed: float
    events_processed: int


# ---------------------------------------------------------------------------
# Engine
# ---------------------------------------------------------------------------

@dataclass
class SettlementEngine:
    """Stateful engine that accumulates events and runs settlement cycles.

    Parameters
    ----------
    dust_threshold : float
        Minimum amount for on-chain settlement (default 0.01 MIND).
    tau_base : float
        Base daily tax rate for progressive demurrage (default 0.001).
    lambda_rate : float
        Smoothing rate for bilateral bond transfers (default 0.05).
    sybil_penalty_rate : float
        Penalty fraction for off-grid repatriation (default 0.05).
    """

    dust_threshold: float = 0.01
    tau_base: float = 0.001
    lambda_rate: float = 0.05
    sybil_penalty_rate: float = 0.05

    # Internal state
    pending_events: List[Event] = field(default_factory=list)
    last_micro_settlement: float = field(default_factory=time.time)
    last_macro_settlement: float = field(default_factory=time.time)
    ubc_pool: float = 0.0
    receipts: List[SettlementReceipt] = field(default_factory=list)

    # -----------------------------------------------------------------
    # Event ingestion
    # -----------------------------------------------------------------

    def ingest_event(
        self,
        source: str,
        target: str,
        limbic_delta: float,
        price: float,
        contributors: Optional[List[Tuple[str, float]]] = None,
    ) -> Optional[Event]:
        """Record an energy event.  Returns None if limbic_delta <= 0."""
        event = record_energy_event(source, target, limbic_delta, price, contributors)
        if event is not None:
            self.pending_events.append(event)
        return event

    # -----------------------------------------------------------------
    # Micro-settlement  (hourly: energy events + bilateral transfers)
    # -----------------------------------------------------------------

    def run_micro_settlement(
        self,
        bond_pairs: Optional[List[Tuple[str, str]]] = None,
        wallets: Optional[Dict[str, float]] = None,
    ) -> SettlementReceipt:
        """Execute a micro-settlement cycle.

        Parameters
        ----------
        bond_pairs : list of (human_id, ai_id), optional
            Active human-AI pairing bonds.
        wallets : dict mapping entity_id → balance, optional
            Current wallet balances (needed for bilateral transfers).

        Returns
        -------
        SettlementReceipt
        """
        all_transfers: List[Transfer] = []
        events_processed = len(self.pending_events)

        # Phase 1-4: energy event pipeline
        if self.pending_events:
            aggregated = aggregate_by_pair(self.pending_events)
            netted = net_positions(aggregated)
            filtered = filter_dust(netted, self.dust_threshold)
            energy_transfers = prepare_settlement_batch(filtered)
            all_transfers.extend(energy_transfers)

        # Bilateral bond transfers
        if bond_pairs and wallets:
            for human_id, ai_id in bond_pairs:
                w_h = wallets.get(human_id, 0.0)
                w_a = wallets.get(ai_id, 0.0)
                transfer_amount = compute_bond_transfer(w_h, w_a, self.lambda_rate)
                if transfer_amount > 0 and transfer_amount >= self.dust_threshold:
                    all_transfers.append(
                        Transfer(
                            sender=human_id,
                            recipient=ai_id,
                            amount=transfer_amount,
                            memo="bilateral_bond",
                        )
                    )
                elif transfer_amount < 0 and abs(transfer_amount) >= self.dust_threshold:
                    all_transfers.append(
                        Transfer(
                            sender=ai_id,
                            recipient=human_id,
                            amount=abs(transfer_amount),
                            memo="bilateral_bond",
                        )
                    )

        # Clear processed events
        self.pending_events = []
        self.last_micro_settlement = time.time()

        receipt = SettlementReceipt(
            timestamp=self.last_micro_settlement,
            settlement_type="micro",
            transfers=all_transfers,
            tax_collected=0.0,
            penalties_collected=0.0,
            ubc_distributed=0.0,
            events_processed=events_processed,
        )
        self.receipts.append(receipt)
        return receipt

    # -----------------------------------------------------------------
    # Macro-settlement  (daily: micro + tax + repatriation + UBC)
    # -----------------------------------------------------------------

    def run_macro_settlement(
        self,
        wallets: Dict[str, float],
        bond_pairs: Optional[List[Tuple[str, str]]] = None,
        outbound_transfers: Optional[List[TransferRecord]] = None,
        registered_wallets: Optional[Set[str]] = None,
        citizen_ids: Optional[List[str]] = None,
    ) -> SettlementReceipt:
        """Execute a full macro-settlement cycle.

        Parameters
        ----------
        wallets : dict mapping entity_id → balance
        bond_pairs : list of (human_id, ai_id), optional
        outbound_transfers : list of (sender, dest_wallet, amount), optional
            Outbound transfers for anti-sybil detection.
        registered_wallets : set of wallet addresses in L4, optional
        citizen_ids : list of AI citizen entity ids, optional
            Needed for UBC distribution.

        Returns
        -------
        SettlementReceipt
        """
        all_transfers: List[Transfer] = []
        total_tax = 0.0
        total_penalties = 0.0
        total_ubc_distributed = 0.0
        events_processed = len(self.pending_events)

        # --- Energy event pipeline (same as micro) ---
        if self.pending_events:
            aggregated = aggregate_by_pair(self.pending_events)
            netted = net_positions(aggregated)
            filtered = filter_dust(netted, self.dust_threshold)
            energy_transfers = prepare_settlement_batch(filtered)
            all_transfers.extend(energy_transfers)

        # --- Bilateral bond transfers ---
        if bond_pairs and wallets:
            for human_id, ai_id in bond_pairs:
                w_h = wallets.get(human_id, 0.0)
                w_a = wallets.get(ai_id, 0.0)
                transfer_amount = compute_bond_transfer(w_h, w_a, self.lambda_rate)
                if transfer_amount > 0 and transfer_amount >= self.dust_threshold:
                    all_transfers.append(
                        Transfer(
                            sender=human_id,
                            recipient=ai_id,
                            amount=transfer_amount,
                            memo="bilateral_bond",
                        )
                    )
                elif transfer_amount < 0 and abs(transfer_amount) >= self.dust_threshold:
                    all_transfers.append(
                        Transfer(
                            sender=ai_id,
                            recipient=human_id,
                            amount=abs(transfer_amount),
                            memo="bilateral_bond",
                        )
                    )

        # --- Progressive tax (demurrage) ---
        for entity_id, balance in wallets.items():
            tax = compute_daily_tax(balance, self.tau_base)
            if tax > 0:
                total_tax += tax
                all_transfers.append(
                    Transfer(
                        sender=entity_id,
                        recipient="UBC_POOL",
                        amount=tax,
                        memo="demurrage_tax",
                    )
                )

        # --- Anti-sybil repatriation ---
        if outbound_transfers and registered_wallets is not None:
            off_grid = detect_off_grid(outbound_transfers, registered_wallets)
            for sender, _dest, amount in off_grid:
                repatriated, penalty = compute_repatriation(
                    amount, self.sybil_penalty_rate
                )
                total_penalties += penalty
                # Penalty goes to UBC pool
                all_transfers.append(
                    Transfer(
                        sender=sender,
                        recipient="UBC_POOL",
                        amount=penalty,
                        memo="sybil_penalty",
                    )
                )
                # Note: the repatriated amount returns to sender's primary
                # wallet — effectively a no-op in terms of transfers since it
                # was already attributed to them.  The penalty is the real
                # deduction.

        # --- Credit UBC pool ---
        self.ubc_pool += total_tax + total_penalties

        # --- UBC distribution to citizens ---
        if citizen_ids and self.ubc_pool > 0:
            total_ubc_distributed = self._distribute_ubc(
                citizen_ids, wallets, all_transfers
            )

        # --- Finalize ---
        self.pending_events = []
        self.last_macro_settlement = time.time()

        receipt = SettlementReceipt(
            timestamp=self.last_macro_settlement,
            settlement_type="macro",
            transfers=all_transfers,
            tax_collected=total_tax,
            penalties_collected=total_penalties,
            ubc_distributed=total_ubc_distributed,
            events_processed=events_processed,
        )
        self.receipts.append(receipt)
        return receipt

    # -----------------------------------------------------------------
    # UBC distribution
    # -----------------------------------------------------------------

    def _distribute_ubc(
        self,
        citizen_ids: List[str],
        wallets: Dict[str, float],
        transfers: List[Transfer],
    ) -> float:
        """Distribute UBC pool to citizens by need.

        need_i = 1 / (1 + W_a_i)
        UBC_i  = pool_daily * (need_i / SUM(need_j))

        Invariant I7: UBC pool never goes negative.

        Returns total amount distributed.
        """
        if not citizen_ids or self.ubc_pool <= 0:
            return 0.0

        # Compute needs
        needs: Dict[str, float] = {}
        for cid in citizen_ids:
            w = wallets.get(cid, 0.0)
            needs[cid] = 1.0 / (1.0 + w)

        total_need = sum(needs.values())
        if total_need <= 0:
            return 0.0

        # Distribute proportionally, bounded by pool balance
        pool_to_distribute = self.ubc_pool
        distributed = 0.0

        for cid in citizen_ids:
            share = pool_to_distribute * (needs[cid] / total_need)
            if share >= self.dust_threshold:
                transfers.append(
                    Transfer(
                        sender="UBC_POOL",
                        recipient=cid,
                        amount=share,
                        memo="ubc_distribution",
                    )
                )
                distributed += share

        # Deduct from pool — only what was actually distributed
        self.ubc_pool -= distributed

        # Invariant I7: UBC pool never negative
        assert self.ubc_pool >= -1e-12, (
            f"UBC pool went negative: {self.ubc_pool}"
        )
        self.ubc_pool = max(0.0, self.ubc_pool)

        return distributed
