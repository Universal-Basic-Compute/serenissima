"""
Link State Checker

Verifies V-LINK-ALIVE and V-LINK-BOUNDED invariants.

DOCS: docs/physics/HEALTH_Energy_Physics.md#indicator-link_hot_cold_ratio
"""

import logging
from typing import Tuple

from ..base import BaseChecker, HealthResult

logger = logging.getLogger(__name__)

# Default cold threshold from constants
COLD_THRESHOLD = 0.01


class LinkStateChecker(BaseChecker):
    """
    Verify healthy ratio of hot to cold links.

    Checks:
    - V-LINK-ALIVE: At least 10% hot during active scene
    - V-LINK-BOUNDED: No more than 50% hot normally, 80% peak
    """

    name = "link_state"
    validation_ids = ["V-LINK-ALIVE", "V-LINK-BOUNDED"]
    priority = "high"

    # Thresholds
    MIN_HOT_RATIO = 0.1    # At least 10% hot
    MAX_HOT_RATIO = 0.5    # No more than 50% hot normally
    PEAK_HOT_RATIO = 0.8   # Error threshold

    def check(self) -> HealthResult:
        """
        Count hot vs cold links and verify ratio.
        """
        if not self.read:
            return self.unknown("No graph connection available")

        try:
            hot_count, cold_count, total_count = self._count_hot_cold_links()

            if total_count == 0:
                return self.ok(
                    "No links to check",
                    details={"total_links": 0}
                )

            ratio = hot_count / total_count

            details = {
                "hot_links": hot_count,
                "cold_links": cold_count,
                "total_links": total_count,
                "hot_ratio": round(ratio, 4),
                "threshold": COLD_THRESHOLD,
            }

            # Check for dead world
            if hot_count == 0:
                return self.error(
                    "World dead: zero hot links",
                    details=details
                )

            # Check bounds
            if ratio > self.PEAK_HOT_RATIO:
                return self.error(
                    f"Memory explosion: {ratio:.1%} hot (>{self.PEAK_HOT_RATIO:.0%})",
                    details=details
                )
            elif ratio > self.MAX_HOT_RATIO:
                return self.warn(
                    f"World heating: {ratio:.1%} hot (>{self.MAX_HOT_RATIO:.0%})",
                    details=details
                )
            elif ratio < self.MIN_HOT_RATIO:
                return self.warn(
                    f"World cooling: {ratio:.1%} hot (<{self.MIN_HOT_RATIO:.0%})",
                    details=details
                )
            else:
                return self.ok(
                    f"Link ratio healthy: {ratio:.1%} hot",
                    details=details
                )

        except Exception as e:
            logger.exception(f"[{self.name}] Check failed")
            return self.unknown(f"Check failed: {e}")

    def _count_hot_cold_links(self) -> Tuple[int, int, int]:
        """
        Count hot and cold links.

        Hot: energy × weight > COLD_THRESHOLD
        Cold: energy × weight <= COLD_THRESHOLD
        """
        try:
            result = self.read.query(f"""
            MATCH ()-[r]->()
            WHERE r.energy IS NOT NULL
            RETURN
                sum(CASE WHEN r.energy * coalesce(r.weight, 1.0) > {COLD_THRESHOLD} THEN 1 ELSE 0 END) AS hot,
                sum(CASE WHEN r.energy * coalesce(r.weight, 1.0) <= {COLD_THRESHOLD} THEN 1 ELSE 0 END) AS cold,
                count(r) AS total
            """)

            if result:
                return (
                    int(result[0].get('hot', 0) or 0),
                    int(result[0].get('cold', 0) or 0),
                    int(result[0].get('total', 0) or 0)
                )
            return (0, 0, 0)
        except:
            return (0, 0, 0)
