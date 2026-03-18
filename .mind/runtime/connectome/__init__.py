"""
Connectome v0 — Structured Dialogue for Graph Interaction

Usage:
    from runtime.connectome import ConnectomeRunner

    runner = ConnectomeRunner(graph_ops, graph_queries)

    # Start a session
    response = runner.start("create_validation")

    # Continue with answers
    response = runner.continue_session(session_id, answer="V-TEST-INVARIANT")

    # Until complete
    if response["status"] == "complete":
        print(response["created"])

DOCS: docs/connectome/PATTERNS_Connectome.md
"""

from .runner import ConnectomeRunner
from .session import SessionState, SessionStatus
from .loader import load_connectome

__all__ = [
    'ConnectomeRunner',
    'SessionState',
    'SessionStatus',
    'load_connectome',
]
