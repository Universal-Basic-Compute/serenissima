"""Shared contracts between the Physics layer (deterministic laws) and the
Minds layer (Ollama-driven citizen decisions).

*Venice*: the stone tablets at the Arsenal gate — every porter, baker and
patrician reads the same laws before entering the city's machinery.
Substrate: single source of truth for state shapes, action schema and events;
physics/ and minds/ both import from here and nothing else crosses the border.

DESIGN RULES
- Physics is deterministic and AI-free. It exposes: load_world(), legal_actions(),
  apply_tick(). It validates every intention against the laws.
- Minds only ever choose ONE action from the menu physics hands them.
- All quantities are integers (no float ducats/resources inside the engine).
- 1 tick = 1 Venice hour. Speed: a citizen walks ~4000 m/Venice-hour.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal, Optional

# ---------------------------------------------------------------- world state

Position = tuple[float, float]  # (lat, lng) — WGS84, converted to meters only inside physics


@dataclass
class ResourceStack:
    """A quantity of one resource type at one place (locality law)."""
    resource: str          # e.g. "bread", "flour", "timber"
    count: int


@dataclass
class BuildingState:
    building_id: str
    type: str                                   # e.g. "bakery"
    position: Position
    category: str                               # business | home | public | ...
    storage_capacity: int                       # max total units stored
    stock: dict[str, int] = field(default_factory=dict)     # resource -> count
    # Production (from data/buildings/<type>.json productionInformation.Arti):
    # each recipe: {"inputs": {res: qty}, "outputs": {res: qty}, "craftMinutes": int}
    recipes: list[dict[str, Any]] = field(default_factory=list)
    active_production: Optional[dict[str, Any]] = None      # {"recipe": ..., "minutes_left": int}
    run_by: Optional[str] = None                            # citizen username operating it


@dataclass
class CitizenState:
    username: str
    position: Position
    ducats: int
    hunger: int = 0            # 0 = sated; +1 per Venice hour; eats at >= 12; starving events at >= 24
    carrying: dict[str, int] = field(default_factory=dict)  # resource -> count (capacity: CARRY_CAPACITY)
    travel: Optional[dict[str, Any]] = None   # {"to": Position, "to_building": str|None, "minutes_left": int}
    home_building: Optional[str] = None
    work_building: Optional[str] = None


@dataclass
class WorldState:
    tick: int                   # Venice hours elapsed since engine start
    venice_hour: int            # 0..23, drives day/night behavior later
    citizens: dict[str, CitizenState]
    buildings: dict[str, BuildingState]


CARRY_CAPACITY = 20             # units a citizen can carry
WALK_METERS_PER_HOUR = 4000
HUNGER_EAT_THRESHOLD = 12
HUNGER_STARVING = 24
FOOD_RESOURCES = ("bread", "fish", "vegetables", "meat", "grain")  # eaten in this order of preference
PERISHABLES: dict[str, int] = {"bread": 48, "fish": 24, "vegetables": 72, "meat": 36}  # shelf life in Venice hours (naive: % chance-free, deterministic decay of 1 unit per N hours per stack)

# -------------------------------------------------------------------- actions
# The ONLY vocabulary minds may use. Physics builds the legal menu; the mind
# picks one entry and fills nothing but the declared params.

ActionType = Literal["goto", "buy_food", "eat", "work", "haul", "rest"]

# Menu entry shapes (as plain dicts, JSON-serializable for the Ollama prompt):
#   {"action": "goto",     "to_building": str, "label": str, "hours": int}
#   {"action": "buy_food", "building": str, "resource": str, "price": int, "max_count": int}
#   {"action": "eat"}                          # only if carrying food
#   {"action": "work"}                         # only if at work_building with a startable/continuable recipe
#   {"action": "haul",     "from_building": str, "to_building": str, "resource": str, "count": int, "pay": int}
#   {"action": "rest"}
#
# A mind's answer MUST be exactly one menu entry (optionally with "count"
# reduced) plus a one-sentence "why" used as the citizen's thought.


@dataclass
class Intention:
    citizen: str
    action: dict[str, Any]      # one menu entry, possibly with reduced count
    why: str                    # one sentence, first person — becomes a thought_log


# --------------------------------------------------------------------- events

@dataclass
class Event:
    tick: int
    type: str                   # e.g. "delivered", "produced", "rotted", "ate", "starving", "refused"
    subject: str                # citizen username or building_id
    narrative: str              # one human-readable sentence (French or English, consistent)
    data: dict[str, Any] = field(default_factory=dict)


# The physics public API (implemented in laws/tick_runner):
#   load_world() -> WorldState                       (world_state_loader)
#   legal_actions(world, username) -> list[dict]     (action menu, anti-hallucination core)
#   apply_intentions_and_tick(world, intentions) -> tuple[WorldState, list[Event]]
#
# Conservation invariant (tested): for every resource,
#   total_before + produced + imported == total_after + consumed + rotted
