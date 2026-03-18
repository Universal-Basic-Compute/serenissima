"""
Tempo Controller — Pacing the Main Loop

Owns time progression and surfacing cadence. Ticks at a speed-controlled
interval, invokes physics, and triggers canon surfacing independently of
narrator execution.

FREEZE BEHAVIOR (decided 2025-12-23):
    Pause = 0 ticks. No graph time passes, queue frozen as-is,
    resumes exactly where left off.

SEE: docs/infrastructure/tempo/PATTERNS_Tempo.md
"""
from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import Optional

from runtime.physics import GraphTick


@dataclass
class TempoState:
    """Tempo loop state. Pause freezes everything in place."""
    speed: str = "1x"
    running: bool = False
    paused: bool = False
    tick_count: int = 0
    # Tick count when pause started (for resume verification)
    tick_at_pause: Optional[int] = field(default=None)


class TempoController:
    """
    Async tick loop coordinating physics and canon surfacing.

    Freeze semantics:
        - pause() stops all tick progression immediately
        - No physics runs, no canon recording, tick_count frozen
        - resume() continues exactly where left off
        - Queue state preserved across pause/resume
    """

    # Speed mode to tick interval (seconds)
    SPEED_INTERVALS = {
        "1x": 1.0,
        "2x": 0.2,
        "3x": 0.01,
    }

    def __init__(self, graph_tick: GraphTick, canon_holder: Optional[object] = None) -> None:
        self.graph_tick = graph_tick
        self.canon_holder = canon_holder
        self.state = TempoState()
        self._pause_event = asyncio.Event()
        self._pause_event.set()  # Start unpaused

    @property
    def speed(self) -> str:
        return self.state.speed

    @property
    def running(self) -> bool:
        return self.state.running

    @property
    def paused(self) -> bool:
        return self.state.paused

    @property
    def tick_count(self) -> int:
        return self.state.tick_count

    def set_speed(self, speed: str) -> None:
        """Set tick speed. Valid: 1x, 2x, 3x."""
        if speed not in self.SPEED_INTERVALS:
            raise ValueError(f"Invalid speed: {speed}. Valid: {list(self.SPEED_INTERVALS.keys())}")
        self.state.speed = speed

    def pause(self) -> None:
        """
        Freeze the tempo loop.

        No graph time passes. Queue frozen as-is.
        Tick count preserved for exact resume.
        """
        if not self.state.paused:
            self.state.paused = True
            self.state.tick_at_pause = self.state.tick_count
            self._pause_event.clear()

    def resume(self) -> None:
        """
        Resume from frozen state.

        Continues exactly where left off — same tick count,
        same queue state.
        """
        if self.state.paused:
            self.state.paused = False
            self.state.tick_at_pause = None
            self._pause_event.set()

    def _tick_interval(self) -> float:
        return self.SPEED_INTERVALS.get(self.state.speed, 1.0)

    async def run(self) -> None:
        """
        Main tempo loop. Ticks physics and records canon.

        Respects pause: blocks on _pause_event when frozen.
        No busy-wait during pause.
        """
        self.state.running = True
        while self.state.running:
            # Block if paused — no CPU burn
            await self._pause_event.wait()

            if not self.state.running:
                break

            interval = self._tick_interval()
            await asyncio.sleep(interval)

            # Double-check pause (could have paused during sleep)
            if self.state.paused:
                continue

            self.state.tick_count += 1
            tick_result = self.graph_tick.run()

            if self.canon_holder is not None:
                record = getattr(self.canon_holder, "record_to_canon", None)
                if callable(record):
                    record(tick_result)

    def stop(self) -> None:
        """Stop the tempo loop entirely."""
        self.state.running = False
        self._pause_event.set()  # Unblock if paused so loop can exit
