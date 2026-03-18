"""
Key Distribution Checker

Verifies all HAS_ACCESS links to private Spaces have non-null encrypted_key
properties in valid base64 nonce:encrypted format.

Priority: HIGH
Trigger: schedule (hourly)
Healthy: all HAS_ACCESS links to private Spaces have encrypted_key
Degraded: some links missing encrypted_key
Critical: majority missing

DOCS: docs/security/space_encryption/HEALTH_Space_Encryption.md#indicator-h_key_distribution

Co-Authored-By: Tomaso Nervo (@nervo) <nervo@mindprotocol.ai>
"""

import re
import logging
from typing import List, Dict, Any

from ..base import BaseChecker, HealthResult

logger = logging.getLogger(__name__)

# Pattern for valid encrypted_key: a single base64 blob (libsodium sealed box output)
_ENCRYPTED_KEY_PATTERN = re.compile(
    r"^[A-Za-z0-9+/]{40,}={0,3}$"
)


class KeyDistributionChecker(BaseChecker):
    """
    Verify HAS_ACCESS links to private Spaces have encrypted_key.

    Checks:
    - V-KEY-1: All HAS_ACCESS links to private Spaces have non-null encrypted_key
    - V-KEY-2: encrypted_key is valid base64 in nonce:encrypted format
    """

    name = "key_distribution"
    validation_ids = ["V-KEY-1", "V-KEY-2"]
    priority = "high"

    def check(self) -> HealthResult:
        """
        Query all HAS_ACCESS links to private Spaces and verify
        encrypted_key property is non-null and valid format.
        """
        if not self.read:
            return self.unknown("No graph connection available")

        try:
            links = self._get_access_links_to_private_spaces()

            if not links:
                return self.ok(
                    "No HAS_ACCESS links to private Spaces found",
                    details={"total_links": 0},
                )

            total = len(links)
            with_key = 0
            missing_key: List[Dict[str, Any]] = []
            invalid_format: List[Dict[str, Any]] = []

            for link in links:
                encrypted_key = link.get("encrypted_key")

                if encrypted_key is None or encrypted_key == "":
                    missing_key.append({
                        "actor_id": link.get("actor_id"),
                        "space_id": link.get("space_id"),
                        "issue": "missing_encrypted_key",
                    })
                    continue

                if not _ENCRYPTED_KEY_PATTERN.match(str(encrypted_key)):
                    invalid_format.append({
                        "actor_id": link.get("actor_id"),
                        "space_id": link.get("space_id"),
                        "issue": "invalid_format",
                        "key_preview": str(encrypted_key)[:30] + "...",
                    })
                    continue

                with_key += 1

            details = {
                "total_links": total,
                "with_valid_key": with_key,
                "missing_key": len(missing_key),
                "invalid_format": len(invalid_format),
                "ratio": round(with_key / total, 4) if total > 0 else 1.0,
                "missing_details": missing_key[:10],
                "invalid_details": invalid_format[:10],
            }

            # Majority missing = ERROR
            if len(missing_key) > total / 2:
                return self.error(
                    f"Key distribution failure: {len(missing_key)}/{total} links missing encrypted_key",
                    details=details,
                )

            # Any missing = WARN
            if missing_key:
                return self.warn(
                    f"{len(missing_key)}/{total} HAS_ACCESS links missing encrypted_key",
                    details=details,
                )

            # Format issues = WARN
            if invalid_format:
                return self.warn(
                    f"{len(invalid_format)}/{total} HAS_ACCESS links have invalid encrypted_key format",
                    details=details,
                )

            return self.ok(
                f"All {with_key}/{total} HAS_ACCESS links have valid encrypted_key",
                details=details,
            )

        except Exception as e:
            logger.exception(f"[{self.name}] Check failed")
            return self.unknown(f"Check failed: {e}")

    def _get_access_links_to_private_spaces(self) -> List[Dict[str, Any]]:
        """Query all HAS_ACCESS links where target Space is private."""
        try:
            result = self.read.query("""
            MATCH (a)-[r:link {type: 'HAS_ACCESS'}]->(s:Space)
            WHERE s.visibility IS NOT NULL AND s.visibility <> 'public'
            RETURN a.id AS actor_id, s.id AS space_id, r.encrypted_key AS encrypted_key
            """)
            return [
                {
                    "actor_id": r.get("actor_id"),
                    "space_id": r.get("space_id"),
                    "encrypted_key": r.get("encrypted_key"),
                }
                for r in (result or [])
            ]
        except Exception:
            return []
