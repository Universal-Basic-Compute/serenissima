"""
Consent Gate & Bond Validator — graph-native consent enforcement.

Spec: docs/human_integration/ALGORITHM_Human_Integration.md (check_consent, revoke_consent)
      docs/human_integration/VALIDATION_Human_Integration.md (V2, V4, V6)

Consent is a `thing` node in the AI's brain with type: consent_record.
Every ingestion pipeline calls check_consent() before processing any data.
No exceptions, no fallbacks — if consent is not granted, data is discarded.

The bond validator ensures a 1:1 pairing bond link exists between the AI
citizen and its human partner before any ingestion can proceed.
"""

from __future__ import annotations

import logging
import time
from typing import Any, Optional, Protocol

logger = logging.getLogger("ingestion.consent_gate")

# The six data streams that require independent consent
VALID_STREAMS = frozenset({
    "voice",
    "garmin",
    "desktop",
    "blockchain",
    "ai_messages",
    "direct_chat",
})


class GraphAdapter(Protocol):
    """Minimal interface for graph operations needed by consent gate.

    Any object implementing these methods can serve as the graph backend.
    """

    def query_nodes(
        self, node_type: str, filters: dict[str, Any]
    ) -> list[dict[str, Any]]:
        """Query nodes by type and content filters.

        Returns list of node dicts with at minimum: id, type, content, weight,
        energy, stability, synthesis, partner_relevance.
        """
        ...

    def create_node(self, node_data: dict[str, Any]) -> str:
        """Create a node and return its ID."""
        ...

    def update_node(self, node_id: str, updates: dict[str, Any]) -> None:
        """Update fields on an existing node."""
        ...

    def query_links(
        self, source_id: Optional[str] = None, target_id: Optional[str] = None,
        link_type: Optional[str] = None,
    ) -> list[dict[str, Any]]:
        """Query links by source, target, and/or type."""
        ...


def _validate_stream(stream_name: str) -> None:
    """Raise ValueError if stream_name is not a recognized data stream."""
    if stream_name not in VALID_STREAMS:
        raise ValueError(
            f"Unknown stream '{stream_name}'. "
            f"Valid streams: {sorted(VALID_STREAMS)}"
        )


def check_consent(
    citizen_id: str, stream_name: str, graph: GraphAdapter
) -> bool:
    """Check whether consent is granted for a data stream.

    Queries the AI citizen's brain graph for a consent_record node matching
    the given stream. Returns True only if the node exists and its status
    is "granted".

    Spec: ALGORITHM_Human_Integration.md, ALGORITHM: check_consent

    Args:
        citizen_id: The AI citizen whose brain to query.
        stream_name: One of VALID_STREAMS.
        graph: Graph adapter for querying nodes.

    Returns:
        True if consent is granted, False otherwise.

    Raises:
        ValueError: If stream_name is not recognized.
    """
    _validate_stream(stream_name)

    results = graph.query_nodes(
        node_type="thing",
        filters={
            "type": "consent_record",
            "citizen_id": citizen_id,
            "content.stream": stream_name,
        },
    )

    if not results:
        logger.info(
            "No consent record for stream '%s' on citizen '%s'. "
            "Stream inactive.",
            stream_name,
            citizen_id,
        )
        return False

    consent_node = results[0]
    content = consent_node.get("content", {})
    status = content.get("status", "never_asked")

    if status == "granted":
        return True

    logger.info(
        "Consent for stream '%s' on citizen '%s' is '%s'. "
        "Ingestion blocked.",
        stream_name,
        citizen_id,
        status,
    )
    return False


def grant_consent(
    citizen_id: str,
    stream_name: str,
    human_id: str,
    graph: GraphAdapter,
    scope: str = "all",
    granularity: str = "all",
) -> str:
    """Grant consent for a data stream by creating a consent_record node.

    If a consent node already exists for this stream, it is updated to
    status="granted". Otherwise a new node is created.

    Spec: ALGORITHM_Human_Integration.md, Data Structures: Consent Node

    Args:
        citizen_id: The AI citizen whose brain receives the consent node.
        stream_name: One of VALID_STREAMS.
        human_id: Identifier of the human granting consent.
        graph: Graph adapter for creating/updating nodes.
        scope: What data within the stream (default "all").
        granularity: Sub-stream granularity (default "all").

    Returns:
        The node ID of the consent record.

    Raises:
        ValueError: If stream_name is not recognized.
    """
    _validate_stream(stream_name)

    # Check if consent node already exists for this stream
    existing = graph.query_nodes(
        node_type="thing",
        filters={
            "type": "consent_record",
            "citizen_id": citizen_id,
            "content.stream": stream_name,
        },
    )

    now = _iso_now()

    if existing:
        node_id = existing[0]["id"]
        graph.update_node(node_id, {
            "content": {
                "stream": stream_name,
                "status": "granted",
                "granted_at": now,
                "revoked_at": None,
                "scope": scope,
                "granularity": granularity,
                "human_id": human_id,
            },
            "synthesis": f"Human granted consent for {stream_name} ({scope})",
        })
        logger.info(
            "Consent re-granted for stream '%s' on citizen '%s' by '%s'.",
            stream_name,
            citizen_id,
            human_id,
        )
        return node_id

    node_data = {
        "node_type": "thing",
        "type": "consent_record",
        "citizen_id": citizen_id,
        "content": {
            "stream": stream_name,
            "status": "granted",
            "granted_at": now,
            "revoked_at": None,
            "scope": scope,
            "granularity": granularity,
            "human_id": human_id,
        },
        "partner_relevance": 1.0,
        "weight": 5.0,
        "stability": 0.9,
        "synthesis": f"Human granted consent for {stream_name} ({scope})",
    }

    node_id = graph.create_node(node_data)
    logger.info(
        "Consent granted for stream '%s' on citizen '%s' by '%s'. "
        "Node: %s",
        stream_name,
        citizen_id,
        human_id,
        node_id,
    )
    return node_id


def revoke_consent(
    citizen_id: str, stream_name: str, graph: GraphAdapter
) -> int:
    """Revoke consent for a data stream, triggering content redaction.

    Sets the consent node status to "revoked" and nullifies all nodes
    whose content.source matches the stream. Node structures are preserved
    for graph integrity, but content is destroyed.

    Spec: ALGORITHM_Human_Integration.md, ALGORITHM: revoke_consent
          VALIDATION_Human_Integration.md, V4

    Args:
        citizen_id: The AI citizen whose consent is revoked.
        stream_name: One of VALID_STREAMS.
        graph: Graph adapter for querying/updating nodes.

    Returns:
        Number of nodes redacted.

    Raises:
        ValueError: If stream_name is not recognized.
        RuntimeError: If no consent record exists for this stream.
    """
    _validate_stream(stream_name)

    consent_nodes = graph.query_nodes(
        node_type="thing",
        filters={
            "type": "consent_record",
            "citizen_id": citizen_id,
            "content.stream": stream_name,
        },
    )

    if not consent_nodes:
        raise RuntimeError(
            f"No consent record found for stream '{stream_name}' "
            f"on citizen '{citizen_id}'. Cannot revoke non-existent consent."
        )

    now = _iso_now()

    # Update consent node to revoked
    consent_id = consent_nodes[0]["id"]
    existing_content = consent_nodes[0].get("content", {})
    existing_content["status"] = "revoked"
    existing_content["revoked_at"] = now
    graph.update_node(consent_id, {
        "content": existing_content,
        "synthesis": f"Human revoked consent for {stream_name}",
    })

    # Find all nodes sourced from this stream and redact them
    source_mapping = _stream_to_source_values(stream_name)
    redacted_count = 0

    for source_value in source_mapping:
        affected_nodes = graph.query_nodes(
            node_type=None,  # any node type
            filters={
                "citizen_id": citizen_id,
                "content.source": source_value,
            },
        )
        for node in affected_nodes:
            graph.update_node(node["id"], {
                "weight": 0.0,
                "energy": 0.0,
                "content": None,
                "synthesis": f"Redacted — consent revoked for {stream_name}",
            })
            redacted_count += 1

    logger.info(
        "Consent revoked for stream '%s' on citizen '%s'. "
        "%d nodes redacted.",
        stream_name,
        citizen_id,
        redacted_count,
    )
    return redacted_count


def check_bond_active(citizen_id: str, graph: GraphAdapter) -> bool:
    """Verify that a 1:1 pairing bond exists and is active.

    Queries the graph for a link of type "pairing_bond" connected to the
    given citizen with status "active".

    Spec: VALIDATION_Human_Integration.md, V6

    Args:
        citizen_id: The AI citizen to check.
        graph: Graph adapter for querying links.

    Returns:
        True if an active bond exists, False otherwise.
    """
    bond_links = graph.query_links(
        source_id=citizen_id,
        link_type="pairing_bond",
    )

    for link in bond_links:
        props = link.get("props", {})
        if props.get("status") == "active":
            return True

    # Also check as target (bond may be stored in either direction)
    bond_links_reverse = graph.query_links(
        target_id=citizen_id,
        link_type="pairing_bond",
    )

    for link in bond_links_reverse:
        props = link.get("props", {})
        if props.get("status") == "active":
            return True

    logger.info(
        "No active pairing bond found for citizen '%s'. "
        "Ingestion blocked.",
        citizen_id,
    )
    return False


def _stream_to_source_values(stream_name: str) -> list[str]:
    """Map a stream name to the content.source values used by its nodes.

    A single stream may produce nodes with different source labels.
    """
    mapping = {
        "voice": ["voice_message", "voice_emotion"],
        "garmin": ["garmin"],
        "desktop": ["desktop_screenshot"],
        "blockchain": ["blockchain"],
        "ai_messages": ["ai_conversation"],
        "direct_chat": ["direct_chat"],
    }
    return mapping.get(stream_name, [stream_name])


def _iso_now() -> str:
    """Return the current UTC time in ISO 8601 format."""
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()
