"""
Moment and View Query Methods

Mixin class providing moment-related query methods for GraphQueries.
Extracted from graph_queries.py to reduce file size.

DOCS: docs/physics/IMPLEMENTATION_Physics.md

Usage:
    This module is automatically mixed into GraphQueries.
    Use it via the main GraphQueries class:

    from runtime.physics.graph.graph_queries import GraphQueries

    graph = GraphQueries()

    # Moment queries
    moment = graph.get_moment("moment_001")
    moments = graph.get_moments_at_place("place_camp")

    # View queries (Moment Graph Architecture)
    view = graph.get_current_view("char_player", "place_camp")
    live = graph.get_live_moments("place_camp", ["char_aldric"])
"""

import json
import logging
import numpy as np
from typing import Dict, Any, List, Optional, Callable

logger = logging.getLogger(__name__)


class MomentQueryMixin:
    """
    Mixin class providing moment and view query methods.

    These methods are mixed into GraphQueries to provide moment-related
    functionality while keeping the main file smaller.

    Prerequisites:
        - self._query(cypher, params) method
        - self._parse_node(row, fields) method
        - self.get_characters_at(place_id) method
        - self.get_place(place_id) method
        - self.get_character(char_id) method
    """

    def _maybe_inject_energy(self, label: str, node_id: str) -> None:
        injector = getattr(self, "_inject_energy_for_node", None)
        if not injector or not node_id:
            return
        try:
            injector(label, node_id)
        except Exception as exc:
            logger.debug("[MomentQueryMixin] Energy injection skipped (%s:%s): %s", label, node_id, exc)

    # =========================================================================
    # MOMENT QUERIES
    # =========================================================================

    def get_moment(self, moment_id: str) -> Optional[Dict[str, Any]]:
        """
        Get a single moment by ID, including speaker via SAID link.

        Returns moment with all fields including lifecycle state (status, weight, tone).
        """
        cypher = """
        MATCH (m:Moment {id: $id})
        OPTIONAL MATCH (c:Actor)-[:SAID]->(m)
        RETURN m.id, m.content, m.type, m.tick_created, m.line,
               m.status, m.weight, m.tone, m.tick_resolved, m.tick_resolved,
               c.id as speaker
        """
        rows = self._query(cypher, {"id": moment_id})
        if not rows:
            return None
        fields = ["id", "content", "type", "tick_created", "line",
                  "status", "weight", "tone", "tick_resolved", "tick_resolved",
                  "speaker"]
        moment = self._parse_node(rows[0], fields)
        self._maybe_inject_energy("Moment", moment.get("id"))
        return moment

    def get_moments_at_place(
        self,
        place_id: str,
        limit: int = 50
    ) -> List[Dict[str, Any]]:
        """
        Get moments that occurred at a specific place, including speaker via SAID link.
        """
        cypher = f"""
        MATCH (m:Moment)-[:AT]->(p:Space {{id: '{place_id}'}})
        OPTIONAL MATCH (c:Actor)-[:SAID]->(m)
        RETURN m.id, m.content, m.type, m.tick_created, m.line, c.id as speaker
        ORDER BY m.tick_created DESC
        LIMIT {limit}
        """
        rows = self._query(cypher)
        fields = ["id", "content", "type", "tick_created", "line", "speaker"]
        moments = []
        for row in rows:
            moment = self._parse_node(row, fields)
            self._maybe_inject_energy("Moment", moment.get("id"))
            moments.append(moment)
        return moments

    def get_moments_by_character(
        self,
        character_id: str,
        limit: int = 50
    ) -> List[Dict[str, Any]]:
        """
        Get moments where a character spoke or acted (via SAID link).
        """
        cypher = f"""
        MATCH (c:Actor {{id: '{character_id}'}})-[:SAID]->(m:Moment)
        RETURN m.id, m.content, m.type, m.tick_created, m.line
        ORDER BY m.tick_created DESC
        LIMIT {limit}
        """
        rows = self._query(cypher)
        fields = ["id", "content", "type", "tick_created", "line"]
        moments = []
        for row in rows:
            moment = self._parse_node(row, fields)
            self._maybe_inject_energy("Moment", moment.get("id"))
            moments.append(moment)
        return moments

    def get_moments_in_tick_range(
        self,
        start_tick: int,
        end_tick: int,
        place_id: str = None
    ) -> List[Dict[str, Any]]:
        """
        Get moments within a tick range, optionally filtered by place.
        """
        if place_id:
            cypher = f"""
            MATCH (m:Moment)-[:AT]->(p:Space {{id: '{place_id}'}})
            WHERE m.tick_created >= {start_tick} AND m.tick_created <= {end_tick}
            OPTIONAL MATCH (c:Actor)-[:SAID]->(m)
            RETURN m.id, m.content, m.type, m.tick_created, m.line, c.id as speaker
            ORDER BY m.tick_created ASC
            """
        else:
            cypher = f"""
            MATCH (m:Moment)
            WHERE m.tick_created >= {start_tick} AND m.tick_created <= {end_tick}
            OPTIONAL MATCH (c:Actor)-[:SAID]->(m)
            RETURN m.id, m.content, m.type, m.tick_created, m.line, c.id as speaker
            ORDER BY m.tick_created ASC
            """
        rows = self._query(cypher)
        fields = ["id", "content", "type", "tick_created", "line", "speaker"]
        moments = []
        for row in rows:
            moment = self._parse_node(row, fields)
            self._maybe_inject_energy("Moment", moment.get("id"))
            moments.append(moment)
        return moments

    def get_moment_sequence(
        self,
        start_moment_id: str,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """
        Get a sequence of moments starting from a given moment (following THEN links).
        """
        cypher = f"""
        MATCH path = (start:Moment {{id: '{start_moment_id}'}})-[:THEN*0..{limit}]->(m:Moment)
        OPTIONAL MATCH (c:Actor)-[:SAID]->(m)
        RETURN m.id, m.content, m.type, m.tick_created, m.line, c.id as speaker, length(path) as depth
        ORDER BY depth ASC
        """
        rows = self._query(cypher)
        fields = ["id", "content", "type", "tick_created", "line", "speaker", "depth"]
        moments = []
        for row in rows:
            moment = self._parse_node(row, fields)
            self._maybe_inject_energy("Moment", moment.get("id"))
            moments.append(moment)
        return moments

    def get_narrative_moments(
        self,
        narrative_id: str
    ) -> List[Dict[str, Any]]:
        """
        Get all moments that are sources for a narrative (via FROM link).
        """
        cypher = f"""
        MATCH (n:Narrative {{id: '{narrative_id}'}})-[:FROM]->(m:Moment)
        OPTIONAL MATCH (c:Actor)-[:SAID]->(m)
        RETURN m.id, m.content, m.type, m.tick_created, m.line, c.id as speaker
        ORDER BY m.tick_created ASC
        """
        rows = self._query(cypher)
        fields = ["id", "content", "type", "tick_created", "line", "speaker"]
        moments = []
        for row in rows:
            moment = self._parse_node(row, fields)
            self._maybe_inject_energy("Moment", moment.get("id"))
            moments.append(moment)
        return moments

    def get_narratives_from_moment(
        self,
        moment_id: str
    ) -> List[Dict[str, Any]]:
        """
        Get all narratives that cite this moment as a source.
        """
        cypher = f"""
        MATCH (n:Narrative)-[:FROM]->(m:Moment {{id: '{moment_id}'}})
        RETURN n.id, n.name, n.content, n.type
        """
        rows = self._query(cypher)
        fields = ["id", "name", "content", "type"]
        narratives = []
        for row in rows:
            narrative = self._parse_node(row, fields)
            self._maybe_inject_energy("Narrative", narrative.get("id"))
            narratives.append(narrative)
        return narratives

    def search_moments(
        self,
        query: str,
        embed_fn: Callable[[str], List[float]],
        top_k: int = 10
    ) -> List[Dict[str, Any]]:
        """
        Semantic search across moments.

        Args:
            query: Search query text
            embed_fn: Function to generate embedding from text
            top_k: Number of results to return
        """
        query_embedding = embed_fn(query)
        return self._find_similar_moments_by_embedding(query_embedding, top_k)

    def _find_similar_moments_by_embedding(
        self,
        embedding: List[float],
        top_k: int
    ) -> List[Dict[str, Any]]:
        """
        Find similar moments by embedding vector (brute force cosine similarity).
        """
        # Get all moments with embeddings, speaker via SAID link
        cypher = """
        MATCH (n:Moment)
        WHERE n.embedding IS NOT NULL
        OPTIONAL MATCH (c:Actor)-[:SAID]->(n)
        RETURN n.id, n.content, n.type, n.tick_created, n.embedding, c.id as speaker
        """
        rows = self._query(cypher)

        if not rows:
            return []

        # Calculate similarities
        results = []
        query_vec = np.array(embedding)
        query_norm = np.linalg.norm(query_vec)

        for row in rows:
            node_embedding = row[4]  # embedding is 5th field (index 4)
            if node_embedding:
                if isinstance(node_embedding, str):
                    node_embedding = json.loads(node_embedding)
                node_vec = np.array(node_embedding)
                node_norm = np.linalg.norm(node_vec)
                if query_norm > 0 and node_norm > 0:
                    similarity = float(np.dot(query_vec, node_vec) / (query_norm * node_norm))
                moment_id = row[0]
                if moment_id:
                    self._maybe_inject_energy("Moment", moment_id)

                results.append({
                    "id": moment_id,
                    "content": row[1],
                    "type": row[2],
                    "tick_created": row[3],
                    "speaker": row[5],  # speaker is 6th field (index 5)
                    "score": similarity
                })

        # Sort by similarity and return top_k
        results.sort(key=lambda x: x["score"], reverse=True)
        return results[:top_k]

    # =========================================================================
    # VIEW QUERIES (Moment Graph Architecture)
    # =========================================================================

    def get_current_view(
        self,
        player_id: str,
        location_id: str,
        present_character_ids: List[str] = None
    ) -> Dict[str, Any]:
        """
        Get the current view of moments visible to the player.

        This is the core query for the Moment Graph Architecture.
        Returns moments that pass presence gating, ordered by weight.

        Args:
            player_id: The player character ID
            location_id: Current location ID
            present_character_ids: IDs of characters currently present
                                   (if None, queries automatically)

        Returns:
            Dict with:
                - location: Place dict
                - characters: List of present character dicts
                - active_moments: Spoken/active moments (current conversation)
                - possible_moments: Moments that could surface (sorted by weight)
                - transitions: Available CAN_LEAD_TO transitions from active moments
        """
        # Get present characters if not provided
        if present_character_ids is None:
            present = self.get_characters_at(location_id)
            present_character_ids = [c['id'] for c in present]
        else:
            present = [self.get_character(cid) for cid in present_character_ids]
            present = [c for c in present if c]  # Filter None

        # Get location
        location = self.get_place(location_id)

        # Get active/completed moments at this location
        active_moments = self.get_live_moments(
            location_id,
            present_character_ids,
            status_filter=['active', 'completed']
        )

        # Get possible moments that could surface
        possible_moments = self.get_live_moments(
            location_id,
            present_character_ids,
            status_filter=['possible']
        )

        # Get transitions from active moments
        active_ids = [m['id'] for m in active_moments]
        transitions = self.get_available_transitions(active_ids)

        return {
            "location": location,
            "characters": present,
            "active_moments": active_moments,
            "possible_moments": possible_moments,
            "transitions": transitions
        }

    def get_live_moments(
        self,
        location_id: str,
        present_character_ids: List[str],
        status_filter: List[str] = None,
        limit: int = 50
    ) -> List[Dict[str, Any]]:
        """
        Get moments that pass presence gating for the current context.

        Implements the core visibility rule: a moment is visible when ALL
        attachments with presence_required=true have their targets present.

        Args:
            location_id: Current location ID
            present_character_ids: IDs of characters currently present
            status_filter: List of status values to include (default: possible, active)
            limit: Max number of moments to return

        Returns:
            List of moment dicts sorted by weight DESC
        """
        if status_filter is None:
            status_filter = ['possible', 'active']

        # Convert lists to Cypher format
        status_list = str(status_filter)
        char_list = str(present_character_ids)

        # Query moments that pass presence gating
        # A moment passes if ALL of its presence_required attachments are satisfied
        cypher = f"""
        MATCH (m:Moment)
        WHERE m.status IN {status_list}

        // Get all presence-required attachments
        OPTIONAL MATCH (m)-[r:ATTACHED_TO {{presence_required: true}}]->(target)

        // Collect targets and check if all are present
        WITH m, collect(target) as required_targets

        // For each required target, check if it's "present":
        // - Character: must be in present_character_ids
        // - Place: must be the current location
        // - Thing/Narrative: always considered present (no location check)
        WHERE ALL(t IN required_targets WHERE
            (t:Actor AND t.id IN {char_list})
            OR (t:Space AND t.id = '{location_id}')
            OR (t:Thing)
            OR (t:Narrative)
        )

        // Get speaker if any
        OPTIONAL MATCH (speaker:Actor)-[:CAN_SPEAK]->(m)
        WHERE speaker.id IN {char_list}

        // Also check for SAID (for completed moments)
        OPTIONAL MATCH (said_by:Actor)-[:SAID]->(m)

        RETURN m.id, m.content, m.type, m.status, m.weight, m.tone,
               m.tick_created, m.tick_resolved,
               speaker.id as potential_speaker,
               said_by.id as actual_speaker
        ORDER BY m.weight DESC
        LIMIT {limit}
        """

        rows = self._query(cypher)
        fields = ["id", "content", "type", "status", "weight", "tone",
                  "tick_created", "tick_resolved",
                  "potential_speaker", "actual_speaker"]

        moments = []
        for row in rows:
            moment = self._parse_node(row, fields)
            # Use actual_speaker if available, otherwise potential_speaker
            moment['speaker'] = moment.pop('actual_speaker') or moment.pop('potential_speaker')
            self._maybe_inject_energy("Moment", moment.get("id"))
            moments.append(moment)

        return moments

    def resolve_speaker(
        self,
        moment_id: str,
        present_character_ids: List[str]
    ) -> Optional[Dict[str, Any]]:
        """
        Find which present character can speak a moment.

        For possible moments, returns the character with highest CAN_SPEAK weight
        among those currently present.

        Args:
            moment_id: The moment ID
            present_character_ids: IDs of characters currently present

        Returns:
            Dict with speaker info or None if no one can speak it
        """
        char_list = str(present_character_ids)

        cypher = f"""
        MATCH (c:Actor)-[r:CAN_SPEAK]->(m:Moment {{id: '{moment_id}'}})
        WHERE c.id IN {char_list}
        RETURN c.id, c.name, r.weight
        ORDER BY r.weight DESC
        LIMIT 1
        """

        rows = self._query(cypher)
        if not rows:
            return None

        return self._parse_node(rows[0], ["id", "name", "weight"])

    def get_available_transitions(
        self,
        active_moment_ids: List[str]
    ) -> List[Dict[str, Any]]:
        """
        Get available CAN_LEAD_TO transitions from active moments.

        Args:
            active_moment_ids: IDs of currently active moments

        Returns:
            List of transition dicts with:
                - from_id: Source moment ID
                - to_id: Target moment ID
                - trigger: player | wait | auto
                - require_words: Words that trigger this transition
                - weight_transfer: How much weight flows
        """
        if not active_moment_ids:
            return []

        moment_list = str(active_moment_ids)

        cypher = f"""
        MATCH (from:Moment)-[r:CAN_LEAD_TO]->(to:Moment)
        WHERE from.id IN {moment_list}
          AND to.status IN ['possible', "possible"]
        RETURN from.id as from_id, to.id as to_id,
               r.trigger, r.require_words, r.weight_transfer,
               r.bidirectional, r.consumes_origin
        """

        rows = self._query(cypher)
        fields = ["from_id", "to_id", "trigger", "require_words",
                  "weight_transfer", "bidirectional", "consumes_origin"]

        return [self._parse_node(row, fields) for row in rows]

    def get_clickable_words(
        self,
        moment_id: str
    ) -> List[Dict[str, Any]]:
        """
        Get all clickable words for a moment based on CAN_LEAD_TO links.

        Args:
            moment_id: The moment ID

        Returns:
            List of dicts with:
                - word: The clickable word
                - target_id: Where clicking leads
                - weight_transfer: How much weight flows
        """
        cypher = f"""
        MATCH (m:Moment {{id: '{moment_id}'}})-[r:CAN_LEAD_TO]->(target:Moment)
        WHERE r.trigger = 'player' AND r.require_words IS NOT NULL
        RETURN r.require_words, target.id, r.weight_transfer
        """

        rows = self._query(cypher)
        results = []

        for row in rows:
            words = row[0]
            if isinstance(words, str):
                words = json.loads(words)
            if words:
                for word in words:
                    results.append({
                        "word": word,
                        "target_id": row[1],
                        "weight_transfer": row[2]
                    })

        return results
