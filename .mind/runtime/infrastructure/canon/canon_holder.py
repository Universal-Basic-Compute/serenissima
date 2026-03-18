"""
Canon Holder — Moment Validation and State Machine

Validates moment coherence and manages state transitions:
- possible → active:      Canon holder validates (actors exist, available, no contradiction)
- active → completed:     Energy threshold + validation → liquidate (handled by tick_v1_2)
- active → interrupted:   Superseded by another moment
- active → overridden:    Contradicted by new moment
- possible → rejected:    Incoherent → energy returns to player

OWNER: Claude Dev 2
REF: SYNC_Schema_v1.2_Migration.md Section 4
"""

import logging
from typing import Any, Dict, List, Optional, Tuple
from dataclasses import dataclass

from runtime.physics.graph import GraphQueries, GraphOps
from runtime.models.base import MomentStatus

logger = logging.getLogger(__name__)


# =============================================================================
# VALIDATION RESULT
# =============================================================================

@dataclass
class ValidationResult:
    """Result of validating a moment for activation."""
    valid: bool
    reason: str = ""
    missing_actors: List[str] = None
    unavailable_actors: List[str] = None
    contradicting_moments: List[str] = None
    broken_chain: List[str] = None

    def __post_init__(self):
        if self.missing_actors is None:
            self.missing_actors = []
        if self.unavailable_actors is None:
            self.unavailable_actors = []
        if self.contradicting_moments is None:
            self.contradicting_moments = []
        if self.broken_chain is None:
            self.broken_chain = []


# =============================================================================
# CANON HOLDER
# =============================================================================

class CanonHolder:
    """
    Validates moments and manages state transitions.

    The Canon Holder ensures narrative coherence:
    - Actors must exist in the graph
    - Actors must be available (alive, present, not busy)
    - Moments must not contradict active narratives
    - Causal chains must be valid

    State transitions are triggered by validation results:
    - Valid → possible→active
    - Invalid → possible→rejected (energy returns to player)
    """

    def __init__(
        self,
        graph_queries: GraphQueries,
        graph_ops: GraphOps,
    ):
        self.graph_queries = graph_queries
        self.graph_ops = graph_ops
        logger.info("[CanonHolder] Initialized")

    # =========================================================================
    # VALIDATION FUNCTIONS
    # =========================================================================

    def actors_exist(self, moment_id: str) -> Tuple[bool, List[str]]:
        """
        Check if all actors referenced by the moment exist in the graph.

        Looks at:
        - expresses links (Actor → Moment)
        - about links pointing to actors (Moment → Actor)

        Returns:
            (all_exist, missing_actor_ids)
        """
        # Get actors linked via expresses (speakers)
        expresses_query = """
        MATCH (a:Actor)-[r:EXPRESSES]->(m:Moment {id: $moment_id})
        RETURN a.id as actor_id, a.name as actor_name
        """
        expresses_result = self.graph_queries.query(
            expresses_query,
            params={"moment_id": moment_id}
        )

        # Get actors linked via about
        about_query = """
        MATCH (m:Moment {id: $moment_id})-[r:ABOUT]->(a:Actor)
        RETURN a.id as actor_id, a.name as actor_name
        """
        about_result = self.graph_queries.query(
            about_query,
            params={"moment_id": moment_id}
        )

        # Combine all referenced actor IDs
        referenced_actors = set()
        for row in expresses_result:
            if row.get("actor_id"):
                referenced_actors.add(row["actor_id"])
        for row in about_result:
            if row.get("actor_id"):
                referenced_actors.add(row["actor_id"])

        # Check if each actor exists
        missing = []
        for actor_id in referenced_actors:
            actor = self.graph_queries.get_character(actor_id)
            if actor is None:
                missing.append(actor_id)

        return (len(missing) == 0, missing)

    def actors_available(self, moment_id: str) -> Tuple[bool, List[str]]:
        """
        Check if all actors are available to participate in the moment.

        An actor is available if:
        - alive == True
        - Not currently engaged in another active moment (optional strictness)

        Returns:
            (all_available, unavailable_actor_ids)
        """
        # Get actors linked to this moment
        query = """
        MATCH (a:Actor)-[r]->(m:Moment {id: $moment_id})
        WHERE type(r) IN ['EXPRESSES', 'CAN_SPEAK']
        RETURN a.id as actor_id, a.alive as alive, a.name as name
        """
        result = self.graph_queries.query(
            query,
            params={"moment_id": moment_id}
        )

        unavailable = []
        for row in result:
            actor_id = row.get("actor_id")
            if not actor_id:
                continue

            # Check if alive
            if row.get("alive") is False:
                unavailable.append(actor_id)
                continue

        return (len(unavailable) == 0, unavailable)

    def no_contradiction(self, moment_id: str) -> Tuple[bool, List[str]]:
        """
        Check if the moment contradicts any active moments.

        Contradiction is detected via:
        - Shared narratives with proximity < CONTRADICT_THRESHOLD (0.3)
        - Explicit CONTRADICTS links between narratives

        Returns:
            (no_contradiction, contradicting_moment_ids)
        """
        from runtime.physics.constants import CONTRADICT_THRESHOLD

        # Get narratives attached to this moment
        moment_narratives_query = """
        MATCH (m:Moment {id: $moment_id})-[:ABOUT]->(n:Narrative)
        RETURN n.id as narrative_id
        """
        moment_narratives = self.graph_queries.query(
            moment_narratives_query,
            params={"moment_id": moment_id}
        )
        moment_narrative_ids = [r["narrative_id"] for r in moment_narratives if r.get("narrative_id")]

        if not moment_narrative_ids:
            # No narratives attached, no contradiction possible via this method
            return (True, [])

        # Find active moments that share narratives with contradicting relationships
        contradiction_query = """
        MATCH (m1:Moment {id: $moment_id})-[:ABOUT]->(n1:Narrative)
        MATCH (n1)-[rel:RELATES]->(n2:Narrative)<-[:ABOUT]-(m2:Moment)
        WHERE m2.status = 'active' AND m1.id <> m2.id
        AND (rel.contradicts > 0.5 OR rel.polarity < -0.5)
        RETURN DISTINCT m2.id as contradicting_moment
        """
        contradictions = self.graph_queries.query(
            contradiction_query,
            params={"moment_id": moment_id}
        )

        contradicting_ids = [r["contradicting_moment"] for r in contradictions if r.get("contradicting_moment")]

        return (len(contradicting_ids) == 0, contradicting_ids)

    def causal_chain_valid(self, moment_id: str) -> Tuple[bool, List[str]]:
        """
        Check if the moment's causal chain is valid.

        A causal chain is valid if:
        - All CAN_BECOME predecessors are in a valid state (completed or active)
        - SEQUENCE predecessors exist and are completed

        Returns:
            (chain_valid, broken_chain_issues)
        """
        # Get CAN_BECOME predecessors (required for this moment to be possible)
        predecessors_query = """
        MATCH (prev:Moment)-[r:CAN_BECOME]->(m:Moment {id: $moment_id})
        RETURN prev.id as prev_id, prev.status as prev_status, r.required as required
        """
        predecessors = self.graph_queries.query(
            predecessors_query,
            params={"moment_id": moment_id}
        )

        broken = []
        for row in predecessors:
            prev_id = row.get("prev_id")
            prev_status = row.get("prev_status")
            required = row.get("required", False)

            if not prev_id:
                continue

            # If required, predecessor must be completed or active
            if required:
                if prev_status not in ["completed", "active"]:
                    broken.append(f"{prev_id}: status={prev_status}, required=true")

        # Get SEQUENCE predecessors (historical order)
        sequence_query = """
        MATCH (prev:Moment)-[:SEQUENCE]->(m:Moment {id: $moment_id})
        RETURN prev.id as prev_id, prev.status as prev_status
        """
        sequences = self.graph_queries.query(
            sequence_query,
            params={"moment_id": moment_id}
        )

        for row in sequences:
            prev_id = row.get("prev_id")
            prev_status = row.get("prev_status")

            if not prev_id:
                continue

            # Sequence predecessors should be completed
            if prev_status != "completed":
                broken.append(f"{prev_id}: sequence predecessor not completed (status={prev_status})")

        return (len(broken) == 0, broken)

    def validate_for_activation(self, moment_id: str) -> ValidationResult:
        """
        Full validation for activating a moment (possible → active).

        Checks:
        1. actors_exist
        2. actors_available
        3. no_contradiction
        4. causal_chain_valid

        Returns:
            ValidationResult with all issues collected
        """
        result = ValidationResult(valid=True)

        # 1. Check actors exist
        exists, missing = self.actors_exist(moment_id)
        if not exists:
            result.valid = False
            result.missing_actors = missing
            result.reason += f"Missing actors: {missing}. "

        # 2. Check actors available
        available, unavailable = self.actors_available(moment_id)
        if not available:
            result.valid = False
            result.unavailable_actors = unavailable
            result.reason += f"Unavailable actors: {unavailable}. "

        # 3. Check no contradiction
        no_contra, contradicting = self.no_contradiction(moment_id)
        if not no_contra:
            result.valid = False
            result.contradicting_moments = contradicting
            result.reason += f"Contradicts moments: {contradicting}. "

        # 4. Check causal chain
        chain_valid, broken = self.causal_chain_valid(moment_id)
        if not chain_valid:
            result.valid = False
            result.broken_chain = broken
            result.reason += f"Broken causal chain: {broken}. "

        if result.valid:
            result.reason = "All validations passed"

        return result

    # =========================================================================
    # STATE TRANSITIONS
    # =========================================================================

    def activate_moment(
        self,
        moment_id: str,
        current_tick: int,
        force: bool = False
    ) -> Tuple[bool, str]:
        """
        Transition: possible → active

        Validates and activates a moment if it passes all checks.

        Args:
            moment_id: The moment to activate
            current_tick: Current world tick
            force: Skip validation (for testing/admin)

        Returns:
            (success, message)
        """
        # Get moment
        moment = self.graph_queries.query(
            "MATCH (m:Moment {id: $id}) RETURN m",
            params={"id": moment_id}
        )

        if not moment:
            return (False, f"Moment {moment_id} not found")

        moment_data = moment[0].get("m", {})
        current_status = moment_data.get("status", "unknown")

        if current_status != "possible":
            return (False, f"Moment {moment_id} is not possible (status={current_status})")

        # Validate unless forced
        if not force:
            validation = self.validate_for_activation(moment_id)
            if not validation.valid:
                return (False, f"Validation failed: {validation.reason}")

        # Update status to active
        update_query = """
        MATCH (m:Moment {id: $id})
        SET m.status = 'active', m.tick_activated = $tick
        RETURN m.id
        """
        self.graph_queries.query(
            update_query,
            params={"id": moment_id, "tick": current_tick}
        )

        logger.info(f"[CanonHolder] Activated moment {moment_id} at tick {current_tick}")
        return (True, f"Moment {moment_id} activated")

    def reject_moment(
        self,
        moment_id: str,
        current_tick: int,
        reason: str = "",
        return_energy_to: str = None
    ) -> Tuple[bool, float]:
        """
        Transition: possible → rejected

        Rejects an incoherent moment and returns energy to player.

        Args:
            moment_id: The moment to reject
            current_tick: Current world tick
            reason: Reason for rejection
            return_energy_to: Actor ID to return energy to (default: player)

        Returns:
            (success, energy_returned)
        """
        from runtime.physics.constants import REJECTION_RETURN_RATE

        # Get moment
        moment = self.graph_queries.query(
            "MATCH (m:Moment {id: $id}) RETURN m.status as status, m.energy as energy",
            params={"id": moment_id}
        )

        if not moment:
            return (False, 0.0)

        moment_data = moment[0]
        current_status = moment_data.get("status", "unknown")
        moment_energy = moment_data.get("energy", 0.0)

        if current_status != "possible":
            return (False, 0.0)

        # Calculate energy to return
        energy_to_return = moment_energy * REJECTION_RETURN_RATE

        # Update moment status
        update_query = """
        MATCH (m:Moment {id: $id})
        SET m.status = "failed",
            m.tick_resolved = $tick,
            m.energy = 0
        RETURN m.id
        """
        self.graph_queries.query(
            update_query,
            params={"id": moment_id, "tick": current_tick}
        )

        # Return energy to player (or specified actor)
        target_id = return_energy_to or "char_player"
        if energy_to_return > 0:
            self.graph_queries.query(
                "MATCH (a:Actor {id: $id}) SET a.energy = a.energy + $energy",
                params={"id": target_id, "energy": energy_to_return}
            )

        logger.info(f"[CanonHolder] Rejected moment {moment_id}: {reason}. Returned {energy_to_return:.2f} energy to {target_id}")
        return (True, energy_to_return)

    def interrupt_moment(
        self,
        moment_id: str,
        current_tick: int,
        superseding_moment_id: str = None
    ) -> Tuple[bool, str]:
        """
        Transition: active → interrupted

        Interrupts an active moment when superseded by another.
        Energy liquidates to connected nodes (handled by link cooling).

        Args:
            moment_id: The moment to interrupt
            current_tick: Current world tick
            superseding_moment_id: The moment that supersedes this one

        Returns:
            (success, message)
        """
        # Get moment
        moment = self.graph_queries.query(
            "MATCH (m:Moment {id: $id}) RETURN m.status as status",
            params={"id": moment_id}
        )

        if not moment:
            return (False, f"Moment {moment_id} not found")

        if moment[0].get("status") != "active":
            return (False, f"Moment {moment_id} is not active")

        # Update status
        update_query = """
        MATCH (m:Moment {id: $id})
        SET m.status =, m.tick_resolved = $tick
        RETURN m.id
        """
        self.graph_queries.query(
            update_query,
            params={"id": moment_id, "tick": current_tick}
        )

        # Create supersedes link if specified
        if superseding_moment_id:
            link_query = """
            MATCH (m1:Moment {id: $superseding_id})
            MATCH (m2:Moment {id: $interrupted_id})
            MERGE (m1)-[:SUPERSEDES]->(m2)
            """
            self.graph_queries.query(
                link_query,
                params={
                    "superseding_id": superseding_moment_id,
                    "interrupted_id": moment_id
                }
            )

        logger.info(f"[CanonHolder] Interrupted moment {moment_id} at tick {current_tick}")
        return (True, f"Moment {moment_id} interrupted")

    def override_moment(
        self,
        moment_id: str,
        current_tick: int,
        overriding_moment_id: str,
        redirect_energy: bool = True
    ) -> Tuple[bool, float]:
        """
        Transition: active → overridden

        Overrides a moment when contradicted by a new moment.
        Energy redirects through player based on emotion proximity.

        Args:
            moment_id: The moment to override
            current_tick: Current world tick
            overriding_moment_id: The contradicting moment
            redirect_energy: Whether to redirect energy to new moment

        Returns:
            (success, energy_redirected)
        """
        # Get both moments
        query = """
        MATCH (m1:Moment {id: $old_id})
        MATCH (m2:Moment {id: $new_id})
        RETURN m1.status as old_status, m1.energy as old_energy,
               m1.tone as old_tone, m2.tone as new_tone
        """
        result = self.graph_queries.query(
            query,
            params={"old_id": moment_id, "new_id": overriding_moment_id}
        )

        if not result:
            return (False, 0.0)

        data = result[0]
        if data.get("old_status") != "active":
            return (False, 0.0)

        old_energy = data.get("old_energy", 0.0)

        # Calculate redirect amount based on proximity
        # Base 30% + proximity × 70%
        # For now, use tone similarity as proxy for emotion proximity
        old_tone = data.get("old_tone", "")
        new_tone = data.get("new_tone", "")

        # Simple proximity: 1.0 if same tone, 0.5 otherwise
        prox = 1.0 if old_tone == new_tone and old_tone else 0.5
        redirect_rate = 0.3 + prox * 0.7

        energy_to_redirect = old_energy * redirect_rate if redirect_energy else 0.0
        energy_haunting = old_energy * (1 - redirect_rate)

        # Update old moment
        update_old = """
        MATCH (m:Moment {id: $id})
        SET m.status =,
            m.tick_resolved = $tick,
            m.energy = $haunting
        """
        self.graph_queries.query(
            update_old,
            params={"id": moment_id, "tick": current_tick, "haunting": energy_haunting}
        )

        # Add redirected energy to new moment
        if energy_to_redirect > 0:
            update_new = """
            MATCH (m:Moment {id: $id})
            SET m.energy = m.energy + $energy
            """
            self.graph_queries.query(
                update_new,
                params={"id": overriding_moment_id, "energy": energy_to_redirect}
            )

        # Create overrides link
        link_query = """
        MATCH (m1:Moment {id: $overriding_id})
        MATCH (m2:Moment {id: $overridden_id})
        MERGE (m1)-[:OVERRIDES {energy_redirected: $energy}]->(m2)
        """
        self.graph_queries.query(
            link_query,
            params={
                "overriding_id": overriding_moment_id,
                "overridden_id": moment_id,
                "energy": energy_to_redirect
            }
        )

        logger.info(f"[CanonHolder] Overrode moment {moment_id}. Redirected {energy_to_redirect:.2f}, haunting {energy_haunting:.2f}")
        return (True, energy_to_redirect)

    # =========================================================================
    # MOMENT RECALL/REACTIVATION (v1.2)
    # =========================================================================

    def recall_moment(
        self,
        moment_id: str,
        current_tick: int,
        recall_trigger: str = None,
        actor_id: str = None
    ) -> Tuple[bool, str]:
        """
        Recall a completed or interrupted moment for re-experience.

        Transition: completed/interrupted → possible (via new recall moment)

        This creates a "memory recall" — the original moment stays in its state,
        but a new RECALL moment is created that references it. The recall moment
        draws energy from the recalling actor and can become active like any other.

        Args:
            moment_id: The moment to recall (must be completed or interrupted)
            current_tick: Current world tick
            recall_trigger: What triggered the recall (narrative, location, actor)
            actor_id: The actor doing the recalling (default: player)

        Returns:
            (success, recall_moment_id or error message)
        """
        # Get original moment
        moment = self.graph_queries.query(
            """MATCH (m:Moment {id: $id})
            RETURN m.status as status, m.content as text, m.tone as tone,
                   m.emotions as emotions, m.weight as weight""",
            params={"id": moment_id}
        )

        if not moment:
            return (False, f"Moment {moment_id} not found")

        moment_data = moment[0]
        status = moment_data.get("status", "unknown")

        # Only completed or interrupted moments can be recalled
        if status not in ["completed"]:
            return (False, f"Cannot recall moment in status '{status}' (must be completed or interrupted)")

        # Create recall moment ID
        import hashlib
        recall_id = f"recall_{moment_id}_{current_tick}"

        # Get actors from original moment for the recall
        actors_query = """
        MATCH (a:Actor)-[r]->(m:Moment {id: $moment_id})
        WHERE type(r) IN ['EXPRESSES', 'CAN_SPEAK']
        RETURN a.id as actor_id
        """
        actors = self.graph_queries.query(actors_query, params={"moment_id": moment_id})
        actor_ids = [a.get("actor_id") for a in actors if a.get("actor_id")]

        # Create the recall moment
        original_text = moment_data.get("content", "")
        recall_text = f"[Memory: {original_text}]"

        create_query = """
        CREATE (m:Moment {
            id: $recall_id,
            node_type: 'moment',
            text: $text,
            status: 'possible',
            tone: $tone,
            emotions: $emotions,
            weight: $weight,
            is_recall: true,
            recalls_moment: $original_id,
            recall_trigger: $trigger,
            tick_created: $tick,
            energy: 0.0
        })
        RETURN m.id as id
        """
        result = self.graph_queries.query(
            create_query,
            params={
                "recall_id": recall_id,
                "content": recall_text,
                "tone": moment_data.get("tone", "reflective"),
                "emotions": moment_data.get("emotions", []),
                "weight": (moment_data.get("weight", 1.0) or 1.0) * 0.7,  # Recalls have reduced weight
                "original_id": moment_id,
                "trigger": recall_trigger or "unknown",
                "tick": current_tick
            }
        )

        if not result:
            return (False, "Failed to create recall moment")

        # Link recall moment to original via RECALLS relationship
        link_query = """
        MATCH (recall:Moment {id: $recall_id})
        MATCH (original:Moment {id: $original_id})
        CREATE (recall)-[:RECALLS {
            tick: $tick,
            trigger: $trigger
        }]->(original)
        """
        self.graph_queries.query(
            link_query,
            params={
                "recall_id": recall_id,
                "original_id": moment_id,
                "tick": current_tick,
                "trigger": recall_trigger or "unknown"
            }
        )

        # Link actors to recall moment (CAN_SPEAK, not EXPRESSES yet)
        recaller_id = actor_id or "char_player"
        for aid in actor_ids:
            # Primary recaller gets CAN_SPEAK link
            link_type = "CAN_SPEAK" if aid == recaller_id else "WITNESSES"
            actor_link = f"""
            MATCH (a:Actor {{id: '{aid}'}})
            MATCH (m:Moment {{id: '{recall_id}'}})
            CREATE (a)-[:{link_type} {{
                weight: 0.5,
                energy: 0.0
            }}]->(m)
            """
            self.graph_queries.query(actor_link)

        # Copy narrative links from original to recall
        narrative_copy = """
        MATCH (original:Moment {id: $original_id})-[r:ABOUT]->(n:Narrative)
        MATCH (recall:Moment {id: $recall_id})
        CREATE (recall)-[:ABOUT {
            weight: coalesce(r.weight, 1.0) * 0.7
        }]->(n)
        """
        self.graph_queries.query(
            narrative_copy,
            params={"original_id": moment_id, "recall_id": recall_id}
        )

        logger.info(f"[CanonHolder] Created recall moment {recall_id} for {moment_id} (trigger: {recall_trigger})")
        return (True, recall_id)

    def get_recallable_moments(
        self,
        actor_id: str = None,
        narrative_id: str = None,
        location_id: str = None,
        limit: int = 10
    ) -> List[Dict[str, Any]]:
        """
        Find moments that can be recalled based on context.

        Moments are recallable if:
        - Status is 'completed' or 'interrupted'
        - Connected to the specified actor, narrative, or location
        - Has sufficient weight (not fully faded)

        Args:
            actor_id: Filter by actor participation
            narrative_id: Filter by narrative connection
            location_id: Filter by location
            limit: Maximum moments to return

        Returns:
            List of recallable moment dicts with relevance scores
        """
        conditions = ["m.status IN ['completed']"]
        params = {"limit": limit}

        if actor_id:
            conditions.append("EXISTS((a:Actor {id: $actor_id})-[]->(m))")
            params["actor_id"] = actor_id

        if narrative_id:
            conditions.append("EXISTS((m)-[:ABOUT]->(n:Narrative {id: $narrative_id}))")
            params["narrative_id"] = narrative_id

        if location_id:
            conditions.append("EXISTS((m)-[:AT]->(l:Space {id: $location_id}))")
            params["location_id"] = location_id

        where_clause = " AND ".join(conditions)

        query = f"""
        MATCH (m:Moment)
        WHERE {where_clause}
        OPTIONAL MATCH (a:Actor)-[r]->(m)
        WITH m, count(DISTINCT a) as actor_count
        RETURN m.id as id, m.content as text, m.status as status,
               m.weight as weight, m.tick_resolved as tick_resolved,
               m.tone as tone, actor_count,
               coalesce(m.weight, 0.5) * (1 + actor_count * 0.1) as relevance
        ORDER BY relevance DESC
        LIMIT $limit
        """

        results = self.graph_queries.query(query, params=params)
        return results or []

    def reactivate_moment(
        self,
        moment_id: str,
        current_tick: int,
        new_context: Dict[str, Any] = None
    ) -> Tuple[bool, str]:
        """
        Reactivate a rejected or interrupted moment with new context.

        Unlike recall (which creates a new moment referencing the old),
        reactivation attempts to revive the original moment if conditions
        have changed (e.g., blocking actor is now dead, contradiction resolved).

        Transition: rejected/interrupted → possible

        Args:
            moment_id: The moment to reactivate
            current_tick: Current world tick
            new_context: Optional new context to attach

        Returns:
            (success, message)
        """
        # Get moment
        moment = self.graph_queries.query(
            """MATCH (m:Moment {id: $id})
            RETURN m.status as status, m.energy as energy""",
            params={"id": moment_id}
        )

        if not moment:
            return (False, f"Moment {moment_id} not found")

        status = moment[0].get("status", "unknown")

        # Only rejected or interrupted moments can be reactivated
        if status not in ["failed"]:
            return (False, f"Cannot reactivate moment in status '{status}' (must be rejected or interrupted)")

        # Re-validate before reactivation
        validation = self.validate_for_activation(moment_id)
        if not validation.valid:
            return (False, f"Still invalid: {validation.reason}")

        # Reactivate: set back to possible with some initial energy
        base_energy = 0.1  # Small initial energy to restart accumulation

        update_query = """
        MATCH (m:Moment {id: $id})
        SET m.status = 'possible',
            m.energy = $energy,
            m.tick_reactivated = $tick,
            m.reactivation_count = coalesce(m.reactivation_count, 0) + 1
        RETURN m.id
        """
        self.graph_queries.query(
            update_query,
            params={"id": moment_id, "energy": base_energy, "tick": current_tick}
        )

        # Record reactivation context if provided
        if new_context:
            context_query = """
            MATCH (m:Moment {id: $id})
            SET m.reactivation_context = $context
            """
            self.graph_queries.query(
                context_query,
                params={"id": moment_id, "context": str(new_context)}
            )

        logger.info(f"[CanonHolder] Reactivated moment {moment_id} at tick {current_tick}")
        return (True, f"Moment {moment_id} reactivated to 'possible' status")

    # =========================================================================
    # LEGACY API (backwards compat)
    # =========================================================================

    def record_to_canon(self, tick_result: Any) -> None:
        """
        Legacy API: Record completed moments from tick result.

        In v1.2, completion is handled by tick_v1_2.py Phase 7.
        This method is kept for backwards compatibility.
        """
        if tick_result is None:
            return

        completions = getattr(tick_result, 'completions', [])
        for completion in completions:
            moment_id = completion.get('moment_id')
            if moment_id:
                logger.info(f"[CanonHolder] Recorded completion: {moment_id}")
