"""
Debug Tracer — trace execution as Moment nodes in a debug Space.

When debug is active for an entity (citizen, org, etc.), every function
decorated with @traceable logs its input/output as linked Moments in
a FalkorDB graph Space named `debug_session_{entity}_{timestamp}`.

Zero overhead when debug is off (one dict lookup per call).

Usage:
    from runtime.debug.tracer import start_session, stop_session, traceable

    start_session("forge")  # activate debug for @forge

    @traceable(entity_arg="citizen_handle")
    def process_stimulus(citizen_handle, stimulus):
        ...  # this call is now logged as a Moment

    stop_session("forge")   # deactivate, Space persists for inspection
"""

from __future__ import annotations

import functools
import logging
import os
import time
import traceback
import json
from dataclasses import dataclass, field
from typing import Any, Callable, Optional

logger = logging.getLogger("debug.tracer")

# ── Active sessions registry ───────────────────────────────────────────────

@dataclass
class DebugSession:
    entity: str
    space_id: str
    started_at: float
    step_count: int = 0
    last_moment_id: str = ""
    graph_name: str = ""


_active_sessions: dict[str, DebugSession] = {}


def start_session(entity: str, graph_name: str = "") -> DebugSession:
    """Start a debug session for an entity. Creates a Space in the graph."""
    ts = int(time.time())
    space_id = f"debug_{entity}_{ts}"
    gname = graph_name or os.environ.get("L3_GRAPH", os.environ.get("FALKORDB_GRAPH", "universe"))

    session = DebugSession(
        entity=entity,
        space_id=space_id,
        started_at=time.time(),
        graph_name=gname,
    )

    # Create the debug Space in the graph
    try:
        graph = _get_graph(gname)
        if graph:
            graph.query(
                "MERGE (s {id: $sid}) "
                "SET s.node_type = 'space', s.type = 'debug_session', "
                "    s.name = $name, "
                "    s.synthesis = $syn, "
                "    s.created_at_s = $ts",
                {
                    "sid": space_id,
                    "name": f"Debug: {entity} @ {time.strftime('%Y-%m-%d %H:%M', time.localtime(ts))}",
                    "syn": f"Debug trace session for {entity}",
                    "ts": ts,
                },
            )
            logger.info(f"Debug session started: {space_id}")
    except Exception as e:
        logger.warning(f"Could not create debug Space: {e}")

    _active_sessions[entity] = session
    return session


def stop_session(entity: str) -> Optional[DebugSession]:
    """Stop a debug session. The Space and its Moments persist for inspection."""
    session = _active_sessions.pop(entity, None)
    if session:
        logger.info(
            f"Debug session stopped: {session.space_id} "
            f"({session.step_count} steps)"
        )
    return session


def list_sessions() -> list[dict]:
    """List all active debug sessions."""
    return [
        {
            "entity": s.entity,
            "space_id": s.space_id,
            "started_at": s.started_at,
            "steps": s.step_count,
            "graph": s.graph_name,
        }
        for s in _active_sessions.values()
    ]


def is_debugging(entity: str) -> bool:
    """Check if an entity is being debugged."""
    return entity in _active_sessions


# ── Decorator ──────────────────────────────────────────────────────────────

def traceable(
    entity_arg: str = "citizen_handle",
    module_name: str = "",
):
    """Decorator that logs function entry/exit as Moments when debug is active.

    Args:
        entity_arg: Name of the function argument that identifies the entity.
                    The decorator extracts this to check if debug is active.
        module_name: Override the module name (defaults to function name).

    Zero overhead when debug is off: one dict lookup.
    """
    def decorator(fn: Callable) -> Callable:
        fname = module_name or f"{fn.__module__}.{fn.__qualname__}"

        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            # Resolve entity from args
            entity = _resolve_entity(fn, args, kwargs, entity_arg)
            if not entity or entity not in _active_sessions:
                return fn(*args, **kwargs)

            session = _active_sessions[entity]
            step = session.step_count + 1
            session.step_count = step

            # Capture input
            input_summary = _summarize_args(fn, args, kwargs)

            # Execute
            start_t = time.time()
            error_text = None
            output_summary = None
            try:
                result = fn(*args, **kwargs)
                output_summary = _summarize_output(result)
                return result
            except Exception as e:
                error_text = traceback.format_exc()
                raise
            finally:
                elapsed_ms = int((time.time() - start_t) * 1000)

                # Log Moment to graph
                _log_moment(
                    session=session,
                    step=step,
                    module=fname,
                    input_summary=input_summary,
                    output_summary=output_summary,
                    error=error_text,
                    elapsed_ms=elapsed_ms,
                )

        return wrapper
    return decorator


# ── Graph logging ──────────────────────────────────────────────────────────

def _log_moment(
    session: DebugSession,
    step: int,
    module: str,
    input_summary: str,
    output_summary: Optional[str],
    error: Optional[str],
    elapsed_ms: int,
):
    """Write a debug Moment to the graph, linked to the previous one."""
    moment_id = f"{session.space_id}_step_{step}"
    now_s = int(time.time())

    status = "error" if error else "ok"
    content_parts = [f"Module: {module}", f"Elapsed: {elapsed_ms}ms"]
    if input_summary:
        content_parts.append(f"Input: {input_summary}")
    if output_summary:
        content_parts.append(f"Output: {output_summary}")
    if error:
        content_parts.append(f"Error:\n{error}")

    content = "\n".join(content_parts)
    synthesis = f"Step {step}: {module} [{status}] ({elapsed_ms}ms)"

    try:
        graph = _get_graph(session.graph_name)
        if not graph:
            return

        # Create Moment node
        graph.query(
            "MERGE (m {id: $mid}) "
            "SET m.node_type = 'moment', m.type = 'debug_trace', "
            "    m.name = $name, m.content = $content, "
            "    m.synthesis = $syn, m.status = $status, "
            "    m.step = $step, m.module = $module, "
            "    m.elapsed_ms = $elapsed, "
            "    m.created_at_s = $ts",
            {
                "mid": moment_id,
                "name": f"[{step}] {module}",
                "content": content[:2000],
                "syn": synthesis,
                "status": status,
                "step": step,
                "module": module,
                "elapsed": elapsed_ms,
                "ts": now_s,
            },
        )

        # Link Moment → Space (IN)
        graph.query(
            "MATCH (m {id: $mid}), (s {id: $sid}) "
            "MERGE (m)-[r:link {id: $lid}]->(s) "
            "SET r.hierarchy = -0.5, r.permanence = 0.2",
            {
                "mid": moment_id,
                "sid": session.space_id,
                "lid": f"{moment_id}_in_{session.space_id}",
            },
        )

        # Link to previous Moment (causes chain)
        if session.last_moment_id:
            graph.query(
                "MATCH (prev {id: $prev}), (curr {id: $curr}) "
                "MERGE (prev)-[r:link {id: $lid}]->(curr) "
                "SET r.polarity = 0.5, r.permanence = 0.2",
                {
                    "prev": session.last_moment_id,
                    "curr": moment_id,
                    "lid": f"{session.last_moment_id}_then_{moment_id}",
                },
            )

        session.last_moment_id = moment_id

    except Exception as e:
        # Debug logging must never crash the system
        logger.debug(f"Debug trace write failed: {e}")


# ── Helpers ────────────────────────────────────────────────────────────────

def _get_graph(graph_name: str):
    """Get a FalkorDB graph connection."""
    try:
        from falkordb import FalkorDB
        host = os.environ.get("FALKORDB_HOST", "localhost")
        port = int(os.environ.get("FALKORDB_PORT", "6379"))
        db = FalkorDB(host=host, port=port)
        return db.select_graph(graph_name)
    except Exception:
        return None


def _resolve_entity(fn, args, kwargs, entity_arg: str) -> str:
    """Extract the entity identifier from function arguments."""
    # Try kwargs first
    if entity_arg in kwargs:
        return str(kwargs[entity_arg])

    # Try positional args by matching parameter names
    import inspect
    try:
        sig = inspect.signature(fn)
        params = list(sig.parameters.keys())
        if entity_arg in params:
            idx = params.index(entity_arg)
            if idx < len(args):
                return str(args[idx])
    except (ValueError, TypeError):
        pass

    # Try first string arg as fallback
    for a in args:
        if isinstance(a, str) and len(a) < 50:
            return a

    return ""


def _summarize_args(fn, args, kwargs, max_len: int = 500) -> str:
    """Summarize function arguments for logging."""
    parts = []
    for i, a in enumerate(args):
        s = repr(a)
        if len(s) > 100:
            s = s[:97] + "..."
        parts.append(s)
    for k, v in kwargs.items():
        s = repr(v)
        if len(s) > 100:
            s = s[:97] + "..."
        parts.append(f"{k}={s}")
    result = ", ".join(parts)
    return result[:max_len]


def trace_step(entity: str, module: str, input_data: str, output_data: str = "", error: str = "", elapsed_ms: int = 0):
    """Manually log a debug step. Use this in the dispatcher for method calls.

    Simpler than the decorator — call it directly around critical operations.
    Zero-cost when entity is not being debugged.
    """
    if entity not in _active_sessions:
        return

    session = _active_sessions[entity]
    session.step_count += 1

    _log_moment(
        session=session,
        step=session.step_count,
        module=module,
        input_summary=input_data[:500],
        output_summary=output_data[:500] if output_data else None,
        error=error if error else None,
        elapsed_ms=elapsed_ms,
    )


def _summarize_output(result, max_len: int = 500) -> str:
    """Summarize function output for logging."""
    if result is None:
        return "None"
    s = repr(result)
    if len(s) > max_len:
        s = s[:max_len - 3] + "..."
    return s
