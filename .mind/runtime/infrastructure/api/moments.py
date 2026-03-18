"""
Moment Graph API Endpoints

Fast endpoints for moment graph traversal and queries.
The click path is HOT - must be <50ms, no LLM calls.

Docs:
- docs/engine/UI_API_CHANGES_Moment_Graph.md — full API specification
- docs/engine/IMPL_PHASE_1_Moment_Graph.md — implementation guide
"""

import asyncio
import json
import logging
from typing import List, Optional, Dict, Any, AsyncGenerator
from pathlib import Path

import yaml

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from runtime.moment_graph import MomentTraversal, MomentQueries, MomentSurface
from runtime.physics.graph import GraphQueries, get_playthrough_graph_name
from .sse_broadcast import (
    broadcast_moment_event,
    register_sse_client,
    unregister_sse_client,
    get_sse_clients
)

logger = logging.getLogger(__name__)


def _resolve_graph_name(playthrough_id: str, playthroughs_dir: Optional[Path]) -> str:
    """Resolve the graph name for a playthrough, honoring configured directories."""
    if playthroughs_dir:
        player_file = playthroughs_dir / playthrough_id / "player.yaml"
        if player_file.exists():
            try:
                data = yaml.safe_load(player_file.read_text()) or {}
                graph_name = data.get("graph_name")
                if graph_name:
                    return graph_name
            except Exception as exc:
                logger.warning(f"Failed to read graph name for {playthrough_id}: {exc}")
    return get_playthrough_graph_name(playthrough_id)


def _get_queries(
    playthrough_id: str,
    host: str,
    port: int,
    playthroughs_dir: Optional[Path] = None
) -> MomentQueries:
    """Get MomentQueries for a specific playthrough."""
    graph_name = _resolve_graph_name(playthrough_id, playthroughs_dir)
    return MomentQueries(graph_name=graph_name, host=host, port=port)


def _get_traversal(
    playthrough_id: str,
    host: str,
    port: int,
    playthroughs_dir: Optional[Path] = None
) -> MomentTraversal:
    """Get MomentTraversal for a specific playthrough."""
    graph_name = _resolve_graph_name(playthrough_id, playthroughs_dir)
    return MomentTraversal(graph_name=graph_name, host=host, port=port)


def _get_surface(
    playthrough_id: str,
    host: str,
    port: int,
    playthroughs_dir: Optional[Path] = None
) -> MomentSurface:
    """Get MomentSurface for a specific playthrough."""
    graph_name = _resolve_graph_name(playthrough_id, playthroughs_dir)
    return MomentSurface(graph_name=graph_name, host=host, port=port)


def _get_graph_queries(
    playthrough_id: str,
    host: str,
    port: int,
    playthroughs_dir: Optional[Path] = None
) -> GraphQueries:
    """Get GraphQueries for a specific playthrough."""
    graph_name = _resolve_graph_name(playthrough_id, playthroughs_dir)
    return GraphQueries(graph_name=graph_name, host=host, port=port)

# =============================================================================
# REQUEST/RESPONSE MODELS
# =============================================================================

class MomentResponse(BaseModel):
    """A moment from the graph."""
    id: str
    content: str
    type: str
    status: str
    weight: float
    tone: Optional[str] = None
    tick_created: int = 0
    tick_resolved: Optional[int] = None
    speaker: Optional[str] = None  # From SAID link
    clickable_words: List[str] = Field(default_factory=list)


class TransitionResponse(BaseModel):
    """A CAN_LEAD_TO link."""
    from_id: str
    to_id: str
    trigger: str
    require_words: List[str] = Field(default_factory=list)
    weight_transfer: float = 0.3
    consumes_origin: bool = True


class CurrentMomentsResponse(BaseModel):
    """Response for GET /moments/current."""
    location: Optional[Dict[str, Any]] = None
    characters: List[Dict[str, Any]] = Field(default_factory=list)
    things: List[Dict[str, Any]] = Field(default_factory=list)
    moments: List[MomentResponse]
    transitions: List[TransitionResponse]
    active_count: int


class ClickRequest(BaseModel):
    """Request for clicking a word in a moment."""
    playthrough_id: str
    moment_id: str
    word: str
    tick: int


class ClickResponse(BaseModel):
    """Response for clicking a word."""
    status: str  # ok, no_match, error
    traversed: bool
    target_moment: Optional[MomentResponse] = None
    consumed_origin: bool = False
    new_active_moments: List[MomentResponse] = Field(default_factory=list)


class SurfaceRequest(BaseModel):
    """Request to manually surface a moment."""
    moment_id: str
    playthrough_id: str


# =============================================================================
# ROUTER
# =============================================================================

def create_moments_router(
    host: str = "localhost",
    port: int = 6379,
    playthroughs_dir: str = "playthroughs"
) -> APIRouter:
    """
    Create the moments API router.

    This is mounted in app.py as /api/moments.
    Each playthrough uses its own graph (graph_name = playthrough_id).
    """
    router = APIRouter(prefix="/moments", tags=["moments"])

    # Store config for creating per-playthrough instances
    _host = host
    _port = port
    _playthroughs_dir = Path(playthroughs_dir)

    # SSE client management now uses shared sse_broadcast module
    # broadcast_moment_event, register_sse_client, unregister_sse_client imported from sse_broadcast

    # =========================================================================
    # GET CURRENT MOMENTS
    # =========================================================================

    @router.get("/current/{playthrough_id}", response_model=CurrentMomentsResponse)
    async def get_current_moments(
        playthrough_id: str,
        player_id: str = Query("char_player"),
        location: str = Query(None),
        present_chars: str = Query(None),  # Comma-separated
        present_things: str = Query(None)  # Comma-separated
    ):
        """
        Get visible moments for the current scene.

        Based on player location and present entities.
        Returns active/possible moments and their transitions.
        """
        # Parse comma-separated lists
        chars = present_chars.split(",") if present_chars else []
        things = present_things.split(",") if present_things else []

        # Get playthrough-specific instances
        queries = _get_queries(playthrough_id, _host, _port, _playthroughs_dir)

        # If no location, try to get player's current location
        if not location:
            try:
                read = _get_graph_queries(playthrough_id, _host, _port, _playthroughs_dir)
                result = read.query(f"""
                    MATCH (c:Actor {{id: '{player_id}'}})-[:AT]->(p:Space)
                    WHERE EXISTS((c)-[:AT {{present: 1.0}}]->(p))
                    RETURN p.id
                """)
                location = result[0][0] if result else "place_unknown"
            except Exception as e:
                logger.warning(f"Could not get player location: {e}")
                location = "place_unknown"

        try:
            # Get current view from queries
            view = queries.get_current_view(
                player_id=player_id,
                location_id=location,
                present_chars=chars,
                present_things=things
            )

            # Convert to response models
            moments = []
            for m in view.get("moments", []):
                # Get clickable words from transitions
                clickable = []
                for t in view.get("transitions", []):
                    if t["from_id"] == m["id"]:
                        clickable.extend(t.get("require_words", []))

                moments.append(MomentResponse(
                    id=m["id"],
                    content=m.get("content", ""),
                    type=m.get("type", "narration"),
                    status=m.get("status", "possible"),
                    weight=m.get("weight", 0.5),
                    tone=m.get("tone"),
                    tick_created=m.get("tick_created", 0),
                    tick_resolved=m.get("tick_resolved"),
                    speaker=m.get("speaker"),
                    clickable_words=list(set(clickable))
                ))

            transitions = [
                TransitionResponse(
                    from_id=t["from_id"],
                    to_id=t["to_id"],
                    trigger=t.get("trigger", "click"),
                    require_words=t.get("require_words", []),
                    weight_transfer=t.get("weight_transfer", 0.3),
                    consumes_origin=t.get("consumes_origin", True)
                )
                for t in view.get("transitions", [])
            ]

            return CurrentMomentsResponse(
                location=view.get("location"),
                characters=view.get("characters", []),
                things=view.get("things", []),
                moments=moments,
                transitions=transitions,
                active_count=view.get("active_count", 0)
            )

        except Exception as e:
            logger.error(f"get_current_moments failed: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    # =========================================================================
    # CLICK (HOT PATH)
    # =========================================================================

    @router.post("/click", response_model=ClickResponse)
    async def click_word(request: ClickRequest):
        """
        Handle player clicking a word in a moment.

        THIS IS THE HOT PATH - must complete in <50ms.
        No LLM calls. Pure graph traversal.
        """
        try:
            # Get playthrough-specific traversal instance
            traversal = _get_traversal(request.playthrough_id, _host, _port, _playthroughs_dir)

            # Traverse the graph
            result = traversal.handle_click(
                moment_id=request.moment_id,
                word=request.word,
                tick=request.tick,
                player_id="char_player"
            )

            if not result:
                return ClickResponse(
                    status="no_match",
                    traversed=False,
                    consumed_origin=False
                )

            # Get any newly activated moments
            # (For now, just return the target)
            target = MomentResponse(
                id=result["id"],
                content=result.get("content", ""),
                type=result.get("type", "narration"),
                status="active",
                weight=result.get("weight", 0.5),
                tone=result.get("tone"),
                clickable_words=result.get("require_words", [])
            )

            # Broadcast click event to SSE clients
            broadcast_moment_event(request.playthrough_id, "click_traversed", {
                "from_moment_id": request.moment_id,
                "to_moment_id": result["id"],
                "word": request.word,
                "consumed_origin": result.get("consumes_origin", True)
            })

            # Broadcast activation event
            broadcast_moment_event(request.playthrough_id, "moment_activated", {
                "moment_id": result["id"],
                "weight": result.get("weight", 0.5),
                "content": result.get("content", "")
            })

            return ClickResponse(
                status="ok",
                traversed=True,
                target_moment=target,
                consumed_origin=result.get("consumes_origin", True),
                new_active_moments=[target]
            )

        except Exception as e:
            logger.error(f"click_word failed: {e}")
            return ClickResponse(
                status="error",
                traversed=False,
                consumed_origin=False
            )

    # =========================================================================
    # STATS (DEBUG) - Must be before /{moment_id} to avoid route collision
    # =========================================================================

    @router.get("/stats/{playthrough_id}")
    async def get_moment_stats(playthrough_id: str):
        """
        Get moment statistics (debug endpoint).

        Returns counts by status.
        """
        try:
            surface = _get_surface(playthrough_id, _host, _port, _playthroughs_dir)
            stats = surface.get_surface_stats()
            return {"stats": stats}
        except Exception as e:
            logger.error(f"get_moment_stats failed: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    # =========================================================================
    # SURFACE (ADMIN/DEBUG)
    # =========================================================================

    @router.post("/surface")
    async def surface_moment(request: SurfaceRequest):
        """
        Manually surface a moment (for testing/admin).

        Sets the moment's status to 'active' and weight to 1.0.
        """
        try:
            surface = _get_surface(request.playthrough_id, _host, _port, _playthroughs_dir)
            traversal = _get_traversal(request.playthrough_id, _host, _port, _playthroughs_dir)

            surface.set_moment_weight(request.moment_id, 1.0)
            traversal.activate_moment(request.moment_id, tick=0)

            return {"status": "ok", "moment_id": request.moment_id}

        except Exception as e:
            logger.error(f"surface_moment failed: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    # =========================================================================
    # SSE STREAM
    # =========================================================================

    @router.get("/stream/{playthrough_id}")
    async def moment_stream(request: Request, playthrough_id: str):
        """
        SSE endpoint for real-time moment updates.

        Events:
        - moment_activated: A moment became active (weight >= 0.8)
        - moment_completed: A moment was completed
        - moment_decayed: A moment decayed (weight < 0.1)
        - weight_updated: A moment's weight changed
        - click_traversed: A click traversal occurred

        Connect: GET /api/moments/stream/{playthrough_id}
        """
        async def event_generator() -> AsyncGenerator[str, None]:
            queue: asyncio.Queue = asyncio.Queue(maxsize=100)

            # Register this client using shared module
            register_sse_client(playthrough_id, queue)

            try:
                # Send initial connection event
                yield f"event: connected\ndata: {{\"playthrough_id\": \"{playthrough_id}\"}}\n\n"

                while True:
                    # Check if client disconnected
                    if await request.is_disconnected():
                        break

                    try:
                        # Wait for events with timeout (for keepalive)
                        event = await asyncio.wait_for(queue.get(), timeout=30)
                        event_type = event.get("type", "update")
                        event_data = json.dumps(event.get("data", {}))
                        yield f"event: {event_type}\ndata: {event_data}\n\n"
                    except asyncio.TimeoutError:
                        # Send keepalive ping
                        yield f"event: ping\ndata: {{}}\n\n"

            finally:
                # Unregister client using shared module
                unregister_sse_client(playthrough_id, queue)

        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",  # Disable nginx buffering
            }
        )

    # =========================================================================
    # GET SINGLE MOMENT
    # =========================================================================

    @router.get("/{playthrough_id}/{moment_id}")
    async def get_moment(playthrough_id: str, moment_id: str):
        """
        Get a single moment by ID with full details.

        Includes attachments, speakers, and transitions.
        """
        try:
            queries = _get_queries(playthrough_id, _host, _port, _playthroughs_dir)
            moment = queries.get_moment_by_id(moment_id)

            if not moment:
                raise HTTPException(status_code=404, detail="Moment not found")

            return moment

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"get_moment failed: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    # Expose broadcast function for use by other modules
    router.broadcast_moment_event = broadcast_moment_event

    return router


# =============================================================================
# CONVENIENCE FUNCTION
# =============================================================================

def get_moments_router(
    host: str = "localhost",
    port: int = 6379,
    playthroughs_dir: str = "playthroughs"
) -> APIRouter:
    """Get the moments router with default config."""
    return create_moments_router(
        host=host,
        port=port,
        playthroughs_dir=playthroughs_dir
    )
