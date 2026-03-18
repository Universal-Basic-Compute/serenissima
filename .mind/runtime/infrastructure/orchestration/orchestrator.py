"""
Orchestrator

The main loop that coordinates:
1. Narrator (scene generation)
2. Graph ticks (physics simulation)
3. World Runner (flip resolution)
4. State management

This is the entry point for the game engine.
"""

import json
import logging
from typing import Dict, Any, Optional, List
from pathlib import Path
from datetime import datetime

from runtime.physics.graph import GraphOps, GraphQueries
from runtime.physics import GraphTick
from runtime.health import get_health_service
from .narrator import NarratorService
from .world_runner import WorldRunnerService

logger = logging.getLogger(__name__)


class Orchestrator:
    """
    Main orchestrator for the Graph Engine game engine.
    """

    def __init__(
        self,
        playthrough_id: str,
        graph_name: str = "blood_ledger",
        host: str = "localhost",
        port: int = 6379,
        playthroughs_dir: str = "playthroughs"
    ):
        # Playthrough
        self.playthrough_id = playthrough_id
        self.playthrough_dir = Path(playthroughs_dir) / playthrough_id
        self.playthrough_dir.mkdir(parents=True, exist_ok=True)

        # Database
        self.read = GraphQueries(graph_name=graph_name, host=host, port=port)
        self.write = GraphOps(graph_name=graph_name, host=host, port=port)

        # Services
        self.narrator = NarratorService()
        self.world_runner = WorldRunnerService(graph_ops=self.write, graph_queries=self.read)
        self.tick_engine = GraphTick(graph_name=graph_name, host=host, port=port)

        # State
        self.last_tick_time: Optional[datetime] = None

        # Health service
        self._health = get_health_service()
        self._health.set_context(playthrough_id=playthrough_id, place_id="")

        logger.info(f"[Orchestrator] Initialized playthrough '{playthrough_id}'")

    def process_action(
        self,
        player_action: str,
        player_id: str = "char_player",
        player_location: str = None
    ) -> Dict[str, Any]:
        """
        Process a player action through the full loop.

        Args:
            player_action: What the player did (clicked word, free input, etc.)
            player_id: Player character ID
            player_location: Current location (or lookup from graph)

        Returns:
            Full narrator output: {dialogue, mutations, scene, time_elapsed}

        The Loop:
        1. Build scene context
        2. Call Narrator with context + any world_injection
        3. Parse response, apply mutations
        4. Run graph tick based on time_elapsed (only for significant actions)
        5. If flips detected, call World Runner
        6. Store world_injection for next call
        7. Return full output
        """
        logger.info(f"[Orchestrator] Processing action: {player_action}")
        logger.info(f"[Orchestrator] player_id={player_id}, player_location={player_location}")

        # Get player location if not provided
        if not player_location:
            player_location = self._get_player_location(player_id)
            logger.info(f"[Orchestrator] Resolved location to: {player_location}")

        # 1. Build scene context
        scene_context = self._build_scene_context(player_id, player_location)
        logger.info(f"[Orchestrator] Scene context has {len(scene_context.get('present', []))} characters present")

        # 2. Load world_injection if exists
        world_injection = self._load_world_injection()

        # 3. Call Narrator
        narrator_output = self.narrator.generate(
            scene_context=scene_context,
            world_injection=world_injection,
            instruction=f"Player action: {player_action}"
        )

        # Clear consumed world_injection
        if world_injection:
            self._clear_world_injection()

        # 4. Apply mutations
        mutations = narrator_output.get('mutations', [])
        if mutations:
            self._apply_mutations(mutations)

        # 5. Run graph tick (only for significant actions with time_elapsed)
        time_elapsed = narrator_output.get('time_elapsed')
        if time_elapsed:
            elapsed_minutes = self._parse_time(time_elapsed)

            # Only tick if significant time passed (5+ minutes)
            if elapsed_minutes >= 5:
                tick_result = self.tick_engine.run(
                    elapsed_minutes=elapsed_minutes,
                    player_id=player_id,
                    player_location=player_location
                )

                # Record tick to health service
                world_tick = self._get_world_tick() or 0
                self._health.record_tick(
                    tick=world_tick,
                    energy_total=tick_result.energy_total,
                    completions=tick_result.moments_decayed
                )
                self._health.record_pressure(
                    pressure=tick_result.avg_pressure,
                    top_edges=[]
                )
                self._health.set_context(
                    playthrough_id=self.playthrough_id,
                    place_id=player_location or ""
                )

                # 6. If flips, call World Runner
                if tick_result.flips:
                    # Record interrupts for health
                    for flip in tick_result.flips:
                        self._health.record_interrupt(
                            reason="event_flip",
                            moment_id=flip.get('event_id', '')
                        )

                    self._process_flips(
                        flips=tick_result.flips,
                        player_id=player_id,
                        player_location=player_location,
                        time_elapsed=time_elapsed
                    )

        # 7. Return full output
        return narrator_output

    def process_action_streaming(
        self,
        player_action: str,
        player_id: str = "char_player",
        player_location: str = None
    ) -> Dict[str, Any]:
        """
        Process a player action for streaming response.

        Same as process_action but returns the full narrator output
        with dialogue chunks for streaming.

        Returns:
            {
                dialogue: [{speaker?, text}, ...],
                mutations: [...],
                scene: {} or full SceneTree,
                time_elapsed?: string
            }
        """
        return self.process_action(
            player_action=player_action,
            player_id=player_id,
            player_location=player_location
        )

    def _build_scene_context(
        self,
        player_id: str,
        player_location: str
    ) -> Dict[str, Any]:
        """Build scene context for the Narrator."""
        # Use GraphQueries' build_scene_context
        try:
            context = self.read.build_scene_context(player_location, player_id)
            logger.info(f"[Orchestrator] Built context for {player_location}: {len(context.get('present', []))} present, {len(context.get('active_narratives', []))} narratives")
        except Exception as e:
            logger.error(f"[Orchestrator] Failed to build context: {e}")
            context = {
                'location': {'id': player_location, 'name': 'Unknown'},
                'present': [],
                'active_narratives': []
            }

        # Add time info
        context['time'] = {
            'time_of_day': self._get_time_of_day(),
            'day': self._get_game_day()
        }

        # Add player state
        context['player_state'] = {
            'pursuing': self._get_player_goal(player_id),
            'recent': self._get_recent_action()
        }

        return context

    def _get_player_location(self, player_id: str) -> str:
        """Get player's current location."""
        try:
            location = self.read.get_player_location(player_id=player_id)
            if location and location.get("id"):
                return location["id"]
        except Exception as exc:
            logger.warning(f"[Orchestrator] Failed to resolve player location: {exc}")
        return "place_unknown"

    def _get_time_of_day(self) -> str:
        """Get current time of day (would be tracked in game state)."""
        tick = self._get_world_tick()
        if tick is None:
            hour = datetime.utcnow().hour
        else:
            hour = (tick % 1440) // 60

        if hour < 6:
            return "night"
        if hour < 9:
            return "dawn"
        if hour < 12:
            return "morning"
        if hour < 14:
            return "midday"
        if hour < 17:
            return "afternoon"
        if hour < 20:
            return "dusk"
        if hour < 22:
            return "evening"
        return "night"

    def _get_game_day(self) -> int:
        """Get current game day (would be tracked in game state)."""
        tick = self._get_world_tick()
        if tick is None:
            return 1
        if tick < 0:
            return 1
        return (tick // 1440) + 1

    def _get_player_goal(self, player_id: str) -> str:
        """Get player's current goal from active narratives."""
        beliefs = self.read.get_character_beliefs(player_id)
        for belief in beliefs:
            if belief.get('type') == 'oath' and belief.get('believes', 0) > 0.5:
                return belief.get('content', '')[:50]
        return "Survive"

    def _get_recent_action(self) -> str:
        """Get description of recent action (would be tracked in state)."""
        path = self.playthrough_dir / "current_action.json"
        if path.exists():
            try:
                data = json.loads(path.read_text())
                action = data.get("action")
                if action:
                    return str(action)
            except Exception as exc:
                logger.warning(f"[Orchestrator] Failed to load recent action: {exc}")
        return "Continuing the journey"

    def _apply_mutations(self, mutations: List[Dict[str, Any]]):
        """Apply mutations from Narrator output."""
        # Convert Narrator mutation format to apply format
        data = {
            'nodes': [],
            'links': [],
            'updates': [],
            'movements': []
        }

        for mutation in mutations:
            mut_type = mutation.get('type')
            payload = mutation.get('payload', mutation)

            if mut_type == 'new_narrative':
                data['nodes'].append({
                    'type': 'narrative',
                    **payload
                })

            elif mut_type == 'new_character':
                # New character invented during conversation
                data['nodes'].append({
                    'type': 'character',
                    'id': payload.get('id'),
                    'name': payload.get('name'),
                    'traits': payload.get('traits', []),
                    'character_type': 'minor',  # Invented characters are minor by default
                })
                # If location specified, add AT relationship
                if payload.get('location'):
                    data['links'].append({
                        'type': 'at',
                        'character': payload.get('id'),
                        'place': payload.get('location'),
                        'present': 1.0
                    })

            elif mut_type == 'new_edge':
                # New relationship edge
                data['links'].append({
                    'type': payload.get('type', 'KNOWS').lower(),
                    'from': payload.get('from'),
                    'to': payload.get('to'),
                    **payload.get('properties', {})
                })

            elif mut_type == 'update_belief':
                data['links'].append({
                    'type': 'belief',
                    'character': payload.get('character'),
                    'narrative': payload.get('narrative'),
                    'heard': payload.get('heard'),
                    'believes': payload.get('believes'),
                    'doubts': payload.get('doubts')
                })

            elif mut_type == 'adjust_focus':
                data['updates'].append({
                    'node': payload.get('narrative'),
                    'focus': payload.get('focus')
                })

        if any(data.values()):
            self.write.apply(data=data)

    def _parse_time(self, time_str: str) -> float:
        """Parse time string to minutes."""
        if not time_str:
            return 5.0

        time_lower = time_str.lower()

        # Handle "X-Y minutes" format
        import re
        range_match = re.search(r'(\d+)-(\d+)\s*min', time_lower)
        if range_match:
            return (float(range_match.group(1)) + float(range_match.group(2))) / 2

        # Handle "X minutes"
        min_match = re.search(r'(\d+)\s*min', time_lower)
        if min_match:
            return float(min_match.group(1))

        # Handle "X hours"
        hour_match = re.search(r'(\d+)\s*hour', time_lower)
        if hour_match:
            return float(hour_match.group(1)) * 60

        # Handle "X days"
        day_match = re.search(r'(\d+)\s*day', time_lower)
        if day_match:
            return float(day_match.group(1)) * 24 * 60

        return 5.0

    def _process_flips(
        self,
        flips: List[Dict[str, Any]],
        player_id: str,
        player_location: str,
        time_elapsed: str
    ):
        """Process events through World Runner."""
        # Build graph context
        graph_context = self._build_graph_context(flips)

        # Build player context
        player_context = {
            'location': player_location,
            'engaged_with': None,
            'recent_action': self._get_recent_action()
        }

        # Call World Runner
        wr_output = self.world_runner.process_flips(
            flips=flips,
            graph_context=graph_context,
            player_context=player_context,
            time_span=time_elapsed
        )

        # Apply graph mutations
        graph_mutations = wr_output.get('graph_mutations', {})
        if graph_mutations:
            self._apply_wr_mutations(graph_mutations)

        # Store world_injection for next Narrator call
        world_injection = wr_output.get('world_injection')
        if world_injection:
            self._save_world_injection(json.dumps(world_injection))

        logger.info(f"[Orchestrator] Processed {len(flips)} flips")

    def _build_graph_context(self, flips: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Build graph context for World Runner."""
        # Get relevant narratives from flips
        narrative_ids = set()
        for flip in flips:
            narr_ids = flip.get('narratives', [])
            if isinstance(narr_ids, str):
                narr_ids = json.loads(narr_ids)
            narrative_ids.update(narr_ids)

        relevant_narratives = []
        for narr_id in narrative_ids:
            narr = self.read.get_narrative(narr_id)
            if narr:
                # Get believers
                believers = self.read.get_narrative_believers(narr_id)
                narr['believers'] = [b.get('id') for b in believers]
                relevant_narratives.append(narr)

        # Get character locations
        characters = self.read.get_all_characters()
        char_locations = {}
        for char in characters:
            char_id = char.get('id')
            loc = self._get_character_location_by_id(char_id)
            if loc:
                char_locations[char_id] = loc

        return {
            'relevant_narratives': relevant_narratives,
            'character_locations': char_locations
        }

    def _get_character_location_by_id(self, char_id: str) -> Optional[str]:
        """Get a character's location."""
        cypher = f"""
        MATCH (c:Actor {{id: '{char_id}'}})-[r:AT]->(p:Space)
        WHERE r.present > 0.5
        RETURN p.id
        """
        try:
            results = self.read.query(cypher)
            return results[0].get('p.id') if results else None
        except:
            return None

    def _apply_wr_mutations(self, mutations: Dict[str, Any]):
        """Apply World Runner mutations."""
        data = {
            'nodes': [],
            'links': [],
            'updates': [],
            'movements': []
        }

        # New narratives
        for narr in mutations.get('new_narratives', []):
            data['nodes'].append({
                'type': 'narrative',
                **narr
            })

        # New beliefs
        for belief in mutations.get('new_beliefs', []):
            data['links'].append({
                'type': 'belief',
                **belief
            })

        # Character movements
        for move in mutations.get('character_movements', []):
            data['movements'].append(move)

        if any(data.values()):
            self.write.apply(data=data)

    def new_game(self, initial_state_path: str = None):
        """Start a new game."""
        # Reset narrator session
        self.narrator.reset_session()

        # Clear world injection
        self._clear_world_injection()

        # Load initial state if provided
        if initial_state_path:
            self.write.apply(path=initial_state_path)

        logger.info("[Orchestrator] New game started")

    # -------------------------------------------------------------------------
    # World Injection File Management
    # -------------------------------------------------------------------------

    def _world_injection_path(self) -> Path:
        """Get path to world_injection.json for this playthrough."""
        if not self.playthrough_dir.exists():
            self.playthrough_dir.mkdir(parents=True, exist_ok=True)
        return self.playthrough_dir / "world_injection.json"

    def _get_world_tick(self) -> Optional[int]:
        """Get current world tick from graph state."""
        try:
            result = self.read._query("""
                MATCH (w:World)
                RETURN w.tick
                LIMIT 1
            """)
            if result and result[0]:
                tick_value = result[0][0]
                if tick_value is not None:
                    return int(tick_value)
        except Exception as exc:
            logger.debug(f"[Orchestrator] Failed to load world tick: {exc}")
        return None

    def _load_world_injection(self) -> Optional[Dict[str, Any]]:
        """Load world_injection dictionary from file if it exists."""
        path = self._world_injection_path()
        if path.exists():
            try:
                with open(path, 'r') as f:
                    return json.load(f)
            except Exception as e:
                logger.error(f"[Orchestrator] Failed to load world_injection: {e}")
        return None

    def _save_world_injection(self, injection: Dict[str, Any]):
        """Save world_injection dictionary to file."""
        path = self._world_injection_path()
        try:
            with open(path, 'w') as f:
                json.dump(injection, f, indent=2)
            logger.info(f"[Orchestrator] Saved world_injection to {path}")
        except Exception as e:
            logger.error(f"[Orchestrator] Failed to save world_injection: {e}")

    def _clear_world_injection(self):
        """Delete world_injection file after it's consumed."""
        path = self._world_injection_path()
        if path.exists():
            try:
                path.unlink()
                logger.info(f"[Orchestrator] Cleared world_injection")
            except Exception as e:
                logger.error(f"[Orchestrator] Failed to clear world_injection: {e}")
