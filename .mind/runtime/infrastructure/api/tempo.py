# DOCS: docs/infrastructure/tempo/IMPLEMENTATION_Tempo.md
"""
Tempo API endpoints.

Endpoints for controlling game speed and player input timing.

Specs:
- docs/infrastructure/tempo/ALGORITHM_Tempo_Controller.md
"""

import asyncio
import logging
from typing import Dict, Any, Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from runtime.infrastructure.tempo import TempoController

logger = logging.getLogger(__name__)

# Storage for active tempo controllers (per playthrough)
_tempo_controllers: Dict[str, TempoController] = {}
_tempo_tasks: Dict[str, asyncio.Task] = {}

Speed = Literal['pause', '1x', '2x', '3x']


# =============================================================================
# REQUEST/RESPONSE MODELS
# =============================================================================

class SetSpeedRequest(BaseModel):
    """Request to set game speed."""
    playthrough_id: str
    speed: Speed


class PlayerInputRequest(BaseModel):
    """Request for player input."""
    playthrough_id: str
    text: str


class TempoStateResponse(BaseModel):
    """Response with tempo state."""
    speed: Speed
    tick: int
    running: bool
    queue_length: int


class QueueSizeUpdate(BaseModel):
    """Frontend reporting display queue size."""
    playthrough_id: str
    queue_size: int


# =============================================================================
# ROUTER FACTORY
# =============================================================================

def create_tempo_router(
    host: str = "localhost",
    port: int = 6379,
    playthroughs_dir: str = "playthroughs"
) -> APIRouter:
    """Create the tempo API router."""

    router = APIRouter(tags=["tempo"])

    @router.post("/tempo/speed")
    async def set_speed(request: SetSpeedRequest) -> Dict[str, Any]:
        """
        Set game speed for a playthrough.

        POST /api/tempo/speed
        Body: { "playthrough_id": "...", "speed": "1x" }
        """
        controller = _get_or_create_controller(
            request.playthrough_id,
            host=host,
            port=port
        )

        controller.set_speed(request.speed, reason="user")

        return {
            "status": "ok",
            "speed": request.speed
        }

    @router.get("/tempo/{playthrough_id}")
    async def get_tempo_state(playthrough_id: str) -> TempoStateResponse:
        """
        Get current tempo state for a playthrough.

        GET /api/tempo/{playthrough_id}
        """
        controller = _tempo_controllers.get(playthrough_id)

        if not controller:
            # Return defaults if no controller exists yet
            return TempoStateResponse(
                speed='pause',
                tick=0,
                running=False,
                queue_length=0
            )

        return TempoStateResponse(
            speed=controller.speed,
            tick=controller.tick_count,
            running=controller.running,
            queue_length=controller.display_queue_size
        )

    @router.post("/tempo/input")
    async def player_input(request: PlayerInputRequest) -> Dict[str, Any]:
        """
        Handle player input.

        POST /api/tempo/input
        Body: { "playthrough_id": "...", "text": "I look around" }
        """
        controller = _get_or_create_controller(
            request.playthrough_id,
            host=host,
            port=port
        )

        result = await controller.on_player_input(request.text)

        return result

    @router.post("/tempo/queue-size")
    async def update_queue_size(request: QueueSizeUpdate) -> Dict[str, Any]:
        """
        Frontend reports display queue size for backpressure.

        POST /api/tempo/queue-size
        Body: { "playthrough_id": "...", "queue_size": 3 }
        """
        controller = _tempo_controllers.get(request.playthrough_id)

        if controller:
            controller.update_display_queue_size(request.queue_size)

        return {"status": "ok"}

    @router.post("/tempo/start/{playthrough_id}")
    async def start_tempo(playthrough_id: str) -> Dict[str, Any]:
        """
        Start the tempo controller for a playthrough.

        POST /api/tempo/start/{playthrough_id}
        """
        controller = _get_or_create_controller(
            playthrough_id,
            host=host,
            port=port
        )

        # Start the main loop if not already running
        if playthrough_id not in _tempo_tasks or _tempo_tasks[playthrough_id].done():
            task = asyncio.create_task(controller.run())
            _tempo_tasks[playthrough_id] = task
            logger.info(f"[Tempo API] Started controller for {playthrough_id}")

        return {
            "status": "ok",
            "running": True
        }

    @router.post("/tempo/stop/{playthrough_id}")
    async def stop_tempo(playthrough_id: str) -> Dict[str, Any]:
        """
        Stop the tempo controller for a playthrough.

        POST /api/tempo/stop/{playthrough_id}
        """
        controller = _tempo_controllers.get(playthrough_id)

        if controller:
            controller.stop()

        if playthrough_id in _tempo_tasks:
            task = _tempo_tasks[playthrough_id]
            if not task.done():
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass
            del _tempo_tasks[playthrough_id]

        if playthrough_id in _tempo_controllers:
            del _tempo_controllers[playthrough_id]

        logger.info(f"[Tempo API] Stopped controller for {playthrough_id}")

        return {
            "status": "ok",
            "running": False
        }

    return router


# =============================================================================
# HELPERS
# =============================================================================

def _get_or_create_controller(
    playthrough_id: str,
    host: str = "localhost",
    port: int = 6379
) -> TempoController:
    """Get existing controller or create new one."""
    if playthrough_id not in _tempo_controllers:
        controller = TempoController(
            playthrough_id=playthrough_id,
            host=host,
            port=port
        )
        _tempo_controllers[playthrough_id] = controller
        logger.info(f"[Tempo API] Created controller for {playthrough_id}")

    return _tempo_controllers[playthrough_id]


def get_tempo_controller(playthrough_id: str) -> TempoController | None:
    """Get tempo controller for a playthrough (for external use)."""
    return _tempo_controllers.get(playthrough_id)
