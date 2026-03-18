"""
Graph Operations: Link Creation Methods

Mixin class for creating links/relationships between nodes.
Extracted from graph_ops.py to reduce file size.

Usage:
    This is a mixin class - GraphOps inherits from it.
    All methods expect self._query() to be available.

Docs:
- docs/engine/GRAPH_OPERATIONS_GUIDE.md — mutation file format

v1.8: Link embeddings generated at creation time (D6: Link embedding = embed(synthesis))
"""

import json
import logging
from datetime import datetime
from typing import Dict, Any, List, Optional

logger = logging.getLogger(__name__)

# Lazy-loaded embedding service
_embed_service = None


def _get_link_embedding(props: Dict[str, Any], link_type: str) -> Optional[List[float]]:
    """
    Generate embedding for a link at creation time.

    Uses lazy-loaded EmbeddingService singleton. Returns None if
    embedding generation fails (graceful degradation for environments
    without sentence-transformers).

    Args:
        props: Link properties dict
        link_type: Link type string (e.g., 'ABOUT', 'RELATES_TO')

    Returns:
        Embedding vector or None
    """
    global _embed_service
    try:
        if _embed_service is None:
            from runtime.infrastructure.embeddings import get_embedding_service
            _embed_service = get_embedding_service()
        return _embed_service.embed_link(props, link_type)
    except Exception as e:
        logger.debug(f"[LinkCreation] Embedding skipped: {e}")
        return None


class LinkCreationMixin:
    """
    Mixin providing link/relationship creation operations for GraphOps.

    Methods for creating edges between nodes:
    - Moment links: SAID, AT, THEN, FROM, CAN_SPEAK, ATTACHED_TO, CAN_LEAD_TO
    - Character links: BELIEVES, AT (presence), CARRIES
    - Narrative links: RELATES_TO
    - Place links: CONNECTS (geography)
    - Thing links: LOCATED_AT

    Ref: docs/engine/GRAPH_OPERATIONS_GUIDE.md
    """

    # =========================================================================
    # MOMENT LINKS
    # =========================================================================

    def add_said(
        self,
        character_id: str,
        moment_id: str
    ) -> None:
        """
        Add SAID link from Character to Moment.

        Used for dialogue and player actions to track who said/did what.
        """
        cypher = """
        MATCH (c:Actor {id: $char_id})
        MATCH (m:Moment {id: $moment_id})
        MERGE (c)-[r:SAID]->(m)
        """
        self._query(cypher, {
            "char_id": character_id,
            "moment_id": moment_id
        })
        logger.debug(f"[GraphOps] Added said: {character_id} -> {moment_id}")

    def add_moment_at(
        self,
        moment_id: str,
        place_id: str
    ) -> None:
        """
        Add AT link from Moment to Place.

        Records where a moment occurred.
        """
        cypher = """
        MATCH (m:Moment {id: $moment_id})
        MATCH (p:Space {id: $place_id})
        MERGE (m)-[r:AT]->(p)
        """
        self._query(cypher, {
            "moment_id": moment_id,
            "place_id": place_id
        })
        logger.debug(f"[GraphOps] Added moment at: {moment_id} @ {place_id}")

    def add_moment_then(
        self,
        from_moment_id: str,
        to_moment_id: str
    ) -> None:
        """
        Add THEN link between Moments.

        Records sequence within a scene.
        """
        cypher = """
        MATCH (m1:Moment {id: $from_id})
        MATCH (m2:Moment {id: $to_id})
        MERGE (m1)-[r:THEN]->(m2)
        """
        self._query(cypher, {
            "from_id": from_moment_id,
            "to_id": to_moment_id
        })
        logger.debug(f"[GraphOps] Added sequence: {from_moment_id} -> {to_moment_id}")

    def add_narrative_from_moment(
        self,
        narrative_id: str,
        moment_id: str
    ) -> None:
        """
        Add FROM link from Narrative to Moment.

        Source attribution - which moments created this narrative.
        """
        cypher = """
        MATCH (n:Narrative {id: $narr_id})
        MATCH (m:Moment {id: $moment_id})
        MERGE (n)-[r:FROM]->(m)
        """
        self._query(cypher, {
            "narr_id": narrative_id,
            "moment_id": moment_id
        })
        logger.debug(f"[GraphOps] Added narrative source: {narrative_id} <- {moment_id}")

    def add_can_speak(
        self,
        character_id: str,
        moment_id: str,
        weight: float = 1.0
    ) -> None:
        """
        Add CAN_SPEAK link from Character to Moment.

        Indicates which characters can speak a potential moment.
        Used for dialogue routing - when a moment surfaces, find who CAN_SPEAK it.

        Args:
            character_id: Character who can speak this moment
            moment_id: The potential moment
            weight: How likely this character would speak it (default 1.0)
        """
        cypher = """
        MATCH (c:Actor {id: $char_id})
        MATCH (m:Moment {id: $moment_id})
        MERGE (c)-[r:CAN_SPEAK]->(m)
        SET r.weight = $weight
        """
        self._query(cypher, {
            "char_id": character_id,
            "moment_id": moment_id,
            "weight": weight
        })
        logger.debug(f"[GraphOps] Added can_speak: {character_id} -> {moment_id}")

    def add_attached_to(
        self,
        moment_id: str,
        target_id: str,
        presence_required: bool = False,
        persistent: bool = True,
        dies_with_target: bool = False
    ) -> None:
        """
        Add ATTACHED_TO link from Moment to any target node.

        Moments are attached to places, characters, narratives, things.
        This determines when moments surface based on context.

        Args:
            moment_id: The moment being attached
            target_id: What it's attached to (character, place, narrative, thing)
            presence_required: If true, moment only surfaces when target is present
            persistent: If true, goes dormant when target leaves, reactivates on return
                        If false, deleted when target leaves
            dies_with_target: If true, moment deleted if target is destroyed
        """
        cypher = """
        MATCH (m:Moment {id: $moment_id})
        MATCH (t {id: $target_id})
        MERGE (m)-[r:ATTACHED_TO]->(t)
        SET r.presence_required = $presence_required,
            r.persistent = $persistent,
            r.dies_with_target = $dies_with_target
        """
        self._query(cypher, {
            "moment_id": moment_id,
            "target_id": target_id,
            "presence_required": presence_required,
            "persistent": persistent,
            "dies_with_target": dies_with_target
        })
        logger.debug(f"[GraphOps] Added attached_to: {moment_id} -> {target_id}")

    def add_can_lead_to(
        self,
        from_moment_id: str,
        to_moment_id: str,
        trigger: str = "player",
        weight_transfer: float = 0.3,
        require_words: List[str] = None,
        bidirectional: bool = False,
        wait_ticks: int = None,
        consumes_origin: bool = True
    ) -> None:
        """
        Add CAN_LEAD_TO link between Moments.

        The core of dialogue flow. When from_moment is active/completed,
        to_moment becomes possible based on trigger conditions.

        Args:
            from_moment_id: The source moment
            to_moment_id: The target moment that can follow
            trigger: How the transition happens:
                - "player": Player click/input activates (default)
                - "auto": Automatic when from_moment completed
                - "wait": Auto-fires after wait_ticks of silence
            weight_transfer: How much weight flows from source to target
            require_words: Words that must appear in player input to trigger
            bidirectional: If true, create link in both directions
            wait_ticks: For trigger="wait", how many ticks of silence before firing
            consumes_origin: If true, origin status -> completed after traversal
                             If false, origin stays active
        """
        props = {
            "trigger": trigger,
            "weight_transfer": weight_transfer,
            "consumes_origin": consumes_origin
        }

        if require_words:
            props["require_words"] = json.dumps(require_words)
        if wait_ticks is not None:
            props["wait_ticks"] = wait_ticks

        cypher = """
        MATCH (m1:Moment {id: $from_id})
        MATCH (m2:Moment {id: $to_id})
        MERGE (m1)-[r:CAN_LEAD_TO]->(m2)
        SET r += $props
        """
        self._query(cypher, {
            "from_id": from_moment_id,
            "to_id": to_moment_id,
            "props": props
        })
        logger.debug(f"[GraphOps] Added can_lead_to: {from_moment_id} -> {to_moment_id}")

        # Create reverse link if bidirectional
        if bidirectional:
            cypher_reverse = """
            MATCH (m1:Moment {id: $from_id})
            MATCH (m2:Moment {id: $to_id})
            MERGE (m2)-[r:CAN_LEAD_TO]->(m1)
            SET r += $props
            """
            self._query(cypher_reverse, {
                "from_id": from_moment_id,
                "to_id": to_moment_id,
                "props": props
            })
            logger.debug(f"[GraphOps] Added bidirectional: {to_moment_id} -> {from_moment_id}")

    # =========================================================================
    # CHARACTER LINKS
    # =========================================================================

    def add_belief(
        self,
        character_id: str,
        narrative_id: str,
        heard: float = 0.0,
        believes: float = 0.0,
        doubts: float = 0.0,
        denies: float = 0.0,
        hides: float = 0.0,
        spreads: float = 0.0,
        originated: float = 0.0,
        source: str = "none",
        from_whom: str = None,
        where: str = None
    ) -> None:
        """
        Add or update a CHARACTER_NARRATIVE link (belief).

        This is how characters know things. There is no "knowledge" stat.

        Args:
            character_id: Who believes
            narrative_id: What they believe
            heard: 0-1, how much they know
            believes: 0-1, how certain
            doubts: 0-1, active uncertainty
            denies: 0-1, rejects as false
            hides: 0-1, conceals knowledge
            spreads: 0-1, actively promotes
            originated: 0-1, they created this narrative
            source: none, witnessed, told, inferred, assumed, taught
            from_whom: Who told them (if told)
        """
        # Determine role from relationship
        role = None
        if originated > 0.5:
            role = "originator"
        elif believes > 0.5:
            role = "believer"
        elif doubts > 0.5:
            role = "doubter"
        elif denies > 0.5:
            role = "denier"

        # Determine direction
        direction = None
        if believes > doubts and believes > denies:
            direction = "support"
        elif denies > believes:
            direction = "oppose"

        props = {
            "heard": heard,
            "believes": believes,
            "doubts": doubts,
            "denies": denies,
            "hides": hides,
            "spreads": spreads,
            "originated": originated,
            "source": source,
            "when": datetime.utcnow().isoformat()
        }

        if from_whom:
            props["from_whom"] = from_whom
        if where:
            props["where"] = where

        # Generate embedding for semantic scoring
        embed_props = {"role": role, "direction": direction}
        embedding = _get_link_embedding(embed_props, "BELIEVES")

        if embedding:
            props["embedding"] = embedding

        cypher = """
        MATCH (c:Actor {id: $char_id})
        MATCH (n:Narrative {id: $narr_id})
        MERGE (c)-[r:BELIEVES]->(n)
        SET r += $props
        """
        self._query(cypher, {
            "char_id": character_id,
            "narr_id": narrative_id,
            "props": props
        })
        logger.info(f"[GraphOps] Added belief: {character_id} -> {narrative_id}")

    def add_presence(
        self,
        character_id: str,
        place_id: str,
        present: float = 1.0,
        visible: float = 1.0
    ) -> None:
        """
        Add or update a CHARACTER_PLACE link (physical presence).

        Ground truth - where character IS.

        Args:
            character_id: Who
            place_id: Where
            present: 0-1 (usually 1.0 = here, 0.0 = not here)
            visible: 0-1 (0 = hiding, 1 = visible)
        """
        props = {
            "present": present,
            "visible": visible
        }

        cypher = """
        MATCH (c:Actor {id: $char_id})
        MATCH (p:Space {id: $place_id})
        MERGE (c)-[r:AT]->(p)
        SET r += $props
        """
        self._query(cypher, {
            "char_id": character_id,
            "place_id": place_id,
            "props": props
        })
        logger.info(f"[GraphOps] Added presence: {character_id} at {place_id}")

    def move_character(
        self,
        character_id: str,
        to_place_id: str,
        visible: float = 1.0
    ) -> None:
        """
        Move a character to a new location.

        Removes all previous AT links and creates new one.

        Args:
            character_id: Who to move
            to_place_id: Where to move them
            visible: 0-1 visibility at new location
        """
        # Remove all existing AT links
        cypher_remove = """
        MATCH (c:Actor {id: $char_id})-[r:AT]->()
        DELETE r
        """
        self._query(cypher_remove, {"char_id": character_id})

        # Add new presence
        self.add_presence(character_id, to_place_id, present=1.0, visible=visible)
        logger.info(f"[GraphOps] Moved {character_id} to {to_place_id}")

    def add_possession(
        self,
        character_id: str,
        thing_id: str,
        carries: float = 1.0,
        carries_hidden: float = 0.0
    ) -> None:
        """
        Add or update a CHARACTER_THING link (physical possession).

        Ground truth - what character HAS.

        Args:
            character_id: Who has it
            thing_id: What they have
            carries: 0-1 (1 = has it)
            carries_hidden: 0-1 (1 = secretly)
        """
        props = {
            "carries": carries,
            "carries_hidden": carries_hidden
        }

        cypher = """
        MATCH (c:Actor {id: $char_id})
        MATCH (t:Thing {id: $thing_id})
        MERGE (c)-[r:CARRIES]->(t)
        SET r += $props
        """
        self._query(cypher, {
            "char_id": character_id,
            "thing_id": thing_id,
            "props": props
        })
        logger.info(f"[GraphOps] Added possession: {character_id} carries {thing_id}")

    # =========================================================================
    # NARRATIVE LINKS
    # =========================================================================

    def add_narrative_link(
        self,
        source_id: str,
        target_id: str,
        contradicts: float = 0.0,
        supports: float = 0.0,
        elaborates: float = 0.0,
        subsumes: float = 0.0,
        supersedes: float = 0.0,
        name: str = "",
        description: str = ""
    ) -> None:
        """
        Add or update a NARRATIVE_NARRATIVE link.

        How stories relate to each other.

        Args:
            source_id: Source narrative
            target_id: Target narrative
            contradicts: 0-1, cannot both be true
            supports: 0-1, reinforce each other
            elaborates: 0-1, adds detail
            subsumes: 0-1, specific case of
            supersedes: 0-1, replaces (old fades)
            name: Optional link name for embedding
            description: Optional description for embedding
        """
        # Determine direction from relationship strengths
        direction = None
        if supports > 0.5:
            direction = "support"
        elif contradicts > 0.5:
            direction = "oppose"
        elif elaborates > 0.5:
            direction = "elaborate"
        elif subsumes > 0.5:
            direction = "subsume"
        elif supersedes > 0.5:
            direction = "supersede"

        props = {
            "contradicts": contradicts,
            "supports": supports,
            "elaborates": elaborates,
            "subsumes": subsumes,
            "supersedes": supersedes
        }

        # Generate embedding for semantic scoring
        embed_props = {"name": name, "description": description, "direction": direction}
        embedding = _get_link_embedding(embed_props, "RELATES_TO")

        if embedding:
            props["embedding"] = embedding

        cypher = """
        MATCH (s:Narrative {id: $source_id})
        MATCH (t:Narrative {id: $target_id})
        MERGE (s)-[r:RELATES_TO]->(t)
        SET r += $props
        """
        self._query(cypher, {
            "source_id": source_id,
            "target_id": target_id,
            "props": props
        })
        logger.info(f"[GraphOps] Added narrative link: {source_id} -> {target_id}")

    # =========================================================================
    # THING LINKS
    # =========================================================================

    def add_thing_location(
        self,
        thing_id: str,
        place_id: str,
        located: float = 1.0,
        hidden: float = 0.0,
        specific_location: str = None
    ) -> None:
        """
        Add or update a THING_PLACE link (where uncarried thing is).

        Ground truth - where thing IS (when not carried).

        Args:
            thing_id: What
            place_id: Where
            located: 0-1 (1 = here)
            hidden: 0-1 (1 = concealed)
            specific_location: "under the altar", "in the chest"
        """
        props = {
            "located": located,
            "hidden": hidden
        }

        if specific_location:
            props["specific_location"] = specific_location

        cypher = """
        MATCH (t:Thing {id: $thing_id})
        MATCH (p:Space {id: $place_id})
        MERGE (t)-[r:LOCATED_AT]->(p)
        SET r += $props
        """
        self._query(cypher, {
            "thing_id": thing_id,
            "place_id": place_id,
            "props": props
        })
        logger.info(f"[GraphOps] Added thing location: {thing_id} at {place_id}")

    # =========================================================================
    # PLACE LINKS
    # =========================================================================

    def add_geography(
        self,
        from_place_id: str,
        to_place_id: str,
        contains: float = 0.0,
        path: float = 0.0,
        path_distance: str = None,
        path_difficulty: str = "moderate",
        borders: float = 0.0
    ) -> None:
        """
        Add or update a PLACE_PLACE link (geography).

        Ground truth - how places connect.

        Args:
            from_place_id: Source place
            to_place_id: Target place
            contains: 0-1 (from contains to)
            path: 0-1 (can travel between)
            path_distance: "2 days", "4 hours", "adjacent"
            path_difficulty: easy, moderate, hard, dangerous, impassable
            borders: 0-1 (share a border)
        """
        props = {
            "contains": contains,
            "path": path,
            "path_difficulty": path_difficulty,
            "borders": borders
        }

        if path_distance:
            props["path_distance"] = path_distance

        cypher = """
        MATCH (f:Space {id: $from_id})
        MATCH (t:Space {id: $to_id})
        MERGE (f)-[r:CONNECTS]->(t)
        SET r += $props
        """
        self._query(cypher, {
            "from_id": from_place_id,
            "to_id": to_place_id,
            "props": props
        })
        logger.info(f"[GraphOps] Added geography: {from_place_id} -> {to_place_id}")

    def add_contains(
        self,
        parent_place_id: str,
        child_place_id: str
    ) -> None:
        """
        Add CONTAINS link from parent Place to child Place.

        Hierarchical containment - this place is inside that place.
        Binary relationship, no attributes.

        Example:
            place_york CONTAINS place_york_market
            place_york_market CONTAINS place_merchants_hall

        Args:
            parent_place_id: The containing place
            child_place_id: The place inside it
        """
        cypher = """
        MATCH (parent:Space {id: $parent_id})
        MATCH (child:Space {id: $child_id})
        MERGE (parent)-[r:CONTAINS]->(child)
        """
        self._query(cypher, {
            "parent_id": parent_place_id,
            "child_id": child_place_id
        })
        logger.info(f"[GraphOps] Added contains: {parent_place_id} -> {child_place_id}")

    # =========================================================================
    # QUERY/ATTENTION LINKS
    # =========================================================================

    def add_about(
        self,
        moment_id: str,
        target_id: str,
        weight: float = 0.5,
        description: str = ""
    ) -> None:
        """
        Add ABOUT link from Moment to any node.

        Used by World Builder to connect query moments to results.
        Physics flows energy through ABOUT links - what gets thought about
        becomes more salient.

        Args:
            moment_id: The query/thought moment
            target_id: What the moment is about (character, place, thing, narrative, moment)
            weight: Connection strength (default 0.5)
            description: Optional description for embedding
        """
        # Generate embedding for semantic scoring
        props = {"weight": weight, "description": description}
        embedding = _get_link_embedding(props, "ABOUT")

        if embedding:
            cypher = """
            MATCH (m:Moment {id: $moment_id})
            MATCH (t {id: $target_id})
            MERGE (m)-[r:ABOUT]->(t)
            SET r.weight = $weight, r.embedding = $embedding
            """
            self._query(cypher, {
                "moment_id": moment_id,
                "target_id": target_id,
                "weight": weight,
                "embedding": embedding
            })
        else:
            cypher = """
            MATCH (m:Moment {id: $moment_id})
            MATCH (t {id: $target_id})
            MERGE (m)-[r:ABOUT]->(t)
            SET r.weight = $weight
            """
            self._query(cypher, {
                "moment_id": moment_id,
                "target_id": target_id,
                "weight": weight
            })
        logger.debug(f"[GraphOps] Added about: {moment_id} -> {target_id}")
