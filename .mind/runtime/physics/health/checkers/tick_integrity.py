"""
Tick Integrity Checker

Verifies V-TICK-ORDER and V-TICK-COMPLETE invariants.

DOCS: docs/physics/HEALTH_Energy_Physics.md#indicator-tick_phase_order
"""

import logging
from datetime import datetime
from typing import List, Dict, Any, Optional

from ..base import BaseChecker, HealthResult

logger = logging.getLogger(__name__)


class TickIntegrityChecker(BaseChecker):
    """
    Verify tick phases execute in correct order and complete.

    Checks:
    - V-TICK-ORDER: Phases execute in sequence (1→2→3→4→5→6)
    - V-TICK-COMPLETE: All phases complete if tick starts
    """

    name = "tick_integrity"
    validation_ids = ["V-TICK-ORDER", "V-TICK-COMPLETE"]
    priority = "high"

    # Expected phase order
    EXPECTED_PHASES = [
        "generate",
        "draw",
        "flow",
        "interaction",
        "backflow",
        "link_cooling",
    ]

    def __init__(self, graph_queries=None, graph_ops=None):
        super().__init__(graph_queries, graph_ops)
        # Track phase timestamps from instrumentation
        self._last_tick_phases: List[Dict[str, Any]] = []

    def record_phase(self, phase_name: str, start_time: datetime, end_time: Optional[datetime] = None):
        """
        Record a phase execution for verification.

        Called by tick.py instrumentation.
        """
        self._last_tick_phases.append({
            "name": phase_name,
            "start": start_time,
            "end": end_time or datetime.utcnow(),
        })

    def clear_phases(self):
        """Clear recorded phases for next tick."""
        self._last_tick_phases = []

    def check(self) -> HealthResult:
        """
        Verify last tick's phases were in order and complete.
        """
        if not self._last_tick_phases:
            return self.unknown(
                "No tick phases recorded - instrumentation not active",
                details={"phases_recorded": 0}
            )

        try:
            # Check completion
            phase_names = [p["name"] for p in self._last_tick_phases]
            missing_phases = [p for p in self.EXPECTED_PHASES if p not in phase_names]

            details = {
                "phases_recorded": phase_names,
                "expected_phases": self.EXPECTED_PHASES,
                "missing_phases": missing_phases,
            }

            if missing_phases:
                return self.error(
                    f"Incomplete tick: missing phases {missing_phases}",
                    details=details
                )

            # Check order
            order_correct = self._verify_order()
            details["order_correct"] = order_correct

            if not order_correct:
                return self.error(
                    "Phase order violation detected",
                    details=details
                )

            # Check timestamp monotonicity
            timestamps_ok, timestamp_details = self._verify_timestamps()
            details.update(timestamp_details)

            if not timestamps_ok:
                return self.warn(
                    "Phase timestamps not strictly increasing",
                    details=details
                )

            return self.ok(
                f"Tick integrity verified: {len(phase_names)} phases in order",
                details=details
            )

        except Exception as e:
            logger.exception(f"[{self.name}] Check failed")
            return self.unknown(f"Check failed: {e}")

    def _verify_order(self) -> bool:
        """Verify phases executed in expected order."""
        expected_order = {p: i for i, p in enumerate(self.EXPECTED_PHASES)}
        phase_indices = []

        for phase in self._last_tick_phases:
            name = phase["name"]
            if name in expected_order:
                phase_indices.append(expected_order[name])

        # Check if indices are monotonically increasing
        return phase_indices == sorted(phase_indices)

    def _verify_timestamps(self) -> tuple:
        """Verify phase timestamps are monotonically increasing."""
        if len(self._last_tick_phases) < 2:
            return True, {"timestamp_check": "skipped (< 2 phases)"}

        prev_end = None
        violations = []

        for phase in self._last_tick_phases:
            if prev_end and phase["start"] < prev_end:
                violations.append({
                    "phase": phase["name"],
                    "started_before_previous_ended": True
                })
            prev_end = phase["end"]

        return len(violations) == 0, {"timestamp_violations": violations}
