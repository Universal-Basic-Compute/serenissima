"""
Private Key Scan Checker

Detects private key material in graph properties. Any match is CRITICAL --
a private key in the graph means full compromise of all Spaces that actor
has access to.

Priority: CRITICAL (page on detection)
Trigger: schedule (hourly)
Healthy: no private key patterns found
Critical: any private key material detected

DOCS: docs/security/space_encryption/HEALTH_Space_Encryption.md#indicator-h_no_private_keys

Co-Authored-By: Tomaso Nervo (@nervo) <nervo@mindprotocol.ai>
"""

import re
import logging
from typing import List, Dict, Any

from ..base import BaseChecker, HealthResult

logger = logging.getLogger(__name__)

# Patterns that indicate private key material
PEM_PATTERNS = [
    r"-----BEGIN PRIVATE KEY-----",
    r"-----BEGIN EC PRIVATE KEY-----",
    r"-----BEGIN RSA PRIVATE KEY-----",
    r"-----BEGIN ENCRYPTED PRIVATE KEY-----",
    r"-----BEGIN DSA PRIVATE KEY-----",
    r"-----BEGIN OPENSSH PRIVATE KEY-----",
]

# Compile a single regex that matches any PEM header
_PEM_REGEX = re.compile("|".join(PEM_PATTERNS))

# Raw key detection: base64 strings of exactly 32 or 64 bytes (44 or 88 base64 chars)
# These are suspicious if they appear in properties that are NOT encrypted_key or public_key
_RAW_KEY_32_REGEX = re.compile(r"^[A-Za-z0-9+/]{43}=$")      # 32 bytes in base64
_RAW_KEY_64_REGEX = re.compile(r"^[A-Za-z0-9+/]{86}==$")     # 64 bytes in base64

# Properties that are EXPECTED to contain key-like base64 -- skip these
SAFE_KEY_PROPERTIES = {"encrypted_key", "public_key", "space_key_encrypted"}


class PrivateKeyScanChecker(BaseChecker):
    """
    Scan all node and link properties for private key patterns.

    Checks:
    - V-SEC-1: No private key material (PEM headers, raw 32/64-byte keys)
      in any graph property
    """

    name = "private_key_scan"
    validation_ids = ["V-SEC-1"]
    priority = "high"  # Operational priority: CRITICAL (pages on detection)

    def check(self) -> HealthResult:
        """
        Scan Actor node properties and HAS_ACCESS link properties
        for PEM headers and raw key patterns.
        """
        if not self.read:
            return self.unknown("No graph connection available")

        try:
            findings: List[Dict[str, Any]] = []

            # Scan 1: PEM headers in Actor node properties
            pem_in_actors = self._scan_actor_properties_for_pem()
            findings.extend(pem_in_actors)

            # Scan 2: PEM headers in HAS_ACCESS link properties
            pem_in_links = self._scan_link_properties_for_pem()
            findings.extend(pem_in_links)

            # Scan 3: Raw key patterns in Actor properties (non-safe fields)
            raw_in_actors = self._scan_actor_properties_for_raw_keys()
            findings.extend(raw_in_actors)

            # Scan 4: PEM headers in ALL node properties (catch-all)
            pem_in_all = self._scan_all_node_properties_for_pem()
            findings.extend(pem_in_all)

            details = {
                "total_findings": len(findings),
                "finding_details": findings[:20],  # Cap at 20 for readability
                "scans_completed": [
                    "actor_pem",
                    "link_pem",
                    "actor_raw_keys",
                    "all_node_pem",
                ],
            }

            if findings:
                return self.error(
                    f"CRITICAL: {len(findings)} private key pattern(s) detected in graph -- full compromise possible",
                    details=details,
                )

            return self.ok(
                "No private key material found in graph",
                details=details,
            )

        except Exception as e:
            logger.exception(f"[{self.name}] Check failed")
            return self.unknown(f"Check failed: {e}")

    def _scan_actor_properties_for_pem(self) -> List[Dict[str, Any]]:
        """Scan all string properties on Actor nodes for PEM headers."""
        try:
            # Query returns all Actor nodes; we check properties client-side
            result = self.read.query("""
            MATCH (a:Actor)
            RETURN a.id AS id, properties(a) AS props
            LIMIT 1000
            """)

            findings = []
            for row in (result or []):
                actor_id = row.get("id")
                props = row.get("props", {})
                if not isinstance(props, dict):
                    continue
                for key, value in props.items():
                    if isinstance(value, str) and _PEM_REGEX.search(value):
                        findings.append({
                            "location": "Actor",
                            "node_id": actor_id,
                            "property": key,
                            "pattern": "PEM_HEADER",
                        })
            return findings
        except Exception:
            return []

    def _scan_link_properties_for_pem(self) -> List[Dict[str, Any]]:
        """Scan all string properties on HAS_ACCESS links for PEM headers."""
        try:
            result = self.read.query("""
            MATCH (a)-[r:link {type: 'HAS_ACCESS'}]->(s:Space)
            RETURN a.id AS actor_id, s.id AS space_id, properties(r) AS props
            LIMIT 1000
            """)

            findings = []
            for row in (result or []):
                props = row.get("props", {})
                if not isinstance(props, dict):
                    continue
                for key, value in props.items():
                    if isinstance(value, str) and _PEM_REGEX.search(value):
                        findings.append({
                            "location": "HAS_ACCESS",
                            "actor_id": row.get("actor_id"),
                            "space_id": row.get("space_id"),
                            "property": key,
                            "pattern": "PEM_HEADER",
                        })
            return findings
        except Exception:
            return []

    def _scan_actor_properties_for_raw_keys(self) -> List[Dict[str, Any]]:
        """
        Scan Actor node string properties for raw base64 strings
        that look like 32-byte or 64-byte keys, excluding known-safe
        property names.
        """
        try:
            result = self.read.query("""
            MATCH (a:Actor)
            RETURN a.id AS id, properties(a) AS props
            LIMIT 1000
            """)

            findings = []
            for row in (result or []):
                actor_id = row.get("id")
                props = row.get("props", {})
                if not isinstance(props, dict):
                    continue
                for key, value in props.items():
                    if key in SAFE_KEY_PROPERTIES:
                        continue
                    if not isinstance(value, str):
                        continue
                    if _RAW_KEY_32_REGEX.match(value) or _RAW_KEY_64_REGEX.match(value):
                        findings.append({
                            "location": "Actor",
                            "node_id": actor_id,
                            "property": key,
                            "pattern": "RAW_KEY_BYTES",
                        })
            return findings
        except Exception:
            return []

    def _scan_all_node_properties_for_pem(self) -> List[Dict[str, Any]]:
        """
        Catch-all: scan ALL node types for PEM headers.
        This catches keys leaked to Moment, Space, or any other node type.
        """
        try:
            result = self.read.query("""
            MATCH (n)
            WHERE NOT n:Actor
            RETURN labels(n)[0] AS label, n.id AS id, properties(n) AS props
            LIMIT 2000
            """)

            findings = []
            for row in (result or []):
                props = row.get("props", {})
                if not isinstance(props, dict):
                    continue
                for key, value in props.items():
                    if isinstance(value, str) and _PEM_REGEX.search(value):
                        findings.append({
                            "location": row.get("label", "Unknown"),
                            "node_id": row.get("id"),
                            "property": key,
                            "pattern": "PEM_HEADER",
                        })
            return findings
        except Exception:
            return []
