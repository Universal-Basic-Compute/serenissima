"""
FastAPI Application

Main API application with endpoints for:
- Scene generation and clicks
- View data (map, ledger, faces, chronicle)
- SSE for rolling window updates

Docs:
- docs/engine/moments/PATTERNS_Moments.md — architecture + rationale
- docs/engine/moments/API_Moments.md — HTTP contract for the moment graph

DOCS: docs/infrastructure/api/
"""

# DOCS: docs/infrastructure/api/

import asyncio
import json
import logging
import subprocess
from pathlib import Path
from typing import Dict, Any, Optional, AsyncGenerator
from datetime import datetime

from fastapi import FastAPI, HTTPException, Request, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from runtime.infrastructure.orchestration import Orchestrator
from runtime.moment_graph import MomentTraversal, MomentQueries, MomentSurface
from runtime.physics.graph import GraphQueries, GraphOps, add_mutation_listener
from runtime.infrastructure.api.moments import create_moments_router
from runtime.infrastructure.api.playthroughs import create_playthroughs_router
from runtime.infrastructure.api.tempo import create_tempo_router
from runtime.infrastructure.api.graphs import create_graphs_router

# =============================================================================
# LOGGING SETUP
# =============================================================================

_project_root = Path(__file__).parent.parent.parent
_log_dir = _project_root / "data" / "logs"
_log_dir.mkdir(parents=True, exist_ok=True)

# Configure file logging
_file_handler = logging.FileHandler(_log_dir / "backend.log")
_file_handler.setLevel(logging.DEBUG)
_file_handler.setFormatter(logging.Formatter(
    '%(asctime)s %(levelname)s %(name)s: %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
))

# Configure root logger
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(name)s: %(message)s',
    datefmt='%H:%M:%S'
)
logging.getLogger().addHandler(_file_handler)

# Also log uvicorn access/errors
logging.getLogger("uvicorn").addHandler(_file_handler)
logging.getLogger("uvicorn.access").addHandler(_file_handler)
logging.getLogger("uvicorn.error").addHandler(_file_handler)

logger = logging.getLogger(__name__)


# =============================================================================
# REQUEST/RESPONSE MODELS
# =============================================================================

class ActionRequest(BaseModel):
    """Request for a player action."""
    playthrough_id: str
    action: str
    player_id: str = "char_player"
    location: Optional[str] = None
    stream: bool = False  # If true, returns SSE stream instead of JSON


class SceneResponse(BaseModel):
    """Response containing a scene."""
    scene: Dict[str, Any]
    time_elapsed: str


class DialogueChunk(BaseModel):
    """A single chunk of streamed dialogue."""
    speaker: Optional[str] = None  # Character ID if dialogue, None for narration
    text: str


class NewPlaythroughRequest(BaseModel):
    """Request to create a new playthrough."""
    drive: str  # BLOOD, OATH, or SHADOW
    companion: str = "char_aldric"
    initial_goal: Optional[str] = None


class QueryRequest(BaseModel):
    """Request for semantic query."""
    query: str


# =============================================================================
# APPLICATION FACTORY
# =============================================================================

def create_app(
    graph_name: str = "blood_ledger",
    host: str = "localhost",
    port: int = 6379,
    playthroughs_dir: str = "playthroughs"
) -> FastAPI:
    """
    Create the FastAPI application.

    Args:
        graph_name: FalkorDB graph name
        host: FalkorDB host
        port: FalkorDB port
        playthroughs_dir: Directory for playthrough data

    Returns:
        Configured FastAPI app
    """
    app = FastAPI(
        title="Graph Engine API",
        description="API for The Graph Engine narrative RPG",
        version="0.1.0"
    )

    # CORS middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],  # Configure properly for production
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Per-playthrough orchestrators
    _orchestrators: Dict[str, Orchestrator] = {}
    _debug_sse_clients: list = []  # list of queues for debug/mutation events
    _playthroughs_dir = Path(playthroughs_dir)
    _graph_queries: Optional[GraphQueries] = None
    _graph_ops: Optional[GraphOps] = None

    # Register mutation listener to broadcast to debug SSE clients
    def _mutation_event_handler(event: Dict[str, Any]):
        """Handle mutation events and broadcast to debug SSE clients."""
        for queue in _debug_sse_clients:
            try:
                queue.put_nowait(event)
            except:
                pass  # Queue full or closed

    add_mutation_listener(_mutation_event_handler)

    def get_orchestrator(playthrough_id: str) -> Orchestrator:
        """Get or create orchestrator for a playthrough."""
        if playthrough_id not in _orchestrators:
            # Use playthrough_id as graph name (each playthrough has its own graph)
            pt_graph_name = playthrough_id if playthrough_id.startswith("pt_") else graph_name
            _orchestrators[playthrough_id] = Orchestrator(
                playthrough_id=playthrough_id,
                graph_name=pt_graph_name,
                host=host,
                port=port,
                playthroughs_dir=playthroughs_dir
            )
        return _orchestrators[playthrough_id]

    def get_graph_queries() -> GraphQueries:
        """Get graph queries instance for default graph."""
        nonlocal _graph_queries
        if _graph_queries is None:
            _graph_queries = GraphQueries(
                graph_name=graph_name,
                host=host,
                port=port
            )
        return _graph_queries

    def get_playthrough_queries(playthrough_id: str) -> GraphQueries:
        """Get graph queries instance for a specific playthrough."""
        from runtime.physics.graph import get_playthrough_graph_name
        pt_graph_name = get_playthrough_graph_name(playthrough_id)
        return GraphQueries(graph_name=pt_graph_name, host=host, port=port)

    def get_moment_queries(playthrough_id: str) -> MomentQueries:
        """Get moment queries instance for a specific playthrough."""
        from runtime.physics.graph import get_playthrough_graph_name
        pt_graph_name = get_playthrough_graph_name(playthrough_id)
        return MomentQueries(graph_name=pt_graph_name, host=host, port=port)

    def get_graph_ops() -> GraphOps:
        """Get graph ops instance."""
        nonlocal _graph_ops
        if _graph_ops is None:
            _graph_ops = GraphOps(graph_name=graph_name, host=host, port=port)
        return _graph_ops

    # =========================================================================
    # MOMENTS ROUTER (Moment Graph API)
    # =========================================================================

    # Mount the moments API router for moment graph operations
    # Endpoints: GET /api/moments/current, POST /api/moments/click, etc.
    moments_router = create_moments_router(
        host=host,
        port=port,
        playthroughs_dir=playthroughs_dir
    )
    app.include_router(moments_router, prefix="/api")

    # Mount the playthroughs API router for playthrough management
    # Endpoints: POST /api/playthrough/create, POST /api/moment, discussion trees
    playthroughs_router = create_playthroughs_router(
        graph_name=graph_name,
        host=host,
        port=port,
        playthroughs_dir=playthroughs_dir
    )
    app.include_router(playthroughs_router, prefix="/api")

    # Mount the tempo API router for game speed control
    # Endpoints: POST /api/tempo/speed, GET /api/tempo/{id}, POST /api/tempo/input
    tempo_router = create_tempo_router(
        host=host,
        port=port,
        playthroughs_dir=playthroughs_dir
    )
    app.include_router(tempo_router, prefix="/api")

    # Mount the graphs API router for generic graph management
    # Endpoints: POST /api/graph/create, DELETE /api/graph/{name}, GET /api/graph
    graphs_router = create_graphs_router()
    app.include_router(graphs_router)

    # =========================================================================
    # HEALTH CHECK
    # =========================================================================

    @app.get("/health")
    async def health_check():
        """Health check endpoint."""
        timestamp = datetime.utcnow().isoformat()
        details = {
            "graph_read": "ok",
            "graph_write": "ok",
            "orchestrators": len(_orchestrators)
        }
        errors: Dict[str, str] = {}

        try:
            read = get_graph_queries()
            read.query("RETURN 1 AS ok")
        except Exception as exc:
            details["graph_read"] = "error"
            errors["graph_read"] = str(exc)

        try:
            get_graph_ops()
        except Exception as exc:
            details["graph_write"] = "error"
            errors["graph_write"] = str(exc)

        if errors:
            raise HTTPException(
                status_code=503,
                detail={
                    "status": "degraded",
                    "timestamp": timestamp,
                    "details": details,
                    "errors": errors
                }
            )

        return {"status": "ok", "timestamp": timestamp, "details": details}

    # =========================================================================
    # PLAYTHROUGH ENDPOINTS
    # =========================================================================

    @app.post("/api/playthrough")
    async def create_playthrough(request: NewPlaythroughRequest):
        """
        Create a new playthrough.

        Sets up playthrough directory for mutations and world injections.
        Player psychology tracked in narrator's conversation context.
        Story notes live in the graph (narrative.narrator_notes).
        """
        import uuid
        playthrough_id = f"pt_{uuid.uuid4().hex[:8]}"
        playthrough_dir = _playthroughs_dir / playthrough_id
        playthrough_dir.mkdir(parents=True, exist_ok=True)

        # Create mutations directory
        (playthrough_dir / "mutations").mkdir(exist_ok=True)

        # Initialize orchestrator
        get_orchestrator(playthrough_id)

        return {
            "playthrough_id": playthrough_id,
            "drive": request.drive,
            "companion": request.companion,
            "status": "created"
        }

    @app.post("/api/action")
    async def player_action(request: ActionRequest):
        """
        Full game loop: narrator -> tick -> flips -> world runner.

        This is the main endpoint for player actions after the initial
        instant-response click path (/api/moment/click).
        """
        try:
            orchestrator = get_orchestrator(request.playthrough_id)
            result = orchestrator.process_action(
                player_action=request.action,
                player_id=request.player_id,
                player_location=request.location
            )
            return result
        except Exception as e:
            logger.error(f"Action processing failed: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    @app.get("/api/playthrough/{playthrough_id}")
    async def get_playthrough(playthrough_id: str):
        """Get playthrough status and info."""
        playthrough_dir = _playthroughs_dir / playthrough_id
        if not playthrough_dir.exists():
            raise HTTPException(status_code=404, detail="Playthrough not found")

        return {
            "playthrough_id": playthrough_id,
            "has_world_injection": (playthrough_dir / "world_injection.md").exists()
        }

    # =========================================================================
    # MOMENT GRAPH ENDPOINTS
    # =========================================================================

    class MomentClickRequest(BaseModel):
        """Request for clicking a word using Moment Graph architecture."""
        playthrough_id: str
        moment_id: str
        word: str
        player_id: str = "char_player"

    class MomentClickResponse(BaseModel):
        """Response for Moment Graph click."""
        flipped: bool
        flipped_moments: list
        weight_updates: list
        queue_narrator: bool

    @app.post("/api/moment/click", response_model=MomentClickResponse)
    async def moment_click(request: MomentClickRequest):
        """
        Handle a word click using the Moment Graph architecture.

        This is the instant-response path (<50ms target).
        No LLM calls in this path.

        1. Find CAN_LEAD_TO links from moment where word is in require_words
        2. Apply weight_transfer to target moments
        3. Check for flips (weight > 0.8)
        4. Return flipped moments, or queue_narrator=True if nothing flips
        """
        try:
            ops = get_graph_ops()
            result = ops.handle_click(
                moment_id=request.moment_id,
                clicked_word=request.word,
                player_id=request.player_id
            )
            return MomentClickResponse(**result)
        except Exception as e:
            logger.error(f"Moment click failed: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    @app.get("/api/moment/view/{playthrough_id}")
    async def get_moment_view(
        playthrough_id: str,
        location_id: str = Query(..., description="Current location ID"),
        player_id: str = Query("char_player", description="Player character ID")
    ):
        """
        Get the current view using Moment Graph architecture.

        Returns moments visible to player at location, ordered by weight.
        This replaces scene.json reads with live graph queries.
        """
        try:
            queries = get_playthrough_queries(playthrough_id)
            read = get_moment_queries(playthrough_id)
            
            # Resolve present characters at the location
            present = queries.get_characters_at(location_id)
            present_ids = [c['id'] for c in present]
            
            view = read.get_current_view(
                player_id=player_id,
                location_id=location_id,
                present_chars=present_ids
            )
            return view
        except Exception as e:
            logger.error(f"Get moment view failed: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    @app.get("/api/view/{playthrough_id}")
    async def get_current_view(
        playthrough_id: str,
        player_id: str = Query("char_player", description="Player character ID"),
        location_id: Optional[str] = Query(
            None,
            description="Override location ID; defaults to player's current AT edge"
        )
    ):
        """
        Resolve the player's current location (unless overridden) and return the
        CurrentView payload described in docs/engine/moments/API_Moments.md.
        """
        try:
            queries = get_playthrough_queries(playthrough_id)
            moments = get_moment_queries(playthrough_id)
            
            resolved_location_id = location_id
            if not resolved_location_id:
                location = queries.get_player_location(player_id=player_id)
                if not location:
                    raise HTTPException(
                        status_code=404,
                        detail=f"Player '{player_id}' has no AT link. Move the player before requesting view."
                    )
                resolved_location_id = location.get("id")

            # Get present characters
            present = queries.get_characters_at(resolved_location_id)
            present_ids = [c['id'] for c in present]

            view = moments.get_current_view(
                player_id=player_id,
                location_id=resolved_location_id,
                present_chars=present_ids
            )

            return view
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Get current view failed: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    @app.get("/api/moment/view/{playthrough_id}/scene-tree")
    async def get_moment_view_as_scene_tree(
        playthrough_id: str,
        location_id: str = Query(..., description="Current location ID"),
        player_id: str = Query("char_player", description="Player character ID")
    ):
        """
        Get the current view as a SceneTree for backward compatibility.

        Fetches from Moment Graph but converts to SceneTree format
        so existing frontend components work unchanged.
        """
        try:
            from runtime.physics.graph.graph_queries import view_to_scene_tree

            read = get_playthrough_queries(playthrough_id)
            view = read.get_current_view(
                player_id=player_id,
                location_id=location_id
            )
            scene_tree = view_to_scene_tree(view)
            return {"scene": scene_tree}
        except Exception as e:
            logger.error(f"Get scene tree failed: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    @app.post("/api/moment/weight")
    async def update_moment_weight(request: Request):
        """
        Manually update a moment's weight.

        Request body: {"moment_id": "...", "weight_delta": 0.2, "reason": "..."}
        """
        try:
            body = await request.json()
            ops = get_graph_ops()
            result = ops.update_moment_weight(
                moment_id=body.get("moment_id"),
                weight_delta=body.get("weight_delta", 0.0),
                reason=body.get("reason", "api_call")
            )
            return result
        except Exception as e:
            logger.error(f"Weight update failed: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    # =========================================================================
    # DEBUG SSE ENDPOINT (Graph Mutations)
    # =========================================================================

    @app.get("/api/debug/stream")
    async def debug_stream(request: Request):
        """
        SSE endpoint for graph mutation events.

        Clients connect here to receive real-time updates when mutations are applied.
        Events include: apply_start, node_created, link_created, movement, apply_complete

        Use this for the debug panel in the frontend.
        """
        async def event_generator() -> AsyncGenerator[str, None]:
            queue = asyncio.Queue(maxsize=100)

            # Register this client
            _debug_sse_clients.append(queue)

            try:
                # Send initial connection event
                yield f"event: connected\ndata: {{\"message\": \"Debug stream connected\"}}\n\n"

                while True:
                    # Check if client disconnected
                    if await request.is_disconnected():
                        break

                    try:
                        # Wait for events with timeout
                        event = await asyncio.wait_for(queue.get(), timeout=30)
                        event_type = event.get('type', 'mutation')
                        payload = json.dumps(event, default=str)
                        yield f"event: {event_type}\ndata: {payload}\n\n"
                    except asyncio.TimeoutError:
                        # Send keepalive
                        yield f"event: ping\ndata: {{}}\n\n"
                    except asyncio.CancelledError:
                        break
            finally:
                # Unregister client
                if queue in _debug_sse_clients:
                    _debug_sse_clients.remove(queue)

        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
            }
        )

    # =========================================================================
    # VIEW ENDPOINTS
    # =========================================================================

    @app.get("/api/{playthrough_id}/map")
    async def get_map(playthrough_id: str, player_id: str = "char_player"):
        """
        Get map data showing places and connections.
        """
        try:
            read = get_playthrough_queries(playthrough_id)

            # Get all places
            places = read.query("""
                MATCH (p:Space)
                RETURN p.id, p.name, p.type, p.mood
            """)

            # Get connections
            connections = read.query("""
                MATCH (p1:Space)-[r:CONNECTS]->(p2:Space)
                WHERE r.path > 0.5
                RETURN p1.id, p2.id, r.path_distance, r.path_difficulty
            """)

            # Get player location
            player_loc = read.query(f"""
                MATCH (c:Actor {{id: '{player_id}'}})-[:AT]->(p:Space)
                RETURN p.id
            """)

            # Handle dict results from FalkorDB
            player_location = None
            if player_loc and player_loc[0]:
                if isinstance(player_loc[0], dict):
                    player_location = player_loc[0].get('p.id')
                else:
                    player_location = player_loc[0][0]

            return {
                "places": places,
                "connections": connections,
                "player_location": player_location
            }
        except Exception as e:
            logger.error(f"Failed to get map: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    @app.get("/api/{playthrough_id}/ledger")
    async def get_ledger(playthrough_id: str, player_id: str = "char_player"):
        """
        Get ledger data showing debts, oaths, and blood ties.
        """
        try:
            read = get_playthrough_queries(playthrough_id)

            # Get core narratives (oath, debt, blood) that player believes
            ledger_items = read.query(f"""
                MATCH (c:Actor {{id: '{player_id}'}})-[b:BELIEVES]->(n:Narrative)
                WHERE n.type IN ['oath', 'debt', 'blood', 'enmity']
                  AND b.heard > 0.5
                RETURN n.id, n.name, n.content, n.type, n.tone, b.believes
                ORDER BY b.believes DESC
            """)

            return {"items": ledger_items}
        except Exception as e:
            logger.error(f"Failed to get ledger: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    @app.get("/api/{playthrough_id}/faces")
    async def get_faces(playthrough_id: str, player_id: str = "char_player"):
        """
        Get faces data showing known characters.
        """
        try:
            read = get_playthrough_queries(playthrough_id)

            # Get characters the player knows about (major characters and those in narratives)
            # Note: about_characters is stored as JSON string, so we use a simpler query
            characters = read.query("""
                MATCH (c:Actor)
                WHERE c.type IN ['major', 'minor'] AND c.type <> 'player'
                RETURN DISTINCT c.id, c.name, c.type, c.face
            """)

            # Get companion info
            companions = read.query("""
                MATCH (c:Actor {type: 'companion'})
                RETURN c.id, c.name, c.face, c.voice_tone
            """)

            return {
                "known_characters": characters,
                "companions": companions
            }
        except Exception as e:
            logger.error(f"Failed to get faces: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    @app.get("/api/{playthrough_id}/chronicle")
    async def get_chronicle(playthrough_id: str, player_id: str = "char_player"):
        """
        Get chronicle data showing event history.
        """
        try:
            read = get_playthrough_queries(playthrough_id)

            # Get memory and account narratives the player believes
            events = read.query(f"""
                MATCH (c:Actor {{id: '{player_id}'}})-[b:BELIEVES]->(n:Narrative)
                WHERE n.type IN ['memory', 'account']
                  AND b.heard > 0.5
                RETURN n.id, n.name, n.content, n.type, n.tone, b.believes
                ORDER BY n.weight DESC
                LIMIT 50
            """)

            return {"events": events}
        except Exception as e:
            logger.error(f"Failed to get chronicle: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    # =========================================================================
    # QUERY ENDPOINT
    # =========================================================================

    @app.post("/api/{playthrough_id}/query")
    async def semantic_query_post(playthrough_id: str, request: QueryRequest):
        """
        Natural language query via embeddings (POST).
        """
        try:
            from runtime.world.map import get_semantic_search
            search = get_semantic_search(graph_name=graph_name, host=host, port=port)
            results = search.find(request.query, limit=10)
            return {"results": results, "query": request.query}
        except Exception as e:
            logger.error(f"Failed to execute query: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    @app.get("/api/{playthrough_id}/query")
    async def semantic_query_get(playthrough_id: str, query: str = Query(..., description="Search query")):
        """
        Natural language query via embeddings (GET).
        """
        try:
            from runtime.world.map import get_semantic_search
            search = get_semantic_search(graph_name=graph_name, host=host, port=port)
            results = search.find(query, limit=10)
            return {"results": results, "query": query}
        except Exception as e:
            logger.error(f"Failed to execute query: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    # =========================================================================
    # INJECTION ENDPOINT
    # =========================================================================

    @app.post("/api/inject")
    async def inject_event(request: Request):
        """
        Write an injection to the queue for hook processing.
        Used by frontend for player UI actions (stop, location change, etc.)
        """
        try:
            body = await request.json()
            injection_file = _playthroughs_dir / "default" / "injection_queue.jsonl"
            injection_file.parent.mkdir(parents=True, exist_ok=True)

            with open(injection_file, "a") as f:
                f.write(json.dumps(body) + "\n")

            return {"status": "ok", "injection": body}
        except Exception as e:
            logger.error(f"Failed to inject: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    return app


# =============================================================================
# MAIN ENTRY POINT
# =============================================================================

# Use absolute path to project root's playthroughs directory
_project_root = Path(__file__).parent.parent.parent
_default_playthroughs = str(_project_root / "playthroughs")

app = create_app(playthroughs_dir=_default_playthroughs)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
