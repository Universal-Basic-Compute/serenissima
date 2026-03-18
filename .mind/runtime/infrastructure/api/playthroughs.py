"""
Playthrough Management API Endpoints

Endpoints for creating and managing playthroughs, sending player moments,
and discussion tree navigation.

Extracted from app.py to reduce file size.

Docs:
- DOCS: docs/infrastructure/api/
- docs/physics/IMPLEMENTATION_Physics.md — code architecture
- docs/infrastructure/async/IMPLEMENTATION_Async_Architecture.md — async queues + injection flow
"""

# DOCS: docs/infrastructure/api/PATTERNS_Api.md

import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from runtime.physics.graph import GraphQueries, get_playthrough_graph_name

logger = logging.getLogger(__name__)


# =============================================================================
# REQUEST/RESPONSE MODELS
# =============================================================================

class PlaythroughCreateRequest(BaseModel):
    """Request to create a new playthrough."""
    scenario_id: str
    player_name: str
    player_gender: str = "male"


class MomentRequest(BaseModel):
    """Request to send a player moment."""
    playthrough_id: str
    text: str
    moment_type: str = "player_freeform"  # player_freeform, player_click, player_choice


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def _opening_to_scene_tree(opening_template: dict, scenario: dict) -> dict:
    """
    Convert opening.json template to SceneTree format with nested freeform_acknowledgment.
    """
    setting = opening_template.get("setting", {})
    beats = opening_template.get("beats", [])
    companion_id = scenario.get("companion", {}).get("id", "char_aldric")

    # Build nested narration from beats
    def build_beat_narration(beat_index: int) -> list:
        """Recursively build narration for a beat with freeform_acknowledgment linking to next."""
        if beat_index >= len(beats):
            return []

        beat = beats[beat_index]
        narration_lines = beat.get("narration", [])
        questions = beat.get("questions", [])

        result = []

        # Add narration lines
        for line in narration_lines:
            # Check if it's dialogue (starts with quote)
            if line.startswith('"'):
                result.append({
                    "text": line,
                    "speaker": companion_id
                })
            else:
                result.append({"text": line})

        # Add questions with freeform_acknowledgment
        for i, question in enumerate(questions):
            is_last_question_of_beat = (i == len(questions) - 1)
            is_last_beat = (beat_index == len(beats) - 1)

            q_narration = {
                "text": question.get("text", ""),
                "speaker": question.get("speaker", companion_id)
            }

            # Add transition if present
            if question.get("transition"):
                result.append({"text": question["transition"]})

            # Build freeform_acknowledgment
            if question.get("type") == "statement":
                # Statements don't need acknowledgment text, just continue
                ack = {"text": ""}
            else:
                # Regular questions get acknowledgment
                ack = {"text": "He nods slowly."}

            # Link to next content
            if is_last_question_of_beat and not is_last_beat:
                # Link to next beat
                ack["then"] = build_beat_narration(beat_index + 1)
            elif not is_last_question_of_beat:
                # Link to next question in same beat (continue with remaining questions)
                remaining_questions = questions[i+1:]
                if remaining_questions:
                    next_q = remaining_questions[0]
                    ack["then"] = [{
                        "text": next_q.get("text", ""),
                        "speaker": next_q.get("speaker", companion_id),
                        "freeform_acknowledgment": {
                            "text": "He nods slowly.",
                            "then": build_beat_narration(beat_index + 1) if is_last_question_of_beat else []
                        }
                    }]

            q_narration["freeform_acknowledgment"] = ack
            result.append(q_narration)
            break  # Only add first question, rest are in nested then

        return result

    # Build the scene tree
    scene = {
        "id": "opening_fireside",
        "location": {
            "place": setting.get("location", "camp_roadside"),
            "name": "Roadside Camp",
            "region": "The North Road",
            "time": setting.get("time", "night")
        },
        "characters": setting.get("characters", ["char_aldric"]),
        "atmosphere": setting.get("atmosphere", []),
        "narration": build_beat_narration(0),
        "voices": []
    }

    return scene


def _count_branches(topics: list) -> int:
    """Count total unexplored branches across all topics."""
    def count_clickables(node: Any) -> int:
        if not isinstance(node, dict):
            return 0

        clickable = node.get("clickable")
        if not isinstance(clickable, dict) or not clickable:
            return 0

        total = 0
        for branch in clickable.values():
            response = branch.get("response") if isinstance(branch, dict) else None
            if isinstance(response, dict):
                branch_total = count_clickables(response)
                total += branch_total if branch_total > 0 else 1
            else:
                total += 1
        return total

    return sum(count_clickables(topic.get("opener", {})) for topic in topics)


def _delete_branch(topic: dict, branch_path: list):
    """Delete a branch from a topic tree."""
    if not branch_path:
        return

    # Navigate to parent of branch to delete
    current = topic.get("opener", {})
    for word in branch_path[:-1]:
        clickable = current.get("clickable", {})
        if word in clickable:
            current = clickable[word].get("response", {})
        else:
            return  # Path not found

    # Delete the final branch
    clickable = current.get("clickable", {})
    if branch_path[-1] in clickable:
        del clickable[branch_path[-1]]


# =============================================================================
# ROUTER
# =============================================================================

def create_playthroughs_router(
    graph_name: str = "blood_ledger",
    host: str = "localhost",
    port: int = 6379,
    playthroughs_dir: str = "playthroughs"
) -> APIRouter:
    """
    Create the playthroughs API router.

    This is mounted in app.py as /api.
    Handles playthrough creation, moment sending, and discussion trees.
    """
    router = APIRouter(tags=["playthroughs"])

    # Store config
    _host = host
    _port = port
    _graph_name = graph_name
    _playthroughs_dir = Path(playthroughs_dir)
    _queries_cache: Dict[str, GraphQueries] = {}

    def _get_playthrough_queries(playthrough_id: str) -> GraphQueries:
        """Get graph queries instance for a specific playthrough."""
        if playthrough_id not in _queries_cache:
            pt_graph_name = get_playthrough_graph_name(playthrough_id) or _graph_name
            _queries_cache[playthrough_id] = GraphQueries(
                graph_name=pt_graph_name,
                host=_host,
                port=_port
            )
        return _queries_cache[playthrough_id]

    # =========================================================================
    # PLAYTHROUGH CREATION
    # =========================================================================

    @router.post("/playthrough/create")
    async def create_playthrough(request: PlaythroughCreateRequest):
        """
        Create a new playthrough:
        1. Create playthrough directory
        2. Save player.yaml
        3. Inject scenario nodes/links into graph
        4. Generate scene.json from opening.json template
        5. Return scene for frontend to display
        """
        import re
        import yaml
        from runtime.physics.graph.graph_ops import GraphOps

        # Generate playthrough ID from player name
        # Slugify: lowercase, replace spaces/special chars with underscore
        base_id = re.sub(r'[^a-z0-9]+', '_', request.player_name.lower()).strip('_')
        if not base_id:
            base_id = "player"

        # Find unique ID (add number suffix if duplicate exists)
        playthrough_id = base_id
        counter = 2
        while (_playthroughs_dir / playthrough_id).exists():
            playthrough_id = f"{base_id}_{counter}"
            counter += 1

        playthrough_dir = _playthroughs_dir / playthrough_id
        playthrough_dir.mkdir(parents=True, exist_ok=True)
        (playthrough_dir / "mutations").mkdir(exist_ok=True)
        (playthrough_dir / "conversations").mkdir(exist_ok=True)

        # 1. Save player.yaml (includes graph_name for other endpoints)
        player_data = {
            "name": request.player_name,
            "gender": request.player_gender,
            "scenario": request.scenario_id,
            "graph_name": playthrough_id,  # Graph name = playthrough_id for isolation
            "created_at": datetime.utcnow().isoformat()
        }
        (playthrough_dir / "player.yaml").write_text(yaml.dump(player_data))

        # 2. Load and inject scenario
        scenarios_dir = Path(__file__).parent.parent.parent.parent / "scenarios"
        scenario_file = scenarios_dir / f"{request.scenario_id}.yaml"

        if not scenario_file.exists():
            raise HTTPException(status_code=404, detail=f"Scenario not found: {request.scenario_id}")

        scenario = yaml.safe_load(scenario_file.read_text())

        # Use playthrough_id as graph name for isolation
        playthrough_graph_name = playthrough_id

        # Initialize new graph with seed data
        try:
            from runtime.init_db import load_initial_state
            logger.info(f"Initializing graph {playthrough_graph_name} with seed data...")
            load_initial_state(playthrough_graph_name, _host, _port)
            logger.info(f"Seed data loaded for {playthrough_graph_name}")
        except Exception as e:
            logger.error(f"Failed to load seed data: {e}")
            # Continue anyway - scenario may still work

        # Inject scenario nodes and links into graph
        try:
            graph = GraphOps(graph_name=playthrough_graph_name, host=_host, port=_port)

            # Build injection data from scenario
            inject_data = {
                "nodes": scenario.get("nodes", []),
                "links": scenario.get("links", [])
            }

            # Update player name/gender in player node if present
            for node in inject_data["nodes"]:
                if node.get("id") == "char_player":
                    node["name"] = request.player_name
                    node["gender"] = request.player_gender

            if inject_data["nodes"] or inject_data["links"]:
                result = graph.apply(data=inject_data, playthrough=playthrough_id)
                logger.info(f"Scenario injected: {len(result.persisted)} items, {len(result.errors)} errors")
                if result.errors:
                    for err in result.errors[:5]:
                        logger.warning(f"  Injection error: {err}")
        except Exception as e:
            logger.error(f"Failed to inject scenario: {e}")

        # 3. Create opening moments from scenario
        try:
            opening = scenario.get("opening", {})
            opening_narration = opening.get("narration", "")
            location_id = scenario.get("location", "place_camp")

            if opening_narration:
                # Split narration into lines and create moments
                lines = [line.strip() for line in opening_narration.strip().split("\n") if line.strip()]
                previous_moment_id = None
                for i, line in enumerate(lines):
                    moment_id = f"opening_{playthrough_id[:8]}_{i}"
                    
                    # Resolve speaker if line starts with quote
                    speaker = None
                    if line.startswith('"') and companion_id:
                        speaker = companion_id
                        line = line.strip('"')

                    graph.add_moment(
                        id=moment_id,
                        text=line,
                        type="dialogue" if speaker else "narration",
                        speaker=speaker,
                        tick_created=0,
                        place_id=location_id,
                        status="active", # Mark as active so they surface immediately
                        weight=1.0 - (i * 0.01) # Slight weight gradient for ordering
                    )
                    
                    # Create ATTACHED_TO link to location (presence_required=false for opening)
                    graph.query(
                        """
                        MATCH (m:Moment {id: $moment_id}), (p:Space {id: $place_id})
                        MERGE (m)-[:ATTACHED_TO {presence_required: false, persistent: false}]->(p)
                        """,
                        params={"moment_id": moment_id, "place_id": location_id}
                    )
                    
                    # Link to previous moment via THEN (history)
                    if previous_moment_id:
                        graph.query(
                            """
                            MATCH (m1:Moment {id: $prev}), (m2:Moment {id: $curr})
                            MERGE (m1)-[:THEN {tick: 0}]->(m2)
                            """,
                            params={"prev": previous_moment_id, "curr": moment_id}
                        )
                    
                    previous_moment_id = moment_id
                logger.info(f"Created {len(lines)} opening moments for {playthrough_id}")
        except Exception as e:
            logger.error(f"Failed to create opening moments: {e}")

        # 4. Load opening.json template and convert to scene
        opening_template_path = Path(__file__).parent.parent.parent / "docs" / "opening" / "opening.json"
        if opening_template_path.exists():
            opening_template = json.loads(opening_template_path.read_text())
            scene = _opening_to_scene_tree(opening_template, scenario)
        else:
            # Fallback minimal scene
            scene = {
                "id": f"scene_{request.scenario_id}_start",
                "location": {"place": "place_camp", "name": "Camp", "region": "The North", "time": "night"},
                "characters": ["char_aldric"],
                "atmosphere": ["The fire crackles."],
                "narration": [{"text": "Aldric looks at you.", "speaker": "char_aldric"}],
                "voices": []
            }

        # 4. Save scene.json
        (playthrough_dir / "scene.json").write_text(json.dumps(scene, indent=2))

        # 5. Initialize empty files
        (playthrough_dir / "message_queue.json").write_text("[]")
        (playthrough_dir / "injection_queue.json").write_text('{"injections": []}')
        (playthrough_dir / "stream.jsonl").write_text("")
        (playthrough_dir / "PROFILE_NOTES.md").write_text("# Player Profile (Opening)\n\n## Answers So Far\n\n## Emerging Pattern\n")

        logger.info(f"Created playthrough {playthrough_id} with scenario {request.scenario_id}")

        return {
            "status": "ok",
            "playthrough_id": playthrough_id,
            "scenario": request.scenario_id,
            "scene": scene
        }

    @router.post("/playthrough/scenario")
    async def create_scenario_playthrough(request: PlaythroughCreateRequest):
        """Alias for /playthrough/create to keep the API contract consistent."""
        logger.info("Creating playthrough via /playthrough/scenario alias.")
        return await create_playthrough(request)

    # =========================================================================
    # MOMENT ENDPOINT (Graph-based)
    # =========================================================================

    @router.post("/moment")
    async def send_moment(request: MomentRequest):
        """
        Send a player moment.

        Creates the moment directly in the graph using MomentProcessor.
        The physics system handles any reactions via tick/weight propagation.
        """
        from runtime.infrastructure.memory.moment_processor import MomentProcessor
        from runtime.physics.graph import GraphOps

        playthrough_dir = _playthroughs_dir / request.playthrough_id
        if not playthrough_dir.exists():
            raise HTTPException(status_code=404, detail="Playthrough not found")

        try:
            # Get graph for this playthrough
            graph_name = get_playthrough_graph_name(request.playthrough_id)
            ops = GraphOps(graph_name=graph_name, host=_host, port=_port)
            queries = _get_playthrough_queries(request.playthrough_id)

            # Get player location
            player_loc = queries.get_player_location("char_player")
            location_id = player_loc.get("id", "place_unknown") if player_loc else "place_unknown"

            # Get current tick from tempo state
            tempo_file = playthrough_dir / "tempo_state.json"
            current_tick = 0
            if tempo_file.exists():
                try:
                    tempo_data = json.loads(tempo_file.read_text())
                    current_tick = tempo_data.get("tick", 0)
                except:
                    pass

            # Create embedding function (use None for now - embeddings are optional)
            def dummy_embed(text: str):
                if not text or not text.strip():
                    return None
                try:
                    from runtime.infrastructure.embeddings.service import get_embedding_service
                    return get_embedding_service().embed(text)
                except Exception as exc:
                    logger.warning(f"[moment] Embedding unavailable: {exc}")
                    return None

            # Create moment processor
            processor = MomentProcessor(
                graph_ops=ops,
                embed_fn=dummy_embed,
                playthrough_id=request.playthrough_id,
                playthroughs_dir=_playthroughs_dir
            )
            processor._current_tick = current_tick
            processor._current_place_id = location_id

            # Process the player action into a graph moment
            moment_id = processor.process_player_action(
                text=request.text,
                player_id="char_player",
                action_type=request.moment_type,
                initial_weight=1.0,
                initial_status = 'completed'
            )

            # Broadcast to SSE listeners so UI refreshes immediately.
            try:
                from runtime.infrastructure.api.sse_broadcast import broadcast_moment_event
                broadcast_moment_event(request.playthrough_id, "moment_completed", {
                    "moment_id": moment_id,
                    "tick": current_tick
                })
            except Exception as exc:
                logger.warning(f"[moment] SSE broadcast failed: {exc}")

            logger.info(f"[moment] Created player moment {moment_id} for {request.playthrough_id}")

            return {
                "status": "created",
                "moment_id": moment_id,
                "narrator_started": False,
                "narrator_running": False
            }

        except Exception as e:
            logger.error(f"[moment] Failed to create moment: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    # =========================================================================
    # DISCUSSION TREE ENDPOINTS
    # =========================================================================

    @router.get("/{playthrough_id}/discussion/{char_id}/topics")
    async def get_discussion_topics(playthrough_id: str, char_id: str):
        """
        Get list of available discussion topics for a character.
        """
        tree_file = _playthroughs_dir / playthrough_id / "discussion_trees" / f"{char_id}.json"

        if not tree_file.exists():
            return {"topics": [], "branch_count": 0}

        try:
            data = json.loads(tree_file.read_text())
            topics = data.get("topics", [])
            branch_count = _count_branches(topics)

            return {
                "topics": [{"id": t["id"], "name": t["name"]} for t in topics],
                "branch_count": branch_count
            }
        except Exception as e:
            logger.error(f"Failed to get discussion topics: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/{playthrough_id}/discussion/{char_id}/topic/{topic_id}")
    async def get_discussion_topic(playthrough_id: str, char_id: str, topic_id: str):
        """
        Get a specific discussion topic tree.
        """
        tree_file = _playthroughs_dir / playthrough_id / "discussion_trees" / f"{char_id}.json"

        if not tree_file.exists():
            raise HTTPException(status_code=404, detail="Discussion trees not found")

        try:
            data = json.loads(tree_file.read_text())
            topics = data.get("topics", [])

            for topic in topics:
                if topic["id"] == topic_id:
                    return {"topic": topic}

            raise HTTPException(status_code=404, detail=f"Topic '{topic_id}' not found")
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Failed to get topic: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    @router.post("/{playthrough_id}/discussion/{char_id}/use-branch")
    async def use_discussion_branch(
        playthrough_id: str,
        char_id: str,
        request: Request
    ):
        """
        Mark a branch as used (delete it from the tree).
        Request body: {"topic_id": "...", "branch_path": ["word1", "word2"]}

        Returns remaining branch count. Triggers regeneration if < 5.
        """
        try:
            body = await request.json()
            topic_id = body.get("topic_id")
            branch_path = body.get("branch_path", [])

            tree_file = _playthroughs_dir / playthrough_id / "discussion_trees" / f"{char_id}.json"

            if not tree_file.exists():
                raise HTTPException(status_code=404, detail="Discussion trees not found")

            data = json.loads(tree_file.read_text())
            topics = data.get("topics", [])

            # Find and modify the topic
            modified = False
            for topic in topics:
                if topic["id"] == topic_id:
                    _delete_branch(topic, branch_path)
                    modified = True
                    break

            if not modified:
                raise HTTPException(status_code=404, detail=f"Topic '{topic_id}' not found")

            # Save updated JSON
            tree_file.write_text(json.dumps({"topics": topics}, indent=2))

            # Count remaining branches
            branch_count = _count_branches(topics)

            # Trigger regeneration if needed
            regenerate_needed = branch_count < 5

            return {
                "status": "ok",
                "branch_count": branch_count,
                "regenerate_needed": regenerate_needed
            }
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Failed to use branch: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    return router
