"""
Membrane Routing — Resolve citizen endpoints from L4 graph.

The membrane is responsible for routing messages/calls to citizens.
It queries the L4 registry for active endpoints registered by
endpoint_registrar.py on each MCP instance startup.

Co-Authored-By: Tomaso Nervo (@nervo) <nervo@mindprotocol.ai>
"""

import json
import logging
import os
from typing import Any, Dict, List, Optional

logger = logging.getLogger("mind.membrane.routing")


def _connect_l4():
    """Connect to the L4 registry graph (shared helper)."""
    try:
        from falkordb import FalkorDB
        host = os.environ.get("L4_GRAPH_HOST", "localhost")
        port = int(os.environ.get("L4_GRAPH_PORT", "6379"))
        graph_name = os.environ.get("L4_GRAPH_NAME", "mind_protocol")
        db = FalkorDB(host=host, port=port)
        return db.select_graph(graph_name)
    except Exception as e:
        logger.warning(f"Cannot connect to L4 graph: {e}")
        return None


def resolve_citizen_endpoints(citizen_id: str, graph=None) -> List[Dict[str, Any]]:
    """Resolve all active endpoints for a citizen from L4 graph.

    Queries the L4 registry for Thing nodes of type 'citizen_endpoint'
    that are linked from the citizen's Actor node via a SERVES link.

    Args:
        citizen_id: The citizen handle (e.g., "nervo")
        graph: Optional pre-connected FalkorDB graph (uses L4 default if None)

    Returns:
        List of dicts: [{url, repo_name, status, last_heartbeat, endpoint_id}]
        Sorted by last_heartbeat (most recent first).
    """
    if graph is None:
        graph = _connect_l4()
    if graph is None:
        return []

    try:
        result = graph.query(
            """MATCH (a {id: $cid})-[:link {type: 'SERVES'}]->(t {type: 'citizen_endpoint'})
               RETURN t.id, t.uri, t.repo_name, t.status, t.last_heartbeat
               ORDER BY t.last_heartbeat DESC""",
            {"cid": citizen_id},
        )
        rows = result.result_set if result.result_set else []
        endpoints = []
        for row in rows:
            endpoints.append({
                "endpoint_id": row[0],
                "url": row[1],
                "repo_name": row[2],
                "status": row[3],
                "last_heartbeat": row[4],
            })
        return endpoints
    except Exception as e:
        logger.warning(f"Failed to resolve endpoints for {citizen_id}: {e}")
        return []


def resolve_active_endpoints(citizen_id: str, graph=None) -> List[Dict[str, Any]]:
    """Resolve only active endpoints for a citizen.

    Convenience wrapper that filters for status='active' only.

    Args:
        citizen_id: The citizen handle (e.g., "nervo")
        graph: Optional pre-connected FalkorDB graph

    Returns:
        List of active endpoint dicts, sorted by last_heartbeat (most recent first).
    """
    all_endpoints = resolve_citizen_endpoints(citizen_id, graph=graph)
    return [ep for ep in all_endpoints if ep.get("status") == "active"]


def route_to_citizen(citizen_id: str, payload: dict, graph=None) -> bool:
    """Route a payload to a citizen via their best available endpoint.

    Tries active endpoints in order (most recent heartbeat first).
    Uses WebSocket to deliver the payload.

    Args:
        citizen_id: Target citizen handle
        payload: The message/call payload to deliver
        graph: Optional pre-connected FalkorDB graph

    Returns:
        True if delivery succeeded to at least one endpoint.
    """
    endpoints = resolve_active_endpoints(citizen_id, graph=graph)
    if not endpoints:
        logger.warning(f"No active endpoints found for citizen {citizen_id}")
        return False

    for ep in endpoints:
        url = ep.get("url")
        if not url:
            continue
        try:
            success = _deliver_ws(url, payload)
            if success:
                logger.info(
                    f"Delivered to {citizen_id} via {ep.get('repo_name', '?')} "
                    f"({ep.get('endpoint_id')})"
                )
                return True
        except Exception as e:
            logger.warning(
                f"Delivery to {citizen_id} @ {url} failed: {e}, trying next..."
            )
            continue

    logger.error(f"All endpoints exhausted for citizen {citizen_id}")
    return False


def _deliver_ws(url: str, payload: dict) -> bool:
    """Deliver payload via WebSocket (single attempt).

    Uses a short-lived synchronous connection for simplicity.
    Returns True if the message was sent successfully.
    """
    try:
        import websocket
        ws = websocket.create_connection(url, timeout=10)
        ws.send(json.dumps(payload))
        ws.close()
        return True
    except ImportError:
        logger.warning(
            "websocket-client not installed — cannot deliver via WS. "
            "Install with: pip install websocket-client"
        )
        return False
    except Exception as e:
        logger.warning(f"WebSocket delivery to {url} failed: {e}")
        return False
