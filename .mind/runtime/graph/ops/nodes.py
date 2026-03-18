"""
Graph Operations

Write mutations to the graph database via YAML/JSON files.
Supports FalkorDB and Neo4j via configurable adapter.

Usage:
    from runtime.physics.graph.graph_ops import GraphOps

    write = GraphOps()

    # Apply a mutation file
    result = write.apply(path="mutations/scene_001.yaml")

    if result.errors:
        for error in result.errors:
            print(f"{error['item']}: {error['message']}")
            print(f"  Fix: {error['fix']}")

Docs:
- docs/engine/moments/SCHEMA_Moments.md — node/link schema for the moment graph
- docs/engine/moments/ALGORITHM_Transitions.md — how mutations should behave
- docs/engine/GRAPH_OPERATIONS_GUIDE.md — mutation file format

DOCS: docs/physics/graph/PATTERNS_Graph.md
"""

import json
import logging
import numpy as np
from typing import Dict, Any, List, Optional
from datetime import datetime
from runtime.infrastructure.database import get_database_adapter
from runtime.physics.graph.graph_ops_moments import MomentOperationsMixin
from runtime.physics.graph.graph_ops_apply import ApplyOperationsMixin
from runtime.physics.graph.graph_ops_links import LinkCreationMixin
from runtime.physics.graph.graph_ops_image import generate_node_image
from runtime.physics.graph.graph_ops_events import (
    add_mutation_listener,
    remove_mutation_listener,
    emit_event as _emit_event
)
from runtime.physics.graph.graph_ops_types import (
    WriteError,
    SimilarNode,
    ApplyResult,
    SIMILARITY_THRESHOLD
)
from runtime.physics.graph.graph_ops_read_only_interface import (
    GraphReadOps,
    get_graph_reader,
)

logger = logging.getLogger(__name__)


class GraphOps(MomentOperationsMixin, ApplyOperationsMixin, LinkCreationMixin):
    """
    Simple interface for graph database operations.

    All functions use MERGE (upsert) - safe to call multiple times.
    Supports FalkorDB and Neo4j via configurable adapter.

    Inherits moment lifecycle methods from MomentOperationsMixin:
    - handle_click(): Handle player word clicks
    - update_moment_weight(): Update moment weights
    - propagate_embedding_energy(): Propagate energy through graph
    - decay_moments(): Apply weight decay
    - on_player_leaves_location(): Handle player departure
    - on_player_arrives_location(): Handle player arrival
    - garbage_collect_moments(): Remove old decayed moments
    - boost_moment_weight(): Boost moment weights
    """

    def __init__(
        self,
        graph_name: str = "blood_ledger",
        host: str = "localhost",
        port: int = 6379
    ):
        """
        Initialize GraphOps with database adapter.

        Args:
            graph_name: Name of the graph (default: blood_ledger)
            host: Database host (used if no config file, default: localhost)
            port: Database port (used if no config file, default: 6379)
        """
        # Use adapter factory - it handles configuration
        try:
            self._adapter = get_database_adapter(graph_name=graph_name)
            self.graph_name = self._adapter.graph_name

            # For backward compatibility, expose graph attribute
            # (some mixins may use self.graph directly)
            self.graph = getattr(self._adapter, 'graph', None)
            self.db = getattr(self._adapter, '_db', None)

            logger.info(f"[GraphOps] Connected to {self.graph_name}")
        except Exception as e:
            raise WriteError(
                f"Cannot connect to database",
                f"""1. Check database is running

2. Check configuration in engine/data/database_config.yaml

3. Or set environment variables:
   DATABASE_BACKEND=falkordb
   FALKORDB_HOST=localhost
   FALKORDB_PORT=6379

Error: {e}"""
            )

    def _query(self, cypher: str, params: Dict[str, Any] = None) -> List:
        """Execute a Cypher query via the database adapter."""
        try:
            return self._adapter.query(cypher, params)
        except Exception as e:
            error_str = str(e)
            if "already exists" in error_str.lower():
                raise WriteError(
                    f"Node or link already exists",
                    "This is usually fine - MERGE updates existing nodes.\n"
                    "If you want to update, just call the same function again with new values."
                )
            elif "property" in error_str.lower() and "not found" in error_str.lower():
                raise WriteError(
                    f"Invalid property: {error_str}",
                    "Check that you're using valid property names from the schema.\n"
                    "See: docs/engine/SCHEMA.md"
                )
            elif "syntax" in error_str.lower():
                raise WriteError(
                    f"Cypher syntax error: {error_str}",
                    f"This is likely a bug in graph_ops.py. Query was:\n{cypher}"
                )
            else:
                raise WriteError(
                    f"Write failed: {error_str}",
                    f"Query: {cypher}\nParams: {params}"
                )

    # =========================================================================
    # DUPLICATE DETECTION
    # =========================================================================

    def _cosine_similarity(self, a: List[float], b: List[float]) -> float:
        """Calculate cosine similarity between two vectors."""
        a = np.array(a)
        b = np.array(b)
        if np.linalg.norm(a) == 0 or np.linalg.norm(b) == 0:
            return 0.0
        return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))

    def _find_similar_nodes(
        self,
        label: str,
        embedding: List[float],
        threshold: float = SIMILARITY_THRESHOLD
    ) -> List[SimilarNode]:
        """
        Find nodes with embeddings similar to the given embedding.

        Args:
            label: Node label (Actor, Space, Thing, Narrative)
            embedding: The embedding to compare against
            threshold: Minimum similarity to return (default 0.85)

        Returns:
            List of SimilarNode objects above threshold, sorted by similarity
        """
        if not embedding:
            return []

        # Get all nodes of this type with embeddings
        cypher = f"""
        MATCH (n:{label})
        WHERE n.embedding IS NOT NULL
        RETURN n.id, n.name, n.embedding
        """

        try:
            rows = self._query(cypher)
            if not rows:
                return []

            similar = []
            for row in rows:
                if len(row) >= 3 and row[2]:
                    node_id = row[0]
                    node_name = row[1]
                    node_embedding = json.loads(row[2]) if isinstance(row[2], str) else row[2]

                    sim = self._cosine_similarity(embedding, node_embedding)
                    if sim >= threshold:
                        similar.append(SimilarNode(
                            id=node_id,
                            name=node_name,
                            node_type=label.lower(),
                            similarity=sim
                        ))

            # Sort by similarity descending
            similar.sort(key=lambda x: x.similarity, reverse=True)
            return similar

        except Exception as e:
            logger.warning(f"Error finding similar nodes: {e}")
            return []

    def check_duplicate(
        self,
        label: str,
        embedding: List[float],
        threshold: float = SIMILARITY_THRESHOLD
    ) -> Optional[SimilarNode]:
        """
        Check if a similar node already exists.

        Args:
            label: Node type (Actor, Space, Thing, Narrative)
            embedding: Embedding of the new node
            threshold: Similarity threshold

        Returns:
            Most similar node if above threshold, None otherwise
        """
        similar = self._find_similar_nodes(label, embedding, threshold)
        return similar[0] if similar else None

    # NOTE: apply() method and extraction helpers are in graph_ops_apply.py
    # Inherited from ApplyOperationsMixin

    # =========================================================================
    # NODES
    # =========================================================================

    def add_character(
        self,
        id: str,
        name: str,
        type: str = "minor",
        alive: bool = True,
        gender: str = None,
        face: str = None,
        skills: Dict[str, str] = None,
        voice_tone: str = None,
        voice_style: str = None,
        approach: str = None,
        values: List[str] = None,
        flaw: str = None,
        backstory_family: str = None,
        backstory_wound: str = None,
        backstory_why_here: str = None,
        embedding: List[float] = None,
        image_prompt: str = None,
        playthrough: str = None,
        detail: str = None,
        # Physics fields (schema.yaml defaults)
        energy: float = 0.0,
        weight: float = 0.5,
    ) -> None:
        """
        Add or update a CHARACTER node.

        Args:
            id: Unique identifier (e.g., "char_aldric")
            name: Display name (e.g., "Aldric")
            type: player, companion, major, minor, background
            alive: Is the character alive?
            face: young, scarred, weathered, gaunt, hard, noble
            skills: Dict of skill -> level (untrained, capable, skilled, master)
            voice_tone: quiet, sharp, warm, bitter, measured, fierce
            voice_style: direct, questioning, sardonic, gentle, blunt
            approach: direct, cunning, cautious, impulsive, deliberate
            values: List of values (loyalty, survival, honor, etc.)
            flaw: pride, fear, greed, wrath, doubt, rigidity, softness, envy, sloth
            backstory_*: Backstory fields
            embedding: 768-dim vector for semantic search
            image_prompt: Prompt for generating character portrait (1:1 aspect ratio)
            playthrough: Playthrough folder name for image storage
        """
        # Determine playthrough from parameter or stored value
        pt = playthrough or getattr(self, '_current_playthrough', 'default')

        props = {
            "id": id,
            "name": name,
            "type": type,
            "alive": alive,
            "created_at": datetime.utcnow().isoformat(),
            # Physics fields (always set)
            "energy": energy,
            "weight": weight,
        }

        if gender:
            props["gender"] = gender
        if face:
            props["face"] = face
        if skills:
            props["skills"] = json.dumps(skills)
        if voice_tone:
            props["voice_tone"] = voice_tone
        if voice_style:
            props["voice_style"] = voice_style
        if approach:
            props["approach"] = approach
        if values:
            props["values"] = json.dumps(values)
        if flaw:
            props["flaw"] = flaw
        if backstory_family:
            props["backstory_family"] = backstory_family
        if backstory_wound:
            props["backstory_wound"] = backstory_wound
        if backstory_why_here:
            props["backstory_why_here"] = backstory_why_here
        if embedding:
            props["embedding"] = embedding
        if image_prompt:
            props["image_prompt"] = image_prompt
        if detail:
            props["detail"] = detail

        # Generate image if prompt provided
        if image_prompt:
            image_path = generate_node_image('character', id, image_prompt, pt)
            if image_path:
                props["image_path"] = image_path

        cypher = """
        MERGE (n:Actor {id: $id})
        SET n += $props
        """
        self._query(cypher, {"id": id, "props": props})
        logger.info(f"[GraphOps] Added character: {name} ({id})")

    def add_place(
        self,
        id: str,
        name: str,
        type: str = "village",
        mood: str = None,
        weather: List[str] = None,
        details: List[str] = None,
        embedding: List[float] = None,
        image_prompt: str = None,
        playthrough: str = None,
        detail: str = None,
        # Physics fields (schema.yaml defaults)
        energy: float = 0.0,
        weight: float = 0.5,
    ) -> None:
        """
        Add or update a PLACE node.

        Args:
            id: Unique identifier (e.g., "place_york")
            name: Display name (e.g., "York")
            type: region, city, hold, village, monastery, camp, road, room, wilderness, ruin
            mood: welcoming, hostile, indifferent, fearful, watchful, desperate, peaceful, tense
            weather: List of weather conditions
            details: List of atmospheric details
            embedding: 768-dim vector for semantic search
            image_prompt: Prompt for generating place illustration (1:3 aspect ratio)
            playthrough: Playthrough folder name for image storage
        """
        # Determine playthrough from parameter or stored value
        pt = playthrough or getattr(self, '_current_playthrough', 'default')

        props = {
            "id": id,
            "name": name,
            "type": type,
            "created_at": datetime.utcnow().isoformat(),
            # Physics fields (always set)
            "energy": energy,
            "weight": weight,
        }

        if mood:
            props["mood"] = mood
        if weather:
            props["weather"] = json.dumps(weather)
        if details:
            props["details"] = json.dumps(details)
        if embedding:
            props["embedding"] = embedding
        if image_prompt:
            props["image_prompt"] = image_prompt
        if detail:
            props["detail"] = detail

        # Generate image if prompt provided
        if image_prompt:
            image_path = generate_node_image('place', id, image_prompt, pt)
            if image_path:
                props["image_path"] = image_path

        cypher = """
        MERGE (n:Space {id: $id})
        SET n += $props
        """
        self._query(cypher, {"id": id, "props": props})
        logger.info(f"[GraphOps] Added place: {name} ({id})")

    def add_thing(
        self,
        id: str,
        name: str,
        type: str = "tool",
        portable: bool = True,
        significance: str = "mundane",
        description: str = None,
        quantity: int = 1,
        embedding: List[float] = None,
        image_prompt: str = None,
        playthrough: str = None,
        detail: str = None,
        # Physics fields (schema.yaml defaults)
        energy: float = 0.0,
        weight: float = 0.5,
    ) -> None:
        """
        Add or update a THING node.

        Args:
            id: Unique identifier (e.g., "thing_sword")
            name: Display name (e.g., "Wulfric's Sword")
            type: weapon, armor, document, letter, relic, treasure, title, land, token, provisions, coin_purse, horse, ship, tool
            portable: Can it be carried?
            significance: mundane, personal, political, sacred, legendary
            description: What it is
            quantity: How many
            embedding: 768-dim vector for semantic search
            image_prompt: Prompt for generating thing illustration (1:1 aspect ratio)
            playthrough: Playthrough folder name for image storage
        """
        # Determine playthrough from parameter or stored value
        pt = playthrough or getattr(self, '_current_playthrough', 'default')

        props = {
            "id": id,
            "name": name,
            "type": type,
            "portable": portable,
            "significance": significance,
            "quantity": quantity,
            "created_at": datetime.utcnow().isoformat()
        }

        if description:
            props["description"] = description
        if embedding:
            props["embedding"] = embedding
        if image_prompt:
            props["image_prompt"] = image_prompt
        if detail:
            props["detail"] = detail

        # Generate image if prompt provided
        if image_prompt:
            image_path = generate_node_image('thing', id, image_prompt, pt)
            if image_path:
                props["image_path"] = image_path

        cypher = """
        MERGE (n:Thing {id: $id})
        SET n += $props
        """
        self._query(cypher, {"id": id, "props": props})
        logger.info(f"[GraphOps] Added thing: {name} ({id})")

    def add_narrative(
        self,
        id: str,
        name: str,
        content: str,
        type: str,
        interpretation: str = None,
        about_actors: List[str] = None,
        about_spaces: List[str] = None,
        about_things: List[str] = None,
        about_relationship: List[str] = None,
        tone: str = None,
        voice_style: str = None,
        voice_phrases: List[str] = None,
        weight: float = 0.5,
        focus: float = 1.0,
        truth: float = 1.0,
        narrator_notes: str = None,
        embedding: List[float] = None,
        occurred_at: str = None,
        occurred_where: str = None,
        detail: str = None
    ) -> None:
        """
        Add or update a NARRATIVE node.

        Args:
            id: Unique identifier (e.g., "narr_oath")
            name: Short label (e.g., "Aldric's Oath")
            content: The story itself
            type: memory, account, rumor, reputation, identity, bond, oath, debt, blood, enmity, love, service, ownership, claim, control, origin, belief, prophecy, lie, secret
            interpretation: What it means (emotional/thematic weight)
            about_actors: Actor IDs this is about
            about_spaces: Space IDs this is about
            about_things: Thing IDs this is about
            about_relationship: Pair of actor IDs (for bond/enmity types)
            tone: bitter, proud, shameful, defiant, mournful, cold, righteous, hopeful, fearful, warm, dark, sacred
            voice_style: whisper, demand, remind, accuse, plead, warn, inspire, mock, question
            voice_phrases: Example lines this narrative might say
            weight: 0-1, computed importance (usually set by graph engine)
            focus: 0.1-3.0, pacing multiplier
            truth: 0-1, how true (director only)
            narrator_notes: Continuity notes
            embedding: 768-dim vector for semantic search
        """
        props = {
            "id": id,
            "name": name,
            "content": content,
            "type": type,
            "weight": weight,
            "focus": focus,
            "truth": truth,
            "created_at": datetime.utcnow().isoformat()
        }

        if interpretation:
            props["interpretation"] = interpretation
        if about_actors:
            props["about_actors"] = json.dumps(about_actors)
        if about_spaces:
            props["about_spaces"] = json.dumps(about_spaces)
        if about_things:
            props["about_things"] = json.dumps(about_things)
        if about_relationship:
            props["about_relationship"] = json.dumps(about_relationship)
        if tone:
            props["tone"] = tone
        if voice_style:
            props["voice_style"] = voice_style
        if voice_phrases:
            props["voice_phrases"] = json.dumps(voice_phrases)
        if narrator_notes:
            props["narrator_notes"] = narrator_notes
        if embedding:
            props["embedding"] = embedding
        if occurred_at:
            props["occurred_at"] = occurred_at
        if detail:
            props["detail"] = detail

        cypher = """
        MERGE (n:Narrative {id: $id})
        SET n += $props
        """
        self._query(cypher, {"id": id, "props": props})

        # Create OCCURRED_AT link to Space if specified
        if occurred_where:
            link_cypher = """
            MATCH (n:Narrative {id: $narr_id})
            MATCH (p:Space {id: $place_id})
            MERGE (n)-[:OCCURRED_AT]->(p)
            """
            self._query(link_cypher, {"narr_id": id, "place_id": occurred_where})

        logger.info(f"[GraphOps] Added narrative: {name} ({id})")

    def add_moment(
        self,
        id: str,
        text: str,
        type: str = "narration",
        tick_created: int = 0,
        status: str = "completed",
        weight: float = 0.5,
        tone: str = None,
        tick_resolved: int = None,
        speaker: str = None,
        place_id: str = None,
        after_moment_id: str = None,
        embedding: List[float] = None,
        line: int = None
    ) -> str:
        """
        Add or update a MOMENT node.

        A Moment is a single unit of narrated content - dialogue, narration,
        hint, or player action. Every piece of text shown to the player
        becomes a Moment for traceability and semantic search.

        Moments follow a lifecycle (v1.2):
        - possible: Could surface but hasn't yet (weight determines priority)
        - active: Currently being shown, draws from actors
        - completed: Has been shown, liquidated to connected nodes
        - rejected: Canon holder refused, energy returns to player
        - interrupted: Superseded by another event
        - overridden: Contradicted by new moment

        Args:
            id: Unique identifier (e.g., "crossing_d5_dusk_dialogue_143521")
            text: The actual text content
            type: narration, dialogue, hint, player_click, player_freeform, player_choice
            tick_created: World tick when this was created
            status: possible, active, completed, failed, decayed
            weight: 0-1, determines surfacing priority for possible moments
            tone: curious, defiant, vulnerable, warm, cold, bitter, etc.
            tick_resolved: World tick when moment was resolved (completed/failed)
            speaker: Character ID - creates SAID link (not stored as attribute)
            place_id: Where it occurred (creates AT link)
            after_moment_id: Previous moment (creates THEN link for sequence)
            embedding: 768-dim vector for semantic search
            line: Starting line number in transcript.json

        Returns:
            The moment ID
        """
        props = {
            "id": id,
            "content": text,
            "type": type,
            "tick_created": tick_created,
            "status": status,
            "weight": weight,
            "created_at": datetime.utcnow().isoformat()
        }

        if tone:
            props["tone"] = tone
        if tick_resolved is not None:
            props["tick_resolved"] = tick_resolved
        if embedding:
            props["embedding"] = embedding
        if line is not None:
            props["line"] = line

        cypher = """
        MERGE (n:Moment {id: $id})
        SET n += $props
        """
        self._query(cypher, {"id": id, "props": props})

        # Create SAID link if speaker (dialogue or player action)
        if speaker:
            self.add_said(speaker, id)

        # Create AT link if place specified
        if place_id:
            self.add_moment_at(id, place_id)

        # Create THEN link if after_moment specified (sequence)
        if after_moment_id:
            self.add_moment_then(after_moment_id, id)

        logger.info(f"[GraphOps] Added moment: {id} ({type}, status={status})")
        return id

    # NOTE: Link creation methods (add_said, add_belief, add_presence,
    # add_geography, etc.) are inherited from LinkCreationMixin in
    # graph_ops_links.py

    # NOTE: Moment lifecycle methods (handle_click, update_moment_weight,
    # propagate_embedding_energy, decay_moments, etc.) are inherited from
    # MomentOperationsMixin in graph_ops_moments.py

    # =========================================================================
    # BULK OPERATIONS
    # =========================================================================

    def apply_mutations(self, mutations: Dict[str, Any]) -> None:
        """
        Apply a batch of mutations from Narrator or World Runner output.

        Args:
            mutations: Dict with keys:
                - new_narratives: List of narrative dicts
                - new_beliefs: List of belief dicts
                - character_movements: List of movement dicts
        """
        # 1. New narratives first
        for narr in mutations.get("new_narratives", []):
            self.add_narrative(
                id=narr["id"],
                name=narr["name"],
                content=narr["content"],
                type=narr["type"],
                interpretation=narr.get("interpretation"),
                about_characters=narr.get("about", {}).get("characters"),
                about_places=narr.get("about", {}).get("places"),
                about_things=narr.get("about", {}).get("things"),
                about_relationship=narr.get("about", {}).get("relationship"),
                tone=narr.get("tone"),
                truth=narr.get("truth", 1.0),
                focus=narr.get("focus", 1.0)
            )

        # 2. New beliefs
        for belief in mutations.get("new_beliefs", []):
            self.add_belief(
                character_id=belief["character"],
                narrative_id=belief["narrative"],
                heard=belief.get("heard", 0.0),
                believes=belief.get("believes", 0.0),
                doubts=belief.get("doubts", 0.0),
                denies=belief.get("denies", 0.0),
                source=belief.get("source", "none"),
                from_whom=belief.get("from_whom")
            )

        # 3. Character movements
        for move in mutations.get("character_movements", []):
            self.move_character(
                character_id=move["character"],
                to_place_id=move["to"],
                visible=1.0 if move.get("visible", True) else 0.0
            )

        logger.info(f"[GraphOps] Applied {len(mutations)} mutation types")


# =============================================================================
# CONVENIENCE FUNCTIONS
# =============================================================================

def get_graph(
    graph_name: str = "blood_ledger",
    host: str = "localhost",
    port: int = 6379
) -> GraphOps:
    """Get a GraphOps instance."""
    return GraphOps(graph_name=graph_name, host=host, port=port)

