"""Round-robin scheduler: which citizens think this tick.

*Venice*: the bell tolls and a handful of souls across the city lift their
heads at once — next hour, the next handful. No one is forgotten.
Substrate: deterministic rotating slice over sorted usernames, so every
citizen thinks every ceil(N / per_tick) ticks, with zero state kept between
calls (the tick number IS the state).
"""
from __future__ import annotations

from backend.physics.engine_contracts_and_types import WorldState


def pick_thinkers(world: WorldState, per_tick: int = 10, tick: int | None = None) -> list[str]:
    """Deterministic rotating slice of citizens who think this tick.

    tick defaults to world.tick. Same (world citizens, per_tick, tick)
    always yields the same list.
    """
    if per_tick < 1:
        raise ValueError(f"per_tick must be >= 1, got {per_tick}")
    if tick is None:
        tick = world.tick

    usernames = sorted(world.citizens)
    n = len(usernames)
    if n == 0:
        return []
    if per_tick >= n:
        return usernames

    start = (tick * per_tick) % n
    return [usernames[(start + i) % n] for i in range(per_tick)]
