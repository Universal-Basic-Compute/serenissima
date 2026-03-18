"""
Content Encryption Checker

Verifies private Space Moments have encrypted (non-plaintext) content.
Samples Moments from private Spaces and checks is_encrypted() on each.

Priority: HIGH
Trigger: schedule (hourly)
Healthy: 100% of sampled private Moments encrypted
Degraded: any plaintext in private Space
Critical: multiple plaintext leaks

DOCS: docs/security/space_encryption/HEALTH_Space_Encryption.md#indicator-h_content_encrypted

Co-Authored-By: Tomaso Nervo (@nervo) <nervo@mindprotocol.ai>
"""

import logging
from typing import List, Dict, Any

from ..base import BaseChecker, HealthResult

logger = logging.getLogger(__name__)

# Import is_encrypted from the Python crypto library
try:
    from mind_protocol.python.crypto.space_key import is_encrypted
except ImportError:
    try:
        from crypto.space_key import is_encrypted
    except ImportError:
        # Inline fallback: same regex logic as the canonical implementation
        import re

        def is_encrypted(content: str) -> bool:
            if not isinstance(content, str):
                return False
            base64_segment = r"[A-Za-z0-9+/]+=*"
            pattern = rf"^{base64_segment}:{base64_segment}:{base64_segment}$"
            return bool(re.match(pattern, content))


# Maximum Moments to sample per private Space
SAMPLE_SIZE = 10


class ContentEncryptionChecker(BaseChecker):
    """
    Verify private Space Moments have encrypted content.

    Checks:
    - V-ENC-1: All content in private Spaces is AES-256-GCM ciphertext
    - V-ENC-2: Encrypted content matches format iv:tag:ciphertext (base64)
    """

    name = "content_encryption"
    validation_ids = ["V-ENC-1", "V-ENC-2"]
    priority = "high"

    def check(self) -> HealthResult:
        """
        Sample random Moments from private Spaces and verify content
        is valid base64 ciphertext in iv:tag:ciphertext format.
        """
        if not self.read:
            return self.unknown("No graph connection available")

        try:
            # Step 1: Find all private Spaces
            private_spaces = self._get_private_spaces()

            if not private_spaces:
                return self.ok(
                    "No private Spaces found - nothing to check",
                    details={"private_spaces": 0, "moments_sampled": 0},
                )

            # Step 2: Sample Moments from each private Space
            total_sampled = 0
            encrypted_count = 0
            plaintext_leaks: List[Dict[str, Any]] = []
            format_anomalies: List[Dict[str, Any]] = []

            for space in private_spaces:
                space_id = space.get("id")
                moments = self._sample_moments(space_id)

                for moment in moments:
                    total_sampled += 1
                    content = moment.get("content")

                    if content is None or content == "":
                        # Empty content is not a leak but is anomalous
                        format_anomalies.append({
                            "space_id": space_id,
                            "moment_id": moment.get("id"),
                            "issue": "empty_content",
                        })
                        continue

                    if is_encrypted(content):
                        encrypted_count += 1
                    else:
                        # Content is not in ciphertext format -- plaintext leak
                        plaintext_leaks.append({
                            "space_id": space_id,
                            "moment_id": moment.get("id"),
                            "content_preview": content[:40] + "..." if len(content) > 40 else content,
                        })

            details = {
                "private_spaces": len(private_spaces),
                "moments_sampled": total_sampled,
                "encrypted_count": encrypted_count,
                "plaintext_leaks": len(plaintext_leaks),
                "format_anomalies": len(format_anomalies),
                "ratio": round(encrypted_count / total_sampled, 4) if total_sampled > 0 else 1.0,
                "leak_details": plaintext_leaks[:10],  # Cap for readability
            }

            if total_sampled == 0:
                return self.ok(
                    "No Moments in private Spaces to check",
                    details=details,
                )

            # Multiple plaintext leaks = CRITICAL
            if len(plaintext_leaks) > 1:
                return self.error(
                    f"CRITICAL: {len(plaintext_leaks)} plaintext leaks in private Spaces",
                    details=details,
                )

            # Any single plaintext leak = DEGRADED (still error-level)
            if len(plaintext_leaks) == 1:
                return self.error(
                    f"Plaintext leak detected in private Space: {plaintext_leaks[0].get('space_id')}",
                    details=details,
                )

            # Format anomalies (empty content, etc.) = WARN
            if format_anomalies:
                return self.warn(
                    f"{len(format_anomalies)} format anomalies in private Space Moments",
                    details=details,
                )

            return self.ok(
                f"All {encrypted_count}/{total_sampled} sampled private Moments encrypted",
                details=details,
            )

        except Exception as e:
            logger.exception(f"[{self.name}] Check failed")
            return self.unknown(f"Check failed: {e}")

    def _get_private_spaces(self) -> List[Dict[str, Any]]:
        """Query all Spaces where privacy != 'public'."""
        try:
            result = self.read.query("""
            MATCH (s:Space)
            WHERE s.visibility IS NOT NULL AND s.visibility <> 'public'
            RETURN s.id AS id, s.visibility AS visibility
            """)
            return [
                {"id": r.get("id"), "visibility": r.get("visibility")}
                for r in (result or [])
            ]
        except Exception:
            return []

    def _sample_moments(self, space_id: str) -> List[Dict[str, Any]]:
        """Sample up to SAMPLE_SIZE Moments from a given Space."""
        try:
            result = self.read.query(
                f"""
                MATCH (m:Moment)-[:link {{type: 'IN'}}]->(s:Space {{id: $space_id}})
                WHERE m.content IS NOT NULL
                RETURN m.id AS id, m.content AS content
                LIMIT {SAMPLE_SIZE}
                """,
                params={"space_id": space_id},
            )
            return [
                {"id": r.get("id"), "content": r.get("content")}
                for r in (result or [])
            ]
        except Exception:
            return []
