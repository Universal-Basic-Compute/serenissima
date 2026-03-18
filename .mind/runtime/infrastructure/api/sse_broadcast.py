"""
SSE Broadcast — Shared module for broadcasting events to SSE clients.

Used by:
- moments.py (click handler)
- orchestrator.py (after narrator/world runner)
"""

# DOCS: docs/infrastructure/api/IMPLEMENTATION_Api.md

import asyncio
import logging
from typing import Dict, List, Any

logger = logging.getLogger(__name__)

# Per-playthrough SSE client queues
# Key: playthrough_id, Value: list of asyncio.Queue for connected clients
_sse_clients: Dict[str, List[asyncio.Queue]] = {}


def get_sse_clients() -> Dict[str, List[asyncio.Queue]]:
    """Get the SSE clients dict (for moments.py to register clients)."""
    return _sse_clients


def register_sse_client(playthrough_id: str, queue: asyncio.Queue):
    """Register a new SSE client queue for a playthrough."""
    if playthrough_id not in _sse_clients:
        _sse_clients[playthrough_id] = []
    _sse_clients[playthrough_id].append(queue)
    logger.debug(f"[SSE] Registered client for {playthrough_id}, total: {len(_sse_clients[playthrough_id])}")


def unregister_sse_client(playthrough_id: str, queue: asyncio.Queue):
    """Unregister an SSE client queue."""
    if playthrough_id in _sse_clients:
        try:
            _sse_clients[playthrough_id].remove(queue)
            logger.debug(f"[SSE] Unregistered client for {playthrough_id}")
        except ValueError:
            pass
        if not _sse_clients[playthrough_id]:
            del _sse_clients[playthrough_id]


def broadcast_moment_event(playthrough_id: str, event_type: str, data: Dict[str, Any]):
    """
    Broadcast a moment event to all SSE clients for a playthrough.

    Event types:
    - moment_activated: New moment became active
    - moment_completed: Moment was completed (recorded to canon)
    - moment_decayed: Moment weight fell below threshold
    - weight_updated: Moment weight changed
    - click_traversed: Click led to new moment

    Args:
        playthrough_id: The playthrough to broadcast to
        event_type: The SSE event type
        data: The event payload
    """
    if playthrough_id not in _sse_clients:
        logger.debug(f"[SSE] No clients for {playthrough_id}, skipping broadcast")
        return

    client_count = len(_sse_clients[playthrough_id])
    sent = 0

    for queue in _sse_clients[playthrough_id]:
        try:
            queue.put_nowait({"type": event_type, "data": data})
            sent += 1
        except asyncio.QueueFull:
            logger.warning(f"[SSE] Queue full for {playthrough_id}, dropping event")

    if sent > 0:
        logger.debug(f"[SSE] Broadcast {event_type} to {sent}/{client_count} clients for {playthrough_id}")


# Note: Canon Holder (not yet implemented) should call broadcast_moment_event
# when moments transition to 'completed' status.
# See: docs/infrastructure/canon/ALGORITHM_Canon_Holder.md
