"""Compute budget manager — trust-based compute allocation and tick speed control.

Controls orchestrator tick speed based on:
  - Payment mode (subscription, own_compute, ubc, paygo)
  - Monthly budget with configurable margin
  - Trust-based citizen share allocation
  - Real-time usage tracking

Key design:
  - Higher trust = more ticks (strongest incentive in the system)
  - Tick interval adjusts dynamically based on budget pressure
  - Usage tracked per-citizen in shrine/state/compute_usage.jsonl
"""

import json
import math
import os
import time
import logging
from datetime import datetime
from pathlib import Path
from typing import Optional

logger = logging.getLogger("orchestrator.budget")

# ── Constants ───────────────────────────────────────────────────────────────

# Default tick interval range
MIN_TICK_INTERVAL = 2.0   # seconds — fastest possible tick
MAX_TICK_INTERVAL = 60.0  # seconds — slowest tick under budget pressure
DEFAULT_TICK_INTERVAL = 5.0

# Cost estimates (Claude Code with Max subscription)
# These are rough — actual cost is tokens × price, but with Max subscription
# the cost is the subscription itself. We track "tick-equivalent cost" for
# budget allocation purposes.
ESTIMATED_COST_PER_TICK_USD = 0.02  # ~$0.02 per Claude Code invocation (rough)


class ComputeBudget:
    """Budget-driven compute allocator for citizen sessions."""

    def __init__(
        self,
        mode: str = "subscription",
        monthly_budget_usd: float = 300.0,
        margin_pct: float = 10.0,
        usage_file: Optional[Path] = None,
    ):
        self.mode = mode  # "subscription" | "own_compute" | "ubc" | "paygo"
        self.monthly_budget_usd = monthly_budget_usd
        self.margin_pct = margin_pct
        self.usage_file = usage_file or (
            Path(__file__).resolve().parent.parent.parent / "shrine" / "state" / "compute_usage.jsonl"
        )

        # Runtime state
        self._month_start = self._get_month_start()
        self._month_ticks = 0
        self._month_cost_usd = 0.0
        self._citizen_ticks: dict[str, int] = {}
        self._citizen_cost: dict[str, float] = {}
        self._last_tick_time = 0.0

        # Load existing usage for current month
        self._load_current_month_usage()

    def _get_month_start(self) -> str:
        """Return YYYY-MM for current month."""
        return datetime.now().strftime("%Y-%m")

    def _load_current_month_usage(self):
        """Load usage data for the current month."""
        if not self.usage_file.exists():
            return
        month = self._month_start
        try:
            for line in self.usage_file.read_text().strip().split("\n"):
                if not line.strip():
                    continue
                try:
                    entry = json.loads(line)
                    if entry.get("month") == month:
                        handle = entry.get("citizen", "_system")
                        cost = entry.get("cost_usd", ESTIMATED_COST_PER_TICK_USD)
                        self._month_ticks += 1
                        self._month_cost_usd += cost
                        self._citizen_ticks[handle] = self._citizen_ticks.get(handle, 0) + 1
                        self._citizen_cost[handle] = self._citizen_cost.get(handle, 0.0) + cost
                except json.JSONDecodeError:
                    pass
        except IOError:
            pass

    def record_tick(self, handle: str, tokens_used: int = 0, cost_usd: float = 0.0):
        """Record a compute tick for a citizen."""
        if cost_usd <= 0:
            cost_usd = ESTIMATED_COST_PER_TICK_USD

        # Check for month rollover
        current_month = self._get_month_start()
        if current_month != self._month_start:
            self._month_start = current_month
            self._month_ticks = 0
            self._month_cost_usd = 0.0
            self._citizen_ticks.clear()
            self._citizen_cost.clear()

        self._month_ticks += 1
        self._month_cost_usd += cost_usd
        self._citizen_ticks[handle] = self._citizen_ticks.get(handle, 0) + 1
        self._citizen_cost[handle] = self._citizen_cost.get(handle, 0.0) + cost_usd
        self._last_tick_time = time.time()

        # Persist
        self.usage_file.parent.mkdir(parents=True, exist_ok=True)
        entry = {
            "month": current_month,
            "citizen": handle,
            "tokens": tokens_used,
            "cost_usd": cost_usd,
            "timestamp": datetime.now().isoformat(),
        }
        with open(self.usage_file, "a") as f:
            f.write(json.dumps(entry) + "\n")

    def compute_citizen_share(self, handle: str, trust_score: float) -> float:
        """Compute a citizen's share of compute budget based on trust.

        Returns a float 0.0-1.0 representing their share.
        Uses sqrt scaling — trust 100 gets ~3.2x the share of trust 10.
        """
        # sqrt scaling: not linear, but still strongly rewarding trust
        return math.sqrt(max(trust_score, 1.0)) / 10.0

    def get_tick_interval_seconds(self) -> float:
        """Current interval between ticks, adjusted by budget pressure.

        Returns seconds to wait between dispatch cycles.
        """
        if self.mode == "own_compute":
            # Maximize utilization — tick as fast as possible
            return MIN_TICK_INTERVAL

        if self.mode == "subscription":
            # Stay within monthly budget with margin
            effective_budget = self.monthly_budget_usd * (1 - self.margin_pct / 100)

            if self._month_cost_usd >= effective_budget:
                # Budget exhausted — slow to minimum
                return MAX_TICK_INTERVAL

            # Calculate budget utilization rate
            days_in_month = 30
            now = datetime.now()
            day_of_month = now.day
            days_remaining = max(1, days_in_month - day_of_month)

            budget_remaining = effective_budget - self._month_cost_usd
            daily_budget = budget_remaining / days_remaining
            ticks_per_day = daily_budget / ESTIMATED_COST_PER_TICK_USD

            if ticks_per_day <= 0:
                return MAX_TICK_INTERVAL

            # Convert ticks per day to interval
            seconds_per_day = 86400
            interval = seconds_per_day / ticks_per_day

            return max(MIN_TICK_INTERVAL, min(MAX_TICK_INTERVAL, interval))

        # paygo / ubc: default interval
        return DEFAULT_TICK_INTERVAL

    def should_tick(self, handle: str, trust_score: float = 50.0) -> bool:
        """Should this citizen get a tick now? Based on trust share.

        Citizens with higher trust get proportionally more ticks.
        """
        if self.mode == "own_compute":
            return True  # No restrictions

        share = self.compute_citizen_share(handle, trust_score)
        citizen_ticks = self._citizen_ticks.get(handle, 0)
        total_ticks = max(self._month_ticks, 1)

        # Citizen's current fraction of total ticks
        current_fraction = citizen_ticks / total_ticks

        # Allow tick if citizen is below their fair share
        # (with some buffer to avoid strict alternation)
        return current_fraction <= share + 0.1

    def get_budget_status(self) -> dict:
        """Return budget status for display."""
        effective_budget = self.monthly_budget_usd * (1 - self.margin_pct / 100)
        return {
            "mode": self.mode,
            "monthly_budget_usd": self.monthly_budget_usd,
            "month_cost_usd": round(self._month_cost_usd, 2),
            "month_ticks": self._month_ticks,
            "budget_remaining_usd": round(effective_budget - self._month_cost_usd, 2),
            "tick_interval_seconds": round(self.get_tick_interval_seconds(), 1),
            "citizen_ticks": dict(self._citizen_ticks),
        }
