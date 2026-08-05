"""Legal action menu builder for citizen minds.

*Venice*: the herald at each campo reads aloud what a citizen MAY do this
hour — walk, buy bread, work, haul crates, or simply rest. Nothing else
exists for them.
Substrate: pure function over WorldState producing menu entries that conform
exactly to the shapes declared in backend/physics/engine_contracts_and_types.py.
This is the anti-hallucination core: the 2B model can only ever pick one of
these entries, so it can never invent an illegal action.

No I/O, no randomness, no mutation of the world. Fail loud on unknown citizens.
"""
from __future__ import annotations

import math

from backend.physics.engine_contracts_and_types import (
    CARRY_CAPACITY,
    FOOD_RESOURCES,
    WALK_METERS_PER_HOUR,
    BuildingState,
    CitizenState,
    Position,
    WorldState,
)

# Tunables of the menu (menu policy, not physics law)
MAX_MENU_ENTRIES = 10
GOTO_NEARBY_RADIUS_M = 500.0
GOTO_NEARBY_MAX = 4
BUY_FOOD_RADIUS_M = 100.0
BUY_FOOD_PRICE_DUCATS = 10
WORK_RADIUS_M = 50.0
HAUL_FROM_RADIUS_M = 300.0
HAUL_TO_RADIUS_M = 800.0
HAUL_SURPLUS_THRESHOLD = 20  # a building "has surplus" above this many units
HAUL_PAY_DUCATS = 5
HAUL_MAX_PROPOSALS = 3
ARRIVAL_EPSILON_M = 1.0  # closer than this = "already there", no goto offered

# French display names for labels only — the "resource" field stays canonical.
RESOURCE_LABELS_FR = {
    "bread": "du pain",
    "fish": "du poisson",
    "vegetables": "des légumes",
    "meat": "de la viande",
    "grain": "du grain",
    "flour": "de la farine",
    "timber": "du bois",
    "iron": "du fer",
    "tools": "des outils",
}


def _fr(resource: str) -> str:
    return RESOURCE_LABELS_FR.get(resource, resource)


def _haversine_meters(a: Position, b: Position) -> float:
    """Great-circle distance in meters between two (lat, lng) points."""
    lat1, lng1 = a
    lat2, lng2 = b
    r = 6_371_000.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lng2 - lng1)
    h = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlmb / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def _walk_hours(distance_m: float) -> int:
    """Integer Venice-hours to walk a distance (minimum 1)."""
    return max(1, math.ceil(distance_m / WALK_METERS_PER_HOUR))


def _carry_space(citizen: CitizenState) -> int:
    return CARRY_CAPACITY - sum(citizen.carrying.values())


def _building_free_space(building: BuildingState) -> int:
    return building.storage_capacity - sum(building.stock.values())


# --------------------------------------------------------------- menu sections

def _eat_entries(citizen: CitizenState) -> list[dict]:
    for resource in FOOD_RESOURCES:
        if citizen.carrying.get(resource, 0) > 0:
            return [{
                "action": "eat",
                "label": f"Manger {_fr(resource)} de ma besace",
            }]
    return []


def _work_entries(world: WorldState, citizen: CitizenState) -> list[dict]:
    if not citizen.work_building:
        return []
    building = world.buildings.get(citizen.work_building)
    if building is None:
        return []
    if _haversine_meters(citizen.position, building.position) > WORK_RADIUS_M:
        return []
    continuable = building.active_production is not None
    startable = any(
        all(building.stock.get(res, 0) >= qty for res, qty in recipe.get("inputs", {}).items())
        for recipe in building.recipes
    )
    if not (continuable or startable):
        return []
    return [{
        "action": "work",
        "label": f"Travailler à mon atelier ({building.type})",
    }]


def _buy_food_entries(world: WorldState, citizen: CitizenState) -> list[dict]:
    space = _carry_space(citizen)
    budget_units = citizen.ducats // BUY_FOOD_PRICE_DUCATS
    if space <= 0 or budget_units <= 0:
        return []
    entries: list[dict] = []
    nearby = sorted(
        world.buildings.values(),
        key=lambda b: _haversine_meters(citizen.position, b.position),
    )
    for building in nearby:
        if _haversine_meters(citizen.position, building.position) > BUY_FOOD_RADIUS_M:
            break  # sorted by distance: nothing further can qualify
        for resource in FOOD_RESOURCES:
            stock = building.stock.get(resource, 0)
            max_count = min(stock, budget_units, space)
            if max_count >= 1:
                entries.append({
                    "action": "buy_food",
                    "building": building.building_id,
                    "resource": resource,
                    "price": BUY_FOOD_PRICE_DUCATS,
                    "max_count": max_count,
                    "label": (
                        f"Acheter {_fr(resource)} à {building.building_id} "
                        f"({BUY_FOOD_PRICE_DUCATS} ducats l'unité, max {max_count})"
                    ),
                })
    return entries


def _goto_entries(world: WorldState, citizen: CitizenState) -> list[dict]:
    entries: list[dict] = []
    offered: set[str] = set()

    def offer(building_id: str, label: str) -> None:
        building = world.buildings.get(building_id)
        if building is None or building_id in offered:
            return
        distance = _haversine_meters(citizen.position, building.position)
        if distance <= ARRIVAL_EPSILON_M:
            return  # already there
        offered.add(building_id)
        entries.append({
            "action": "goto",
            "to_building": building_id,
            "label": label,
            "hours": _walk_hours(distance),
        })

    if citizen.home_building:
        offer(citizen.home_building, "Rentrer chez moi")
    if citizen.work_building:
        offer(citizen.work_building, "Aller à mon travail")

    nearby = sorted(
        (
            (dist, b)
            for b in world.buildings.values()
            if b.building_id not in offered
            and ARRIVAL_EPSILON_M
            < (dist := _haversine_meters(citizen.position, b.position))
            <= GOTO_NEARBY_RADIUS_M
        ),
        key=lambda pair: pair[0],
    )
    for _dist, building in nearby[:GOTO_NEARBY_MAX]:
        offer(building.building_id, f"Marcher jusqu'à {building.type} ({building.building_id})")
    return entries


def _haul_entries(world: WorldState, citizen: CitizenState) -> list[dict]:
    entries: list[dict] = []
    sources = sorted(
        world.buildings.values(),
        key=lambda b: _haversine_meters(citizen.position, b.position),
    )
    for source in sources:
        if len(entries) >= HAUL_MAX_PROPOSALS:
            break
        if _haversine_meters(citizen.position, source.position) > HAUL_FROM_RADIUS_M:
            break
        for resource, count in sorted(source.stock.items()):
            surplus = count - HAUL_SURPLUS_THRESHOLD
            if surplus <= 0:
                continue
            for dest in sources:
                if dest.building_id == source.building_id:
                    continue
                if _haversine_meters(citizen.position, dest.position) > HAUL_TO_RADIUS_M:
                    continue
                free = _building_free_space(dest)
                haul_count = min(CARRY_CAPACITY, surplus, free)
                if haul_count < 1:
                    continue
                entries.append({
                    "action": "haul",
                    "from_building": source.building_id,
                    "to_building": dest.building_id,
                    "resource": resource,
                    "count": haul_count,
                    "pay": HAUL_PAY_DUCATS,
                    "label": (
                        f"Porter {haul_count} unités ({_fr(resource)}) de {source.building_id} "
                        f"à {dest.building_id} (+{HAUL_PAY_DUCATS} ducats)"
                    ),
                })
                break  # one destination per (source, resource)
            if len(entries) >= HAUL_MAX_PROPOSALS:
                break
    return entries


# --------------------------------------------------------------------- public

def build_menu(world: WorldState, username: str) -> list[dict]:
    """Build the legal action menu for one citizen.

    *Venice*: the herald's scroll — short French labels a tired mind can read.
    Substrate: pure function; conforms to the menu entry shapes of the
    contract; at most MAX_MENU_ENTRIES entries; "rest" is always present.
    """
    if username not in world.citizens:
        raise KeyError(f"Unknown citizen: {username!r}")
    citizen = world.citizens[username]

    entries: list[dict] = []
    entries += _eat_entries(citizen)
    entries += _work_entries(world, citizen)
    entries += _buy_food_entries(world, citizen)
    entries += _goto_entries(world, citizen)
    entries += _haul_entries(world, citizen)

    entries = entries[: MAX_MENU_ENTRIES - 1]  # keep room for rest
    entries.append({"action": "rest", "label": "Me reposer ici"})
    return entries
