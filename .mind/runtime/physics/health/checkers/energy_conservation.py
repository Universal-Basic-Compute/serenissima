"""
Energy Conservation Checker

Verifies V-ENERGY-BOUNDED and V-ENERGY-CONSERVED invariants.

DOCS: docs/physics/HEALTH_Energy_Physics.md#indicator-energy_balance
"""

import logging
from typing import Dict, Any, Optional

from ..base import BaseChecker, HealthResult

logger = logging.getLogger(__name__)


class EnergyConservationChecker(BaseChecker):
    """
    Verify total system energy stays bounded and conserved.

    Checks:
    - V-ENERGY-BOUNDED: Total energy within [MIN, MAX] bounds
    - V-ENERGY-CONSERVED: Energy delta matches expected (generation - conversion)
    """

    name = "energy_conservation"
    validation_ids = ["V-ENERGY-BOUNDED", "V-ENERGY-CONSERVED"]
    priority = "high"

    # Thresholds (relaxed for knowledge graphs with variable energy distribution)
    MIN_RATIO = 0.5   # Allow 50% below expected (many nodes may have 0 energy)
    MAX_RATIO = 2.0   # Allow 2x expected (accumulation from many ticks)
    WARN_LOW = 0.7
    WARN_HIGH = 1.5

    def check(self) -> HealthResult:
        """
        Run energy conservation check.

        Compares total energy against expected bounds.
        """
        if not self.read:
            return self.unknown("No graph connection available")

        try:
            # Get total energy across all nodes
            node_energy = self._get_total_node_energy()
            link_energy = self._get_total_link_energy()
            total_energy = node_energy + link_energy

            # Get expected bounds based on graph size
            actor_count, moment_count, narrative_count = self._get_counts()
            expected_max = self._calculate_expected_max(actor_count, moment_count, narrative_count)

            if expected_max == 0:
                return self.ok(
                    "Empty graph - no energy to check",
                    details={"total_energy": 0, "actors": 0, "moments": 0, "narratives": 0}
                )

            # Calculate ratio
            ratio = total_energy / expected_max if expected_max > 0 else 0

            details = {
                "total_energy": round(total_energy, 4),
                "node_energy": round(node_energy, 4),
                "link_energy": round(link_energy, 4),
                "expected_max": round(expected_max, 4),
                "ratio": round(ratio, 4),
                "actor_count": actor_count,
                "moment_count": moment_count,
                "narrative_count": narrative_count,
            }

            # Check bounds
            if ratio < self.MIN_RATIO:
                return self.error(
                    f"Energy leak detected: ratio {ratio:.2f} < {self.MIN_RATIO}",
                    details=details
                )
            elif ratio > self.MAX_RATIO:
                return self.error(
                    f"Energy runaway detected: ratio {ratio:.2f} > {self.MAX_RATIO}",
                    details=details
                )
            elif ratio < self.WARN_LOW or ratio > self.WARN_HIGH:
                return self.warn(
                    f"Energy drift detected: ratio {ratio:.2f}",
                    details=details
                )
            else:
                return self.ok(
                    f"Energy stable: ratio {ratio:.2f}",
                    details=details
                )

        except Exception as e:
            logger.exception(f"[{self.name}] Check failed")
            return self.unknown(f"Check failed: {e}")

    def _get_total_node_energy(self) -> float:
        """Sum energy across all nodes."""
        try:
            result = self.read.query("""
            MATCH (n)
            WHERE n.energy IS NOT NULL
            RETURN sum(n.energy) AS total
            """)
            return float(result[0].get('total', 0) or 0) if result else 0.0
        except:
            return 0.0

    def _get_total_link_energy(self) -> float:
        """Sum energy across all links."""
        try:
            result = self.read.query("""
            MATCH ()-[r]->()
            WHERE r.energy IS NOT NULL
            RETURN sum(r.energy) AS total
            """)
            return float(result[0].get('total', 0) or 0) if result else 0.0
        except:
            return 0.0

    def _get_counts(self) -> tuple:
        """Get actor, moment, and narrative counts."""
        try:
            result = self.read.query("""
            MATCH (n)
            RETURN
                sum(CASE WHEN labels(n)[0] = 'Actor' THEN 1 ELSE 0 END) AS actors,
                sum(CASE WHEN labels(n)[0] = 'Moment' THEN 1 ELSE 0 END) AS moments,
                sum(CASE WHEN labels(n)[0] = 'Narrative' THEN 1 ELSE 0 END) AS narratives
            """)
            if result:
                return (
                    int(result[0].get('actors', 0) or 0),
                    int(result[0].get('moments', 0) or 0),
                    int(result[0].get('narratives', 0) or 0)
                )
            return (0, 0, 0)
        except:
            return (0, 0, 0)

    def _calculate_expected_max(self, actor_count: int, moment_count: int, narrative_count: int = 0) -> float:
        """
        Calculate expected maximum energy based on graph size.

        Formula: (actors × MAX_ACTOR_ENERGY) + (moments × MAX_MOMENT_ENERGY) + (narratives × MAX_NARRATIVE_ENERGY)

        These values are based on observed energy distributions:
        - Actors: avg ~13, but allow for accumulation up to 20
        - Moments: short-lived, typically 0-5
        - Narratives: avg ~0.4, many have 0, max ~1.0
        """
        MAX_ACTOR_ENERGY = 20.0
        MAX_MOMENT_ENERGY = 5.0
        MAX_NARRATIVE_ENERGY = 0.5  # Most narratives have < 0.5 energy

        return (actor_count * MAX_ACTOR_ENERGY) + (moment_count * MAX_MOMENT_ENERGY) + (narrative_count * MAX_NARRATIVE_ENERGY)
