"""
Connectome Runner

Main interface for running connectome dialogues.

DOCS: docs/membrane/IMPLEMENTATION_Membrane_System.md
"""

import logging
from pathlib import Path
from typing import Any, Dict, Optional

from .session import SessionState, SessionStatus
from .loader import ConnectomeLoader, ConnectomeDefinition, load_connectome_from_string
from .steps import StepProcessor

logger = logging.getLogger(__name__)


class ConnectomeRunner:
    """
    Runs connectome dialogues.

    Usage:
        runner = ConnectomeRunner(graph_ops, graph_queries)

        # Start session
        response = runner.start("create_validation")

        # Continue with answers
        while response["status"] == "active":
            if response.get("needs_input"):
                answer = get_answer_from_agent(response)
                response = runner.continue_session(response["session_id"], answer)
            else:
                response = runner.continue_session(response["session_id"])

        # Complete
        print(response["created"])
    """

    def __init__(
        self,
        graph_ops=None,
        graph_queries=None,
        connectomes_dir: Optional[Path] = None
    ):
        """
        Initialize runner.

        Args:
            graph_ops: GraphOps instance for mutations
            graph_queries: GraphQueries instance for queries
            connectomes_dir: Directory containing connectome YAML files
        """
        self.graph_ops = graph_ops
        self.graph_queries = graph_queries
        self.loader = ConnectomeLoader(connectomes_dir)
        self.processor = StepProcessor(graph_ops, graph_queries)

        # Active sessions
        self._sessions: Dict[str, SessionState] = {}
        self._connectomes: Dict[str, ConnectomeDefinition] = {}

    def register_connectome(self, connectome: ConnectomeDefinition) -> None:
        """Register a connectome definition directly."""
        self._connectomes[connectome.name] = connectome

    def register_connectome_yaml(self, yaml_str: str, name: str = None) -> None:
        """Register a connectome from YAML string."""
        connectome = load_connectome_from_string(yaml_str, name)
        self._connectomes[connectome.name] = connectome

    def start(
        self,
        connectome_name: str,
        initial_context: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Start a new connectome session.

        Args:
            connectome_name: Name of connectome to run
            initial_context: Optional initial context values

        Returns:
            Response dict with session_id, step info, etc.
        """
        # Load connectome
        if connectome_name in self._connectomes:
            connectome = self._connectomes[connectome_name]
        else:
            try:
                connectome = self.loader.load(connectome_name)
                self._connectomes[connectome_name] = connectome
            except FileNotFoundError:
                return {
                    "status": "error",
                    "error": f"Connectome not found: {connectome_name}",
                }

        # Get start step
        start_step = connectome.get_start_step()
        if not start_step:
            return {
                "status": "error",
                "error": f"Connectome has no steps: {connectome_name}",
            }

        # Create session
        session = SessionState.create(connectome_name, start_step.id)

        # Add initial context
        if initial_context:
            for key, value in initial_context.items():
                session.set_context(key, value)

        self._sessions[session.id] = session

        # Process first step
        return self._process_current_step(session, connectome)

    def continue_session(
        self,
        session_id: str,
        answer: Any = None
    ) -> Dict[str, Any]:
        """
        Continue an active session.

        Args:
            session_id: Session ID from start()
            answer: Answer for ask steps

        Returns:
            Response dict with next step or completion
        """
        session = self._sessions.get(session_id)
        if not session:
            return {
                "status": "error",
                "error": f"Session not found: {session_id}",
            }

        if session.status != SessionStatus.ACTIVE:
            return {
                "status": session.status.value,
                "error": "Session is not active",
            }

        connectome = self._connectomes.get(session.connectome_name)
        if not connectome:
            return {
                "status": "error",
                "error": f"Connectome not found: {session.connectome_name}",
            }

        return self._process_current_step(session, connectome, answer)

    def abort(self, session_id: str) -> Dict[str, Any]:
        """
        Abort a session.

        Args:
            session_id: Session to abort

        Returns:
            Response dict confirming abort
        """
        session = self._sessions.get(session_id)
        if not session:
            return {
                "status": "error",
                "error": f"Session not found: {session_id}",
            }

        session.abort()

        return {
            "status": "aborted",
            "session_id": session_id,
            "message": "Session aborted. No changes were committed.",
        }

    def get_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Get session state."""
        session = self._sessions.get(session_id)
        if session:
            return session.to_dict()
        return None

    def _process_current_step(
        self,
        session: SessionState,
        connectome: ConnectomeDefinition,
        answer: Any = None
    ) -> Dict[str, Any]:
        """Process the current step and return response."""
        step = connectome.get_step(session.current_step)
        if not step:
            session.set_error(f"Step not found: {session.current_step}")
            return self._build_response(session)

        # Process step
        result = self.processor.process_step(step, session, answer)

        if not result.success:
            if result.needs_input:
                # Validation error - return for retry
                return self._build_response(
                    session,
                    step_response=result.response,
                    needs_input=True,
                    error=result.error
                )
            else:
                # Fatal error
                session.set_error(result.error or "Unknown error")
                return self._build_response(session)

        if result.needs_input:
            # Step needs input from agent
            return self._build_response(
                session,
                step_response=result.response,
                needs_input=True
            )

        # Move to next step
        if result.next_step:
            session.current_step = result.next_step
            # Recursively process next step (for query/create that don't need input)
            # Handle call_procedure - load sub-procedure
            if result.next_step == "$call_procedure":
                sub_procedure_name = session.connectome_name  # Already updated by push_call
                return self._start_sub_protocol(session, sub_procedure_name)

            # Handle $complete marker - protocol finished
            if result.next_step == "$complete":
                if session.call_stack:
                    return self._return_from_call(session)
                else:
                    session.complete()
                    return self._build_response(session, step_response=result.response)

            next_step = connectome.get_step(result.next_step)
            if next_step and next_step.type in ("query", "create", "update", "branch", "call_procedure"):
                return self._process_current_step(session, connectome)
            else:
                # Next step needs input (ask) or we need to return
                return self._process_current_step(session, connectome)
        else:
            # Protocol complete - check if we need to return to caller
            if session.call_stack:
                return self._return_from_call(session)
            else:
                # Top-level complete
                session.complete()
                return self._build_response(session, step_response=result.response)

    def _start_sub_protocol(
        self,
        session: SessionState,
        procedure_name: str
    ) -> Dict[str, Any]:
        """Start executing a sub-procedure after call_procedure step."""
        # Load sub-procedure
        if procedure_name in self._connectomes:
            connectome = self._connectomes[procedure_name]
        else:
            try:
                connectome = self.loader.load(procedure_name)
                self._connectomes[procedure_name] = connectome
            except FileNotFoundError:
                session.set_error(f"Sub-procedure not found: {protocol_name}")
                return self._build_response(session)

        # Get start step
        start_step = connectome.get_start_step()
        if not start_step:
            session.set_error(f"Sub-procedure has no steps: {protocol_name}")
            return self._build_response(session)

        # Update session to point to sub-procedure's first step
        session.current_step = start_step.id

        # Process first step of sub-procedure
        return self._process_current_step(session, connectome)

    def _return_from_call(self, session: SessionState) -> Dict[str, Any]:
        """Return from a sub-procedure to the caller."""
        # Pop call frame (restores previous protocol name and return step)
        frame = session.pop_call()
        if not frame:
            session.set_error("Unexpected empty call stack")
            return self._build_response(session)

        # Load the caller protocol
        caller_procedure = self._connectomes.get(session.connectome_name)
        if not caller_procedure:
            try:
                caller_procedure = self.loader.load(session.connectome_name)
                self._connectomes[session.connectome_name] = caller_procedure
            except FileNotFoundError:
                session.set_error(f"Caller procedure not found: {session.connectome_name}")
                return self._build_response(session)

        # Continue from return step
        return self._process_current_step(session, caller_procedure)

    def _build_response(
        self,
        session: SessionState,
        step_response: Optional[Dict[str, Any]] = None,
        needs_input: bool = False,
        error: Optional[str] = None
    ) -> Dict[str, Any]:
        """Build response dict."""
        response = {
            "session_id": session.id,
            "status": session.status.value,
            "current_step": session.current_step,
        }

        if session.status == SessionStatus.COMPLETE:
            response["created"] = {
                "nodes": session.created_nodes,
                "links": session.created_links,
            }
            response["collected"] = session.collected

        if session.status == SessionStatus.ERROR:
            response["error"] = session.error

        if error:
            response["error"] = error

        if needs_input:
            response["needs_input"] = True

        if step_response:
            response["step"] = step_response

        # Include context summary
        response["context_keys"] = list(session.context.keys())

        # Include call stack info
        if session.call_stack:
            response["call_depth"] = session.call_depth
            response["call_stack"] = [
                {"protocol": f.procedure_name, "return_step": f.return_step}
                for f in session.call_stack
            ]

        return response


# Convenience function for simple usage
def run_connectome(
    connectome_yaml: str,
    answers: Dict[str, Any],
    graph_ops=None,
    graph_queries=None
) -> Dict[str, Any]:
    """
    Run a connectome with pre-supplied answers.

    Useful for testing or batch operations.

    Args:
        connectome_yaml: YAML string defining connectome
        answers: Dict mapping step_id to answer
        graph_ops: GraphOps instance
        graph_queries: GraphQueries instance

    Returns:
        Final response with created nodes/links
    """
    runner = ConnectomeRunner(graph_ops, graph_queries)
    runner.register_connectome_yaml(connectome_yaml)

    connectome = load_connectome_from_string(connectome_yaml)
    response = runner.start(connectome.name)

    while response.get("status") == "active":
        step = response.get("step", {})
        step_id = step.get("step_id")

        if response.get("needs_input"):
            if step_id in answers:
                answer = answers[step_id]
            else:
                # No answer provided - abort
                return runner.abort(response["session_id"])

            response = runner.continue_session(response["session_id"], answer)
        else:
            response = runner.continue_session(response["session_id"])

    return response
