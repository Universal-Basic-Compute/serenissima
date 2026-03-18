"""
Graph Operations: Event Emitter

Global event emitter for mutation events.
Extracted from graph_ops.py to reduce file size.

Usage:
    from runtime.physics.graph.graph_ops_events import (
        add_mutation_listener,
        remove_mutation_listener,
        emit_event
    )

Listeners receive events with:
- type: 'node_created', 'node_updated', 'link_created', 'link_updated',
        'movement', 'apply_start', 'apply_complete', 'apply_error'
- timestamp: ISO timestamp
- data: Event-specific data
"""

# DOCS: docs/physics/graph/PATTERNS_Graph.md

import logging
from datetime import datetime
from typing import Dict, Any, List, Callable

logger = logging.getLogger(__name__)

# Callbacks registered for mutation events
_mutation_listeners: List[Callable[[Dict[str, Any]], None]] = []


def add_mutation_listener(callback: Callable[[Dict[str, Any]], None]) -> None:
    """
    Register a callback to receive mutation events.

    The callback receives a dict with:
        - type: 'node_created', 'node_updated', 'link_created', 'link_updated',
                'movement', 'apply_start', 'apply_complete', 'apply_error'
        - timestamp: ISO timestamp
        - data: Event-specific data
    """
    if callback not in _mutation_listeners:
        _mutation_listeners.append(callback)


def remove_mutation_listener(callback: Callable[[Dict[str, Any]], None]) -> None:
    """Remove a mutation listener."""
    if callback in _mutation_listeners:
        _mutation_listeners.remove(callback)


def emit_event(event_type: str, data: Dict[str, Any]) -> None:
    """Emit an event to all registered listeners."""
    event = {
        "type": event_type,
        "timestamp": datetime.utcnow().isoformat(),
        "data": data
    }
    for listener in _mutation_listeners:
        try:
            listener(event)
        except Exception as e:
            logger.warning(f"Mutation listener error: {e}")


# Backwards compatibility alias
_emit_event = emit_event
