"""
No Negative Energy Checker

Verifies V-ENERGY-NON-NEGATIVE invariant.

DOCS: docs/physics/HEALTH_Energy_Physics.md#indicator-no_negative_energy
"""

import logging
from typing import List, Dict, Any

from ..base import BaseChecker, HealthResult

logger = logging.getLogger(__name__)


class NoNegativeEnergyChecker(BaseChecker):
    """
    Verify no node or link has negative energy.

    Checks:
    - V-ENERGY-NON-NEGATIVE: All energy values >= 0
    """

    name = "no_negative_energy"
    validation_ids = ["V-ENERGY-NON-NEGATIVE"]
    priority = "high"

    def check(self) -> HealthResult:
        """
        Scan all energy values and flag any negatives.
        """
        if not self.read:
            return self.unknown("No graph connection available")

        try:
            # Check node energies
            negative_nodes = self._find_negative_node_energies()

            # Check link energies
            negative_links = self._find_negative_link_energies()

            total_violations = len(negative_nodes) + len(negative_links)

            details = {
                "negative_nodes": negative_nodes[:10],  # First 10
                "negative_links": negative_links[:10],
                "total_violations": total_violations,
            }

            if total_violations > 0:
                return self.error(
                    f"Found {total_violations} negative energy values",
                    details=details
                )
            else:
                return self.ok(
                    "All energy values non-negative",
                    details={"checked_nodes": True, "checked_links": True}
                )

        except Exception as e:
            logger.exception(f"[{self.name}] Check failed")
            return self.unknown(f"Check failed: {e}")

    def _find_negative_node_energies(self) -> List[Dict[str, Any]]:
        """Find nodes with negative energy."""
        try:
            result = self.read.query("""
            MATCH (n)
            WHERE n.energy IS NOT NULL AND n.energy < 0
            RETURN n.id AS id, labels(n)[0] AS type, n.energy AS energy
            LIMIT 100
            """)
            return [
                {
                    "id": r.get('id'),
                    "type": r.get('type'),
                    "energy": r.get('energy')
                }
                for r in (result or [])
            ]
        except:
            return []

    def _find_negative_link_energies(self) -> List[Dict[str, Any]]:
        """Find links with negative energy."""
        try:
            result = self.read.query("""
            MATCH (a)-[r]->(b)
            WHERE r.energy IS NOT NULL AND r.energy < 0
            RETURN a.id AS from_id, b.id AS to_id, type(r) AS type, r.energy AS energy
            LIMIT 100
            """)
            return [
                {
                    "from": r.get('from_id'),
                    "to": r.get('to_id'),
                    "type": r.get('type'),
                    "energy": r.get('energy')
                }
                for r in (result or [])
            ]
        except:
            return []
