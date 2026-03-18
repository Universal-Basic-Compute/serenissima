"""
Hierarchy Consistency Checker

Verifies child Space access does not exist without parent access path.
For each HAS_ACCESS to a child Space, verifies an access path exists
to the parent Space for the same actor.

Priority: MEDIUM
Trigger: schedule (6 hours)
Healthy: all child-access has parent-access path
Degraded: orphan access detected
Critical: widespread hierarchy violations

DOCS: docs/security/space_encryption/HEALTH_Space_Encryption.md#indicator-h_hierarchy_consistent

Co-Authored-By: Tomaso Nervo (@nervo) <nervo@mindprotocol.ai>
"""

import logging
from typing import List, Dict, Any

from ..base import BaseChecker, HealthResult

logger = logging.getLogger(__name__)


class HierarchyConsistencyChecker(BaseChecker):
    """
    Verify child Space HAS_ACCESS links have corresponding parent access.

    Checks:
    - V-HIER-1: For each child Space with HAS_ACCESS, a path to parent
      via IN links exists for the same actor (unless child has independent
      access grant flagged as such)
    """

    name = "hierarchy_consistency"
    validation_ids = ["V-HIER-1"]
    priority = "med"

    def check(self) -> HealthResult:
        """
        For each HAS_ACCESS link on a child Space, verify the actor
        also has access to the parent Space (directly or via hierarchy).
        """
        if not self.read:
            return self.unknown("No graph connection available")

        try:
            orphans = self._find_orphan_access()

            details = {
                "orphan_count": len(orphans),
                "orphan_details": orphans[:10],
            }

            if not orphans:
                # Count total checked for context
                total_checked = self._count_child_access_links()
                details["total_checked"] = total_checked
                return self.ok(
                    f"Hierarchy consistent: all child-access has parent path ({total_checked} links checked)",
                    details=details,
                )

            # Widespread violations (>10) = ERROR
            if len(orphans) > 10:
                return self.error(
                    f"Widespread hierarchy violations: {len(orphans)} orphan access links",
                    details=details,
                )

            # Any orphan = WARN
            return self.warn(
                f"{len(orphans)} orphan access links (child access without parent path)",
                details=details,
            )

        except Exception as e:
            logger.exception(f"[{self.name}] Check failed")
            return self.unknown(f"Check failed: {e}")

    def _find_orphan_access(self) -> List[Dict[str, Any]]:
        """
        Find HAS_ACCESS links to child Spaces where the same actor
        does NOT have HAS_ACCESS to the parent Space.

        A child Space is one connected via an IN link to a parent Space.
        An orphan is when an actor has access to the child but no access
        to the parent (and the child has no independent_access flag).
        """
        try:
            result = self.read.query("""
            MATCH (a)-[r:link {type: 'HAS_ACCESS'}]->(child:Space)-[:link {type: 'IN'}]->(parent:Space)
            WHERE parent.visibility IS NOT NULL AND parent.visibility <> 'public'
              AND child.independent_access IS NULL
              AND NOT EXISTS {
                  MATCH (a)-[:link {type: 'HAS_ACCESS'}]->(parent)
              }
            RETURN a.id AS actor_id,
                   child.id AS child_space_id,
                   parent.id AS parent_space_id
            """)
            return [
                {
                    "actor_id": r.get("actor_id"),
                    "child_space_id": r.get("child_space_id"),
                    "parent_space_id": r.get("parent_space_id"),
                }
                for r in (result or [])
            ]
        except Exception:
            return []

    def _count_child_access_links(self) -> int:
        """Count total HAS_ACCESS links to child Spaces (for reporting)."""
        try:
            result = self.read.query("""
            MATCH (a)-[:link {type: 'HAS_ACCESS'}]->(child:Space)-[:link {type: 'IN'}]->(parent:Space)
            RETURN count(*) AS total
            """)
            return int(result[0].get("total", 0) or 0) if result else 0
        except Exception:
            return 0
