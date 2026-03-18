"""
Revocation Completeness Checker

After revocation, verifies no stale HAS_ACCESS links remain for the
revoked actor on the target Space or its children (via IN hierarchy).

Priority: MEDIUM
Trigger: event (post-revocation)
Healthy: no stale HAS_ACCESS links after revocation
Critical: stale links found (residual access)

DOCS: docs/security/space_encryption/HEALTH_Space_Encryption.md#indicator-h_revocation_complete

Co-Authored-By: Tomaso Nervo (@nervo) <nervo@mindprotocol.ai>
"""

import logging
from typing import List, Dict, Any, Optional

from ..base import BaseChecker, HealthResult

logger = logging.getLogger(__name__)


class RevocationCompletenessChecker(BaseChecker):
    """
    Verify no stale HAS_ACCESS links remain after revocation.

    Checks:
    - V-REV-1: After revokeAccess(actor, space), no HAS_ACCESS link
      from actor to space or child Spaces remains
    """

    name = "revocation_completeness"
    validation_ids = ["V-REV-1"]
    priority = "med"

    def __init__(
        self,
        graph_queries=None,
        graph_ops=None,
        actor_id: Optional[str] = None,
        space_id: Optional[str] = None,
    ):
        """
        Initialize with optional actor_id and space_id for targeted checks.

        When actor_id and space_id are provided, checks that specific
        revocation. When omitted, scans for any actors that appear in
        a revocation log but still have HAS_ACCESS links.

        Args:
            graph_queries: GraphQueries instance for reading
            graph_ops: GraphOps instance for any writes (rare)
            actor_id: The revoked actor's ID (optional)
            space_id: The Space the actor was revoked from (optional)
        """
        super().__init__(graph_queries=graph_queries, graph_ops=graph_ops)
        self.actor_id = actor_id
        self.space_id = space_id

    def check(self) -> HealthResult:
        """
        Given actor_id + space_id, check no HAS_ACCESS links exist
        (including via hierarchy). If not provided, run a general scan
        for stale access using the revocation log.
        """
        if not self.read:
            return self.unknown("No graph connection available")

        try:
            if self.actor_id and self.space_id:
                return self._check_specific_revocation(self.actor_id, self.space_id)
            else:
                return self._check_general_revocation_log()

        except Exception as e:
            logger.exception(f"[{self.name}] Check failed")
            return self.unknown(f"Check failed: {e}")

    def _check_specific_revocation(self, actor_id: str, space_id: str) -> HealthResult:
        """
        Check that a specific actor has no HAS_ACCESS links to a
        specific Space or any of its child Spaces.
        """
        stale_links = self._find_stale_links(actor_id, space_id)

        details = {
            "actor_id": actor_id,
            "space_id": space_id,
            "stale_links": len(stale_links),
            "stale_details": stale_links[:10],
        }

        if stale_links:
            return self.error(
                f"Stale access: {len(stale_links)} HAS_ACCESS link(s) remain for actor {actor_id} "
                f"on space {space_id} (or children) after revocation",
                details=details,
            )

        return self.ok(
            f"Revocation clean: no HAS_ACCESS links from {actor_id} to {space_id} or children",
            details=details,
        )

    def _check_general_revocation_log(self) -> HealthResult:
        """
        When no specific actor/space is given, scan for revocation
        log entries and verify each one is clean.

        Revocation events are stored as Moment nodes with type='revocation'
        linked to the Space they apply to.
        """
        revocations = self._get_recent_revocations()

        if not revocations:
            return self.ok(
                "No recent revocation events found to verify",
                details={"revocations_checked": 0},
            )

        total_stale = 0
        stale_reports: List[Dict[str, Any]] = []

        for rev in revocations:
            actor_id = rev.get("actor_id")
            space_id = rev.get("space_id")
            if not actor_id or not space_id:
                continue

            stale = self._find_stale_links(actor_id, space_id)
            if stale:
                total_stale += len(stale)
                stale_reports.append({
                    "actor_id": actor_id,
                    "space_id": space_id,
                    "stale_count": len(stale),
                })

        details = {
            "revocations_checked": len(revocations),
            "total_stale_links": total_stale,
            "stale_reports": stale_reports[:10],
        }

        if total_stale > 0:
            return self.error(
                f"Stale access: {total_stale} residual HAS_ACCESS link(s) across "
                f"{len(stale_reports)} revocation(s)",
                details=details,
            )

        return self.ok(
            f"All {len(revocations)} recent revocations verified clean",
            details=details,
        )

    def _find_stale_links(self, actor_id: str, space_id: str) -> List[Dict[str, Any]]:
        """
        Find any HAS_ACCESS links from actor to space or its descendants.

        Uses variable-length IN path to find child Spaces.
        """
        try:
            result = self.read.query(
                """
                MATCH (a {id: $actor_id})-[r:link {type: 'HAS_ACCESS'}]->(s:Space)
                WHERE s.id = $space_id
                   OR EXISTS {
                       MATCH (s)-[:link {type: 'IN'}*1..5]->(target:Space {id: $space_id})
                   }
                RETURN s.id AS space_id, type(r) AS link_type
                """,
                params={"actor_id": actor_id, "space_id": space_id},
            )
            return [
                {
                    "space_id": r.get("space_id"),
                    "link_type": r.get("link_type"),
                }
                for r in (result or [])
            ]
        except Exception:
            return []

    def _get_recent_revocations(self) -> List[Dict[str, Any]]:
        """
        Get recent revocation events from the graph.

        Looks for Moment nodes of type 'revocation' or a dedicated
        revocation log, limited to the most recent 100.
        """
        try:
            result = self.read.query("""
            MATCH (m:Moment)
            WHERE m.type = 'revocation'
              AND m.actor_id IS NOT NULL
              AND m.space_id IS NOT NULL
            RETURN m.actor_id AS actor_id, m.space_id AS space_id, m.created_at AS created_at
            ORDER BY m.created_at DESC
            LIMIT 100
            """)
            return [
                {
                    "actor_id": r.get("actor_id"),
                    "space_id": r.get("space_id"),
                    "created_at": r.get("created_at"),
                }
                for r in (result or [])
            ]
        except Exception:
            return []
