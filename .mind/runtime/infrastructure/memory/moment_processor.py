"""
Moment Processor

Converts narrator output (dialogue, narration) into Moment nodes.
Manages transcript.json - the full record of all narrated content.
"""

# DOCS: docs/infrastructure/scene-memory/

import json
import logging
from pathlib import Path
from typing import Dict, Any, List, Optional, Callable
from datetime import datetime

logger = logging.getLogger(__name__)


class MomentProcessor:
    """
    Processes narrator output into Moment nodes.

    Handles:
    - Creating Moment nodes in the graph
    - Appending to transcript.json
    - Tracking line numbers for Moment -> transcript linking
    - Generating unique moment IDs
    """

    def __init__(
        self,
        graph_ops,                      # GraphOps instance
        embed_fn: Callable[[str], List[float]],  # Function: str -> embedding
        playthrough_id: str,
        playthroughs_dir: Path = None
    ):
        """
        Initialize the moment processor.

        Args:
            graph_ops: GraphOps instance for persisting to graph
            embed_fn: Function to generate embeddings
            playthrough_id: Which playthrough this is for
            playthroughs_dir: Base directory for playthroughs (defaults to engine/playthroughs)
        """
        self.ops = graph_ops
        self.embed = embed_fn
        self.playthrough_id = playthrough_id

        # Setup paths
        if playthroughs_dir is None:
            playthroughs_dir = Path(__file__).parent.parent / "playthroughs"
        self.playthrough_dir = playthroughs_dir / playthrough_id
        self.playthrough_dir.mkdir(parents=True, exist_ok=True)

        self.transcript_path = self.playthrough_dir / "transcript.json"

        # Current context
        self._current_tick: int = 0
        self._current_place_id: Optional[str] = None
        self._last_moment_id: Optional[str] = None

        # Transcript state
        self._transcript_line_count = self._load_transcript_line_count()

    def _load_transcript_line_count(self) -> int:
        """Load current line count from transcript."""
        if not self.transcript_path.exists():
            # Initialize empty transcript
            self._write_transcript([])
            return 0

        try:
            with open(self.transcript_path, 'r') as f:
                transcript = json.load(f)
                return len(transcript)
        except Exception as e:
            logger.warning(f"[MomentProcessor] Could not load transcript: {e}")
            return 0

    def _write_transcript(self, transcript: List[Dict]) -> None:
        """Write transcript to file."""
        with open(self.transcript_path, 'w') as f:
            json.dump(transcript, f, indent=2)

    def _append_to_transcript(self, entry: Dict) -> int:
        """
        Append entry to transcript.json.

        Returns the line number (0-indexed) of the new entry.
        """
        try:
            if self.transcript_path.exists():
                with open(self.transcript_path, 'r') as f:
                    transcript = json.load(f)
            else:
                transcript = []

            line_number = len(transcript)
            transcript.append(entry)

            self._write_transcript(transcript)
            self._transcript_line_count = len(transcript)

            return line_number
        except Exception as e:
            logger.error(f"[MomentProcessor] Failed to append to transcript: {e}")
            return -1

    def set_context(
        self,
        tick: int,
        place_id: str
    ) -> None:
        """
        Set current context for moment creation.
        Call this at the start of each scene/interaction.

        Args:
            tick: Current world tick
            place_id: Current location (place ID)
        """
        self._current_tick = tick
        self._current_place_id = place_id
        self._last_moment_id = None  # Reset sequence
        logger.debug(f"[MomentProcessor] Context set: tick={tick}, place={place_id}")

    def process_dialogue(
        self,
        text: str,
        speaker: str,
        name: Optional[str] = None,
        tone: Optional[str] = None,
        initial_weight: float = 1.0,
        initial_status: str = "completed"
    ) -> str:
        """
        Process dialogue into a Moment node.

        Args:
            text: The dialogue text
            speaker: Character ID who spoke
            name: Optional short name for the moment ID
            tone: Emotional tone (curious, defiant, vulnerable, warm, cold, etc.)
            initial_weight: Starting weight for the moment (0-1, default 1.0 for spoken)
            initial_status: Status (possible, active, completed). Default "completed" for immediate display.

        Returns:
            The created moment ID
        """
        moment_id = self._generate_id("dialogue", name)

        # Append to transcript
        entry = {
            "type": "dialogue",
            "speaker": speaker,
            "content": text,
            "tick": self._current_tick,
            "place": self._current_place_id,
            "moment_id": moment_id,
            "tone": tone,
            "status": initial_status,
            "timestamp": datetime.utcnow().isoformat()
        }
        line = self._append_to_transcript(entry)

        # Generate embedding if text is long enough
        embedding = None
        if len(text) > 20:
            embedding = self.embed(f"{speaker}: {text}")

        # Create moment in graph
        self.ops.add_moment(
            id=moment_id,
            content=text,
            type="dialogue",
            tick_created=self._current_tick,
            speaker=speaker,
            place_id=self._current_place_id,
            after_moment_id=self._last_moment_id,
            embedding=embedding,
            line=line,
            status=initial_status,
            weight=initial_weight,
            tone=tone,
            tick_resolved=self._current_tick if initial_status == "completed" else None
        )

        self._last_moment_id = moment_id
        logger.info(f"[MomentProcessor] Processed dialogue: {moment_id} (line {line}, status={initial_status})")
        return moment_id

    def process_narration(
        self,
        text: str,
        name: Optional[str] = None,
        tone: Optional[str] = None,
        initial_weight: float = 1.0,
        initial_status: str = "completed"
    ) -> str:
        """
        Process narration into a Moment node.

        Args:
            text: The narration text
            name: Optional short name for the moment ID
            tone: Atmospheric tone (tense, peaceful, ominous, etc.)
            initial_weight: Starting weight for the moment (0-1, default 1.0 for spoken)
            initial_status: Status (possible, active, completed). Default "completed" for immediate display.

        Returns:
            The created moment ID
        """
        moment_id = self._generate_id("narration", name)

        # Append to transcript
        entry = {
            "type": "narration",
            "content": text,
            "tick": self._current_tick,
            "place": self._current_place_id,
            "moment_id": moment_id,
            "tone": tone,
            "status": initial_status,
            "timestamp": datetime.utcnow().isoformat()
        }
        line = self._append_to_transcript(entry)

        # Generate embedding if text is long enough
        embedding = None
        if len(text) > 20:
            embedding = self.embed(text)

        # Create moment in graph
        self.ops.add_moment(
            id=moment_id,
            content=text,
            type="narration",
            tick_created=self._current_tick,
            place_id=self._current_place_id,
            after_moment_id=self._last_moment_id,
            embedding=embedding,
            line=line,
            status=initial_status,
            weight=initial_weight,
            tone=tone,
            tick_resolved=self._current_tick if initial_status == "completed" else None
        )

        self._last_moment_id = moment_id
        logger.info(f"[MomentProcessor] Processed narration: {moment_id} (line {line}, status={initial_status})")
        return moment_id

    def process_player_action(
        self,
        text: str,
        player_id: str = "char_player",
        action_type: str = "player_freeform",
        name: Optional[str] = None,
        tone: Optional[str] = None,
        initial_weight: float = 1.0,
        initial_status: str = "completed"
    ) -> str:
        """
        Process player action into a Moment node.

        Args:
            text: The action text (what player typed/clicked)
            player_id: Player character ID
            action_type: player_click, player_freeform, or player_choice
            name: Optional short name for the moment ID
            tone: Tone of the action (questioning, demanding, etc.)
            initial_weight: Starting weight for the moment (0-1, default 1.0 for spoken)
            initial_status: Status (possible, active, completed). Default "completed" for immediate display.

        Returns:
            The created moment ID
        """
        moment_id = self._generate_id(action_type, name)

        # Append to transcript
        entry = {
            "type": action_type,
            "speaker": player_id,
            "content": text,
            "tick": self._current_tick,
            "place": self._current_place_id,
            "moment_id": moment_id,
            "tone": tone,
            "status": initial_status,
            "timestamp": datetime.utcnow().isoformat()
        }
        line = self._append_to_transcript(entry)

        # Generate embedding if text is long enough
        embedding = None
        if len(text) > 20:
            embedding = self.embed(text)

        # Create moment in graph
        self.ops.add_moment(
            id=moment_id,
            content=text,
            type=action_type,
            tick_created=self._current_tick,
            speaker=player_id,
            place_id=self._current_place_id,
            after_moment_id=self._last_moment_id,
            embedding=embedding,
            line=line,
            status=initial_status,
            weight=initial_weight,
            tone=tone,
            tick_resolved=self._current_tick if initial_status == "completed" else None
        )

        self._last_moment_id = moment_id
        logger.info(f"[MomentProcessor] Processed player action: {moment_id} (line {line}, status={initial_status})")
        return moment_id

    def process_hint(
        self,
        text: str,
        name: Optional[str] = None,
        tone: Optional[str] = None,
        initial_weight: float = 0.8,
        initial_status: str = "active"
    ) -> str:
        """
        Process a hint/voice into a Moment node.

        Args:
            text: The hint text
            name: Optional short name for the moment ID
            tone: Tone of the hint (urgent, subtle, etc.)
            initial_weight: Starting weight for the moment (0-1, default 0.8 - high but not max)
            initial_status: Status (possible, active, completed). Default "active" for hints.

        Returns:
            The created moment ID
        """
        moment_id = self._generate_id("hint", name)

        # Append to transcript
        entry = {
            "type": "hint",
            "content": text,
            "tick": self._current_tick,
            "place": self._current_place_id,
            "moment_id": moment_id,
            "tone": tone,
            "status": initial_status,
            "timestamp": datetime.utcnow().isoformat()
        }
        line = self._append_to_transcript(entry)

        # Generate embedding if text is long enough
        embedding = None
        if len(text) > 20:
            embedding = self.embed(text)

        # Create moment in graph
        self.ops.add_moment(
            id=moment_id,
            content=text,
            type="hint",
            tick_created=self._current_tick,
            place_id=self._current_place_id,
            after_moment_id=self._last_moment_id,
            embedding=embedding,
            line=line,
            status=initial_status,
            weight=initial_weight,
            tone=tone,
            tick_resolved=self._current_tick if initial_status in ["completed", "active"] else None
        )

        self._last_moment_id = moment_id
        logger.info(f"[MomentProcessor] Processed hint: {moment_id} (line {line}, status={initial_status})")
        return moment_id

    def create_possible_moment(
        self,
        text: str,
        speaker_id: str,
        name: Optional[str] = None,
        tone: Optional[str] = None,
        initial_weight: float = 0.5,
        attach_to_character: bool = True,
        attach_to_place: bool = True
    ) -> str:
        """
        Create a "possible" moment that can surface when conditions are met.

        Used for seeding potential dialogue - moments that exist but haven't
        been spoken yet. When weight reaches threshold (0.8), they flip to active.

        Args:
            text: The moment text
            speaker_id: Character who CAN_SPEAK this moment
            name: Optional short name for the moment ID
            tone: Emotional tone (curious, defiant, etc.)
            initial_weight: Starting weight (0-1, default 0.5 - below flip threshold)
            attach_to_character: If True, attach to speaker with presence_required=True
            attach_to_place: If True, attach to current place

        Returns:
            The created moment ID
        """
        moment_id = self._generate_id("possible", name)

        # Create moment in graph (NOT added to transcript - not spoken yet)
        self.ops.add_moment(
            id=moment_id,
            content=text,
            type="dialogue",
            tick_created=self._current_tick,
            place_id=self._current_place_id,
            status="possible",
            weight=initial_weight,
            tone=tone
        )

        # Add CAN_SPEAK link
        self.ops.add_can_speak(
            character_id=speaker_id,
            moment_id=moment_id,
            weight=1.0
        )

        # Attach to character (presence required)
        if attach_to_character:
            self.ops.add_attached_to(
                moment_id=moment_id,
                target_id=speaker_id,
                presence_required=True,
                persistent=True
            )

        # Attach to place
        if attach_to_place and self._current_place_id:
            self.ops.add_attached_to(
                moment_id=moment_id,
                target_id=self._current_place_id,
                presence_required=True,
                persistent=True
            )

        logger.info(f"[MomentProcessor] Created possible moment: {moment_id} (speaker={speaker_id}, weight={initial_weight})")
        return moment_id

    def link_moments(
        self,
        from_moment_id: str,
        to_moment_id: str,
        trigger: str = "player",
        require_words: List[str] = None,
        weight_transfer: float = 0.4,
        consumes_origin: bool = False
    ) -> None:
        """
        Create a CAN_LEAD_TO link between moments.

        Used for creating conversation flow - when from_moment is active,
        clicking require_words can trigger to_moment.

        Args:
            from_moment_id: Source moment
            to_moment_id: Target moment
            trigger: "player" (click/type), "wait", or "auto"
            require_words: Words that trigger this transition (for trigger="player")
            weight_transfer: How much weight flows to target
            consumes_origin: If True, origin status → completed after traversal
        """
        self.ops.add_can_lead_to(
            from_moment_id=from_moment_id,
            to_moment_id=to_moment_id,
            trigger=trigger,
            require_words=require_words,
            weight_transfer=weight_transfer,
            consumes_origin=consumes_origin
        )
        logger.info(f"[MomentProcessor] Linked moments: {from_moment_id} -> {to_moment_id} (trigger={trigger})")

    def link_narrative_to_moments(
        self,
        narrative_id: str,
        moment_ids: List[str]
    ) -> None:
        """
        Create FROM links from Narrative to Moments (source attribution).

        Args:
            narrative_id: The narrative being created
            moment_ids: List of moment IDs that are sources for this narrative
        """
        for moment_id in moment_ids:
            self.ops.add_narrative_from_moment(narrative_id, moment_id)
        logger.info(f"[MomentProcessor] Linked narrative {narrative_id} to {len(moment_ids)} moments")

    def _generate_id(self, type_prefix: str, name: Optional[str] = None) -> str:
        """
        Generate a moment ID following the naming convention:
        {place}_{day}_{time}_{type}_{name_or_timestamp}

        Args:
            type_prefix: Type of moment (dialogue, narration, etc.)
            name: Optional short name (if None, uses timestamp)
        """
        # Parse day and time from tick
        # Assuming 1 tick = 1 minute, 1440 ticks/day
        day = (self._current_tick // 1440) + 1
        time_of_day = self._tick_to_time_of_day(self._current_tick % 1440)

        # Clean place ID (remove place_ prefix)
        place = self._current_place_id or "unknown"
        if place.startswith("place_"):
            place = place[6:]

        # Use name or generate timestamp suffix
        if name:
            suffix = name
        else:
            suffix = datetime.utcnow().strftime("%H%M%S%f")[:10]

        return f"{place}_d{day}_{time_of_day}_{type_prefix}_{suffix}"

    def _tick_to_time_of_day(self, tick_in_day: int) -> str:
        """Convert tick within day to time period."""
        # Assuming 1440 ticks/day (1 per minute)
        hour = tick_in_day // 60

        if hour < 6:
            return "night"
        elif hour < 9:
            return "dawn"
        elif hour < 12:
            return "morning"
        elif hour < 14:
            return "midday"
        elif hour < 17:
            return "afternoon"
        elif hour < 20:
            return "dusk"
        elif hour < 22:
            return "evening"
        else:
            return "night"

    @property
    def last_moment_id(self) -> Optional[str]:
        """Get the ID of the last created moment."""
        return self._last_moment_id

    @property
    def transcript_line_count(self) -> int:
        """Get the current line count in the transcript."""
        return self._transcript_line_count


def get_moment_processor(
    playthrough_id: str,
    graph_name: str = "blood_ledger"
) -> MomentProcessor:
    """
    Convenience function to create a MomentProcessor with default settings.

    Args:
        playthrough_id: Which playthrough to process moments for
        graph_name: Name of the graph database

    Returns:
        Configured MomentProcessor instance
    """
    from runtime.physics.graph.graph_ops import GraphOps
    from runtime.infrastructure.embeddings.service import get_embedding_service

    ops = GraphOps(graph_name=graph_name)
    embed_svc = get_embedding_service()

    return MomentProcessor(
        graph_ops=ops,
        embed_fn=embed_svc.embed,
        playthrough_id=playthrough_id
    )
