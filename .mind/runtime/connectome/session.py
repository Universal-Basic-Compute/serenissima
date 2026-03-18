"""
Connectome Session State

Tracks dialogue progress, collected answers, and accumulated context.

DOCS: docs/membrane/IMPLEMENTATION_Membrane_System.md
"""

import uuid
from enum import Enum
from datetime import datetime
from typing import Dict, Any, List, Optional
from dataclasses import dataclass, field


class SessionStatus(Enum):
    """Session lifecycle states."""
    ACTIVE = "active"
    COMPLETE = "complete"
    ABORTED = "aborted"
    ERROR = "error"


@dataclass
class LoopState:
    """State for for_each loops."""
    step_id: str
    items: List[Any]
    index: int = 0
    results: List[Any] = field(default_factory=list)

    @property
    def current_item(self) -> Any:
        """Get current item in loop."""
        if self.index < len(self.items):
            return self.items[self.index]
        return None

    @property
    def is_complete(self) -> bool:
        """Check if loop is done."""
        return self.index >= len(self.items)

    def advance(self, result: Any = None) -> None:
        """Move to next item."""
        if result is not None:
            self.results.append(result)
        self.index += 1


@dataclass
class CallFrame:
    """Stack frame for procedure calls."""
    procedure_name: str
    return_step: str
    saved_context: Dict[str, Any] = field(default_factory=dict)


@dataclass
class SessionState:
    """
    Complete state for a connectome dialogue session.

    Attributes:
        id: Unique session identifier
        connectome_name: Which connectome is running
        started_at: When session began
        current_step: Current step ID
        status: Session lifecycle status
        collected: Answers from ask steps (step_id -> value)
        context: Results from query steps (store_as -> data)
        loop_state: Current loop if in for_each
        created_nodes: Nodes created during session
        created_links: Links created during session
        error: Error message if status is ERROR
    """
    id: str
    connectome_name: str
    started_at: datetime
    current_step: str
    status: SessionStatus = SessionStatus.ACTIVE
    collected: Dict[str, Any] = field(default_factory=dict)
    context: Dict[str, Any] = field(default_factory=dict)
    loop_state: Optional[LoopState] = None
    call_stack: List[CallFrame] = field(default_factory=list)
    created_nodes: List[Dict[str, Any]] = field(default_factory=list)
    created_links: List[Dict[str, Any]] = field(default_factory=list)
    error: Optional[str] = None

    @classmethod
    def create(cls, connectome_name: str, start_step: str) -> "SessionState":
        """Create a new session."""
        return cls(
            id=str(uuid.uuid4()),
            connectome_name=connectome_name,
            started_at=datetime.utcnow(),
            current_step=start_step,
        )

    def set_answer(self, step_id: str, value: Any) -> None:
        """Store answer from an ask step."""
        self.collected[step_id] = value

    def get_answer(self, step_id: str) -> Any:
        """Retrieve answer from a previous ask step."""
        return self.collected.get(step_id)

    def set_context(self, key: str, data: Any) -> None:
        """Store query results in context."""
        self.context[key] = data

    def get_context(self, key: str) -> Any:
        """Retrieve query results from context."""
        return self.context.get(key)

    def add_created_node(self, node: Dict[str, Any]) -> None:
        """Record a created node."""
        self.created_nodes.append(node)

    def add_created_link(self, link: Dict[str, Any]) -> None:
        """Record a created link."""
        self.created_links.append(link)

    def complete(self) -> None:
        """Mark session as complete."""
        self.status = SessionStatus.COMPLETE

    def abort(self) -> None:
        """Mark session as aborted."""
        self.status = SessionStatus.ABORTED

    def set_error(self, message: str) -> None:
        """Mark session as error with message."""
        self.status = SessionStatus.ERROR
        self.error = message

    def push_call(self, procedure_name: str, return_step: str) -> None:
        """Push a call frame onto the stack."""
        frame = CallFrame(
            procedure_name=self.connectome_name,
            return_step=return_step,
            saved_context=dict(self.context)
        )
        self.call_stack.append(frame)
        self.connectome_name = procedure_name

    def pop_call(self) -> Optional[CallFrame]:
        """Pop a call frame and restore state."""
        if not self.call_stack:
            return None
        frame = self.call_stack.pop()
        self.connectome_name = frame.procedure_name
        self.current_step = frame.return_step
        # Merge saved context (don't overwrite new values)
        for key, value in frame.saved_context.items():
            if key not in self.context:
                self.context[key] = value
        return frame

    @property
    def call_depth(self) -> int:
        """Current call stack depth."""
        return len(self.call_stack)

    def to_dict(self) -> Dict[str, Any]:
        """Serialize session state."""
        return {
            "id": self.id,
            "connectome_name": self.connectome_name,
            "started_at": self.started_at.isoformat(),
            "current_step": self.current_step,
            "status": self.status.value,
            "collected": self.collected,
            "context": self.context,
            "loop_state": {
                "step": self.loop_state.step_id,
                "items": self.loop_state.items,
                "index": self.loop_state.index,
                "results": self.loop_state.results,
            } if self.loop_state else None,
            "call_stack": [
                {
                    "protocol": frame.procedure_name,
                    "return_step": frame.return_step,
                }
                for frame in self.call_stack
            ],
            "call_depth": self.call_depth,
            "created_nodes": self.created_nodes,
            "created_links": self.created_links,
            "error": self.error,
        }


# =============================================================================
# SESSION REGISTRY
# =============================================================================

_active_sessions: Dict[str, SessionState] = {}


def register_session(session: SessionState) -> None:
    """Register a session for health tracking."""
    _active_sessions[session.id] = session


def unregister_session(session_id: str) -> None:
    """Unregister a session when complete/aborted."""
    _active_sessions.pop(session_id, None)


def get_active_sessions() -> List[SessionState]:
    """Get all active sessions for health checking."""
    # Filter to only return ACTIVE sessions
    return [s for s in _active_sessions.values() if s.status == SessionStatus.ACTIVE]


def get_session(session_id: str) -> Optional[SessionState]:
    """Get a session by ID."""
    return _active_sessions.get(session_id)
