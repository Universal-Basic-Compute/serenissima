"""
Moment Lifecycle Checker

Verifies V-MOMENT-TRANSITIONS invariant.

DOCS: docs/physics/HEALTH_Energy_Physics.md#indicator-moment_state_validity
"""

import logging
from typing import List, Dict, Any, Set

from ..base import BaseChecker, HealthResult

logger = logging.getLogger(__name__)


class MomentLifecycleChecker(BaseChecker):
    """
    Verify moment state transitions follow allowed paths.

    Checks:
    - V-MOMENT-TRANSITIONS: Only allowed transitions occur
    """

    name = "moment_lifecycle"
    validation_ids = ["V-MOMENT-TRANSITIONS"]
    priority = "high"

    # Allowed transitions (v1.2 simplified)
    ALLOWED_TRANSITIONS = {
        "possible": {"active", "decayed"},
        "active": {"completed", "failed"},
        "completed": set(),    # terminal
        "failed": set(),       # terminal
        "decayed": set(),      # terminal
    }

    VALID_STATES = {"possible", "active", "completed", "failed", "decayed"}

    def __init__(self, graph_queries=None, graph_ops=None):
        super().__init__(graph_queries, graph_ops)
        # Track transitions for verification
        self._transitions: List[Dict[str, Any]] = []
        self._invalid_transitions: List[Dict[str, Any]] = []

    def record_transition(self, moment_id: str, old_state: str, new_state: str):
        """
        Record a state transition for verification.

        Called by canon_holder.py instrumentation.
        """
        transition = {
            "moment_id": moment_id,
            "old_state": old_state,
            "new_state": new_state,
        }
        self._transitions.append(transition)

        # Check if valid
        if not self._is_valid_transition(old_state, new_state):
            self._invalid_transitions.append(transition)

    def clear_transitions(self):
        """Clear recorded transitions."""
        self._transitions = []
        self._invalid_transitions = []

    def check(self) -> HealthResult:
        """
        Verify recorded transitions are valid AND check current graph state.
        """
        if not self.read:
            return self.unknown("No graph connection available")

        try:
            # Check graph for invalid states
            invalid_states = self._find_invalid_states()

            # Check recorded transitions
            invalid_transition_count = len(self._invalid_transitions)

            details = {
                "transitions_recorded": len(self._transitions),
                "invalid_transitions": self._invalid_transitions[:10],
                "invalid_states": invalid_states[:10],
                "valid_states": list(self.VALID_STATES),
            }

            if invalid_states:
                return self.error(
                    f"Found {len(invalid_states)} moments in invalid states",
                    details=details
                )

            if invalid_transition_count > 0:
                return self.error(
                    f"Found {invalid_transition_count} invalid state transitions",
                    details=details
                )

            return self.ok(
                f"Moment lifecycle valid: {len(self._transitions)} transitions checked",
                details=details
            )

        except Exception as e:
            logger.exception(f"[{self.name}] Check failed")
            return self.unknown(f"Check failed: {e}")

    def _is_valid_transition(self, old_state: str, new_state: str) -> bool:
        """Check if a state transition is allowed."""
        if old_state not in self.ALLOWED_TRANSITIONS:
            return False
        return new_state in self.ALLOWED_TRANSITIONS[old_state]

    def _find_invalid_states(self) -> List[Dict[str, Any]]:
        """Find moments with invalid status values."""
        valid_states_str = "', '".join(self.VALID_STATES)
        try:
            result = self.read.query(f"""
            MATCH (m:Moment)
            WHERE m.status IS NOT NULL AND NOT m.status IN ['{valid_states_str}']
            RETURN m.id AS id, m.status AS status
            LIMIT 100
            """)
            return [
                {"id": r.get('id'), "status": r.get('status')}
                for r in (result or [])
            ]
        except:
            return []
