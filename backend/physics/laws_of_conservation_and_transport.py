"""The deterministic laws of Venice: legality, motion, production, decay.

*Venice*: the city itself is the magistrate — stones measure every stride,
ovens keep their own time, bread ages whether or not anyone watches, and no
sack of flour ever appears from nothing nor vanishes into it.
Substrate: pure functions over WorldState. No I/O, no Airtable, no randomness.
Everything here is provable: apply_intentions_and_tick deep-copies the world,
and every unit of resource that changes hands is either moved (conserved),
produced (recipe outputs), consumed (recipe inputs / eaten) or rotted —
each recorded in an Event so conservation can be audited from the event log:

    total_before + produced == total_after + consumed + rotted
"""
from __future__ import annotations

import copy
import math
from typing import Any, Optional

from backend.physics.engine_contracts_and_types import (
    CARRY_CAPACITY,
    FOOD_RESOURCES,
    HUNGER_EAT_THRESHOLD,
    HUNGER_STARVING,
    PERISHABLES,
    WALK_METERS_PER_HOUR,
    BuildingState,
    CitizenState,
    Event,
    Intention,
    Position,
    WorldState,
)

# ---------------------------------------------------------------- constants
# Local physical constants (not in the shared contract):
AT_RADIUS_M = 50          # "at" a building: close enough to interact
NEAR_RADIUS_M = 2000      # buildings offered in the goto/haul menu
MAX_GOTO_OPTIONS = 10     # menu size sanity for the minds
MAX_HAUL_OPTIONS = 5      # per the laws: at most 5 haul opportunities
MINUTES_PER_TICK = 60     # 1 tick = 1 Venice hour

# @mind:escalation — contract gap: no price source exists in the contract or
# Airtable RESOURCES for food sales, and no wage source for hauling. Flat
# rates below keep ducats integer and deterministic until an economy layer
# defines real prices. Ducats paid for food currently leave the world (no
# building treasury field in BuildingState); haul pay enters from nothing.
FOOD_PRICE_DUCATS = 10    # per unit, any food resource
HAUL_PAY_PER_UNIT = 2     # ducats earned per unit delivered


# ----------------------------------------------------------------- geometry

def haversine_meters(a: Position, b: Position) -> float:
    """Great-circle distance in meters between two (lat, lng) points."""
    lat1, lng1, lat2, lng2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    dlat, dlng = lat2 - lat1, lng2 - lng1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlng / 2) ** 2
    return 6371000.0 * 2 * math.asin(math.sqrt(h))


def travel_hours(a: Position, b: Position) -> int:
    """Whole Venice-hours to walk from a to b (minimum 1)."""
    return max(1, math.ceil(haversine_meters(a, b) / WALK_METERS_PER_HOUR))


def _is_at(citizen: CitizenState, building: BuildingState) -> bool:
    return haversine_meters(citizen.position, building.position) <= AT_RADIUS_M


# ------------------------------------------------------------- world algebra

def building_load(building: BuildingState) -> int:
    return sum(building.stock.values())


def carried_load(citizen: CitizenState) -> int:
    return sum(citizen.carrying.values())


def total_resource_counts(world: WorldState) -> dict[str, int]:
    """Every unit in the world, by resource — the conservation ledger."""
    totals: dict[str, int] = {}
    for b in world.buildings.values():
        for r, c in b.stock.items():
            totals[r] = totals.get(r, 0) + c
    for c in world.citizens.values():
        for r, q in c.carrying.items():
            totals[r] = totals.get(r, 0) + q
    return totals


def _recipe_startable(building: BuildingState) -> Optional[dict[str, Any]]:
    """First recipe whose inputs are fully present in the building stock."""
    for recipe in building.recipes:
        if all(building.stock.get(r, 0) >= q for r, q in recipe["inputs"].items()):
            return recipe
    return None


def _carried_food(citizen: CitizenState) -> Optional[str]:
    """Preferred food the citizen carries, or None."""
    for food in FOOD_RESOURCES:
        if citizen.carrying.get(food, 0) > 0:
            return food
    return None


# ------------------------------------------------------------- legal actions

def legal_actions(world: WorldState, username: str) -> list[dict[str, Any]]:
    """The complete menu of lawful actions for one citizen, right now.

    This is the anti-hallucination core: minds may only pick one of these.
    Raises KeyError for unknown citizens — asking about ghosts is a bug.
    """
    citizen = world.citizens[username]
    menu: list[dict[str, Any]] = []

    if citizen.travel is not None:
        # Mid-journey: the only lawful choice is to keep walking.
        return [{"action": "rest"}]

    # --- goto: nearby buildings + home/work wherever they are -------------
    candidates: dict[str, BuildingState] = {}
    for b in world.buildings.values():
        if haversine_meters(citizen.position, b.position) <= NEAR_RADIUS_M:
            candidates[b.building_id] = b
    for special in (citizen.home_building, citizen.work_building):
        if special and special in world.buildings:
            candidates[special] = world.buildings[special]
    goto_entries = []
    for b in candidates.values():
        if _is_at(citizen, b):
            continue  # already there — going there is meaningless
        label = f"{b.type} ({b.category})"
        if b.building_id == citizen.home_building:
            label += " [home]"
        if b.building_id == citizen.work_building:
            label += " [work]"
        goto_entries.append({
            "action": "goto",
            "to_building": b.building_id,
            "label": label,
            "hours": travel_hours(citizen.position, b.position),
        })
    goto_entries.sort(key=lambda e: (e["hours"], e["to_building"]))
    menu.extend(goto_entries[:MAX_GOTO_OPTIONS])

    # --- buy_food: a business at hand selling food it actually has -------
    capacity_left = CARRY_CAPACITY - carried_load(citizen)
    for b in world.buildings.values():
        if b.category != "business" or not _is_at(citizen, b):
            continue
        for food in FOOD_RESOURCES:
            stock = b.stock.get(food, 0)
            max_count = min(stock, capacity_left, citizen.ducats // FOOD_PRICE_DUCATS)
            if max_count > 0:
                menu.append({
                    "action": "buy_food",
                    "building": b.building_id,
                    "resource": food,
                    "price": FOOD_PRICE_DUCATS,
                    "max_count": max_count,
                })

    # --- eat: only if carrying food --------------------------------------
    if _carried_food(citizen) is not None:
        menu.append({"action": "eat"})

    # --- work: at work building with a startable or running recipe -------
    if citizen.work_building and citizen.work_building in world.buildings:
        wb = world.buildings[citizen.work_building]
        if _is_at(citizen, wb) and (
            wb.active_production is not None or _recipe_startable(wb) is not None
        ):
            menu.append({"action": "work"})

    # --- haul: surplus at hand -> room elsewhere (max 5 opportunities) ---
    haul_entries = []
    for src in world.buildings.values():
        if not _is_at(citizen, src):
            continue
        for resource, stock in sorted(src.stock.items()):
            if stock <= 0:
                continue
            count = min(stock, CARRY_CAPACITY)
            # Nearest destination with room for this load.
            best: Optional[tuple[float, BuildingState]] = None
            for dst in world.buildings.values():
                if dst.building_id == src.building_id:
                    continue
                room = dst.storage_capacity - building_load(dst)
                if room < count:
                    continue
                d = haversine_meters(src.position, dst.position)
                if d > NEAR_RADIUS_M:
                    continue
                if best is None or d < best[0]:
                    best = (d, dst)
            if best is not None:
                haul_entries.append({
                    "action": "haul",
                    "from_building": src.building_id,
                    "to_building": best[1].building_id,
                    "resource": resource,
                    "count": count,
                    "pay": count * HAUL_PAY_PER_UNIT,
                })
    menu.extend(haul_entries[:MAX_HAUL_OPTIONS])

    menu.append({"action": "rest"})
    return menu


# ------------------------------------------------------- intention validation

_MATCH_KEYS = {
    "goto": ("to_building",),
    "buy_food": ("building", "resource"),
    "eat": (),
    "work": (),
    "haul": ("from_building", "to_building", "resource"),
    "rest": (),
}


def _find_menu_entry(menu: list[dict[str, Any]], action: dict[str, Any]) -> Optional[dict[str, Any]]:
    """Match an intention's action against the legal menu (identity keys only;
    'count' may be reduced by the mind, never raised)."""
    kind = action.get("action")
    if kind not in _MATCH_KEYS:
        return None
    for entry in menu:
        if entry["action"] != kind:
            continue
        if all(entry.get(k) == action.get(k) for k in _MATCH_KEYS[kind]):
            return entry
    return None


# --------------------------------------------------------------- the tick

def apply_intentions_and_tick(
    world: WorldState, intentions: list[Intention]
) -> tuple[WorldState, list[Event]]:
    """Advance Venice by one hour. Pure: returns a new WorldState.

    Order of law: intentions -> travel -> production -> decay -> hunger ->
    auto-eat -> starving. Every resource movement is an Event.
    """
    w = copy.deepcopy(world)
    t = w.tick + 1  # the hour being lived through
    events: list[Event] = []

    def emit(etype: str, subject: str, narrative: str, **data: Any) -> None:
        events.append(Event(tick=t, type=etype, subject=subject, narrative=narrative, data=data))

    # ---- 1. validate and apply intentions (in list order) ---------------
    for intention in intentions:
        username = intention.citizen
        if username not in w.citizens:
            emit("refused", username, f"{username} n'existe pas dans Venise.",
                 reason="unknown_citizen", action=intention.action)
            continue
        citizen = w.citizens[username]
        menu = legal_actions(w, username)
        entry = _find_menu_entry(menu, intention.action)
        if entry is None:
            emit("refused", username,
                 f"{username} tente une action hors des lois: {intention.action.get('action')!r}.",
                 reason="not_in_legal_menu", action=intention.action)
            continue
        kind = entry["action"]

        if kind == "rest":
            pass

        elif kind == "goto":
            dest = w.buildings[entry["to_building"]]
            citizen.travel = {
                "to": dest.position,
                "to_building": dest.building_id,
                "minutes_left": travel_hours(citizen.position, dest.position) * MINUTES_PER_TICK,
            }

        elif kind == "buy_food":
            count = int(intention.action.get("count", entry["max_count"]))
            if count < 1 or count > entry["max_count"]:
                emit("refused", username,
                     f"{username} demande {count} unités mais le maximum légal est "
                     f"{entry['max_count']}.",
                     reason="count_out_of_bounds", action=intention.action)
                continue
            building = w.buildings[entry["building"]]
            resource = entry["resource"]
            building.stock[resource] -= count
            if building.stock[resource] == 0:
                del building.stock[resource]
            citizen.carrying[resource] = citizen.carrying.get(resource, 0) + count
            citizen.ducats -= entry["price"] * count
            emit("bought", username,
                 f"{username} achète {count} {resource} pour {entry['price'] * count} ducats.",
                 building=building.building_id, resource=resource, count=count,
                 ducats=entry["price"] * count)

        elif kind == "eat":
            food = _carried_food(citizen)
            citizen.carrying[food] -= 1
            if citizen.carrying[food] == 0:
                del citizen.carrying[food]
            citizen.hunger = 0
            emit("ate", username, f"{username} mange 1 {food} et se sent rassasié.",
                 resource=food, count=1)

        elif kind == "work":
            building = w.buildings[citizen.work_building]
            if building.active_production is None:
                recipe = _recipe_startable(building)
                building.active_production = {
                    "recipe": recipe,
                    "minutes_left": recipe["craftMinutes"],
                }
                emit("production_started", building.building_id,
                     f"{username} lance la production de "
                     f"{', '.join(recipe['outputs'])} au {building.type}.",
                     citizen=username, recipe=recipe)
            # If production already runs, working simply keeps it running.

        elif kind == "haul":
            count = int(intention.action.get("count", entry["count"]))
            if count < 1 or count > entry["count"]:
                emit("refused", username,
                     f"{username} veut transporter {count} unités, maximum légal "
                     f"{entry['count']}.",
                     reason="count_out_of_bounds", action=intention.action)
                continue
            src = w.buildings[entry["from_building"]]
            dst = w.buildings[entry["to_building"]]
            resource = entry["resource"]
            src.stock[resource] -= count
            if src.stock[resource] == 0:
                del src.stock[resource]
            citizen.carrying[resource] = citizen.carrying.get(resource, 0) + count
            citizen.travel = {
                "to": dst.position,
                "to_building": dst.building_id,
                "minutes_left": travel_hours(citizen.position, dst.position) * MINUTES_PER_TICK,
                "deliver": {"building": dst.building_id, "resource": resource,
                            "count": count, "pay": entry["pay"]},
            }
            emit("pickup", username,
                 f"{username} charge {count} {resource} depuis {src.type} pour livraison.",
                 from_building=src.building_id, resource=resource, count=count)

    # ---- 2. advance travels, deliver arrivals ---------------------------
    for citizen in w.citizens.values():
        if citizen.travel is None:
            continue
        citizen.travel["minutes_left"] -= MINUTES_PER_TICK
        if citizen.travel["minutes_left"] > 0:
            continue
        citizen.position = tuple(citizen.travel["to"])
        arrived_at = citizen.travel.get("to_building")
        delivery = citizen.travel.get("deliver")
        citizen.travel = None
        if delivery is not None:
            building = w.buildings[delivery["building"]]
            resource, count = delivery["resource"], delivery["count"]
            room = building.storage_capacity - building_load(building)
            deposited = min(count, max(0, room), citizen.carrying.get(resource, 0))
            if deposited > 0:
                citizen.carrying[resource] -= deposited
                if citizen.carrying[resource] == 0:
                    del citizen.carrying[resource]
                building.stock[resource] = building.stock.get(resource, 0) + deposited
                citizen.ducats += delivery["pay"]
            leftover = count - deposited
            emit("delivered", citizen.username,
                 f"{citizen.username} livre {deposited} {resource} à {building.type}"
                 + (f" ({leftover} refusés faute de place, gardés sur soi)." if leftover else "."),
                 building=building.building_id, resource=resource,
                 count=deposited, leftover=leftover, pay=delivery["pay"] if deposited else 0)
        else:
            emit("arrived", citizen.username,
                 f"{citizen.username} arrive à destination.", building=arrived_at)

    # ---- 3. advance productions -----------------------------------------
    for building in w.buildings.values():
        if building.active_production is None:
            continue
        building.active_production["minutes_left"] -= MINUTES_PER_TICK
        if building.active_production["minutes_left"] > 0:
            continue
        recipe = building.active_production["recipe"]
        building.active_production = None
        inputs, outputs = recipe["inputs"], recipe["outputs"]
        # Inputs are consumed at completion (they must still be there), and
        # outputs must fit: net change may not overflow storage.
        if any(building.stock.get(r, 0) < q for r, q in inputs.items()):
            emit("production_failed", building.building_id,
                 f"La production au {building.type} échoue: les intrants ont disparu.",
                 reason="inputs_missing", recipe=recipe)
            continue
        net = sum(outputs.values()) - sum(inputs.values())
        if building_load(building) + net > building.storage_capacity:
            emit("production_failed", building.building_id,
                 f"La production au {building.type} échoue: l'entrepôt est plein.",
                 reason="storage_full", recipe=recipe)
            continue
        for r, q in inputs.items():
            building.stock[r] -= q
            if building.stock[r] == 0:
                del building.stock[r]
        for r, q in outputs.items():
            building.stock[r] = building.stock.get(r, 0) + q
        emit("produced", building.building_id,
             f"Le {building.type} produit {', '.join(f'{q} {r}' for r, q in outputs.items())}.",
             inputs=dict(inputs), outputs=dict(outputs))

    # ---- 4. perishable decay (deterministic: 1 unit/stack every N hours) -
    def decay_stacks(stock: dict[str, int], subject: str, place: str) -> None:
        for resource in sorted(stock):
            shelf = PERISHABLES.get(resource)
            if shelf is None or t % shelf != 0 or stock[resource] <= 0:
                continue
            stock[resource] -= 1
            if stock[resource] == 0:
                del stock[resource]
            emit("rotted", subject, f"1 {resource} pourrit {place}.",
                 resource=resource, count=1)

    for building in w.buildings.values():
        decay_stacks(building.stock, building.building_id, f"dans {building.type}")
    for citizen in w.citizens.values():
        decay_stacks(citizen.carrying, citizen.username, "dans sa besace")

    # ---- 5. hunger, auto-eat, starving ----------------------------------
    for citizen in w.citizens.values():
        citizen.hunger += 1
        if citizen.hunger >= HUNGER_EAT_THRESHOLD:
            food = _carried_food(citizen)
            if food is not None:
                citizen.carrying[food] -= 1
                if citizen.carrying[food] == 0:
                    del citizen.carrying[food]
                citizen.hunger = 0
                emit("ate", citizen.username,
                     f"{citizen.username}, affamé, mange 1 {food} de sa besace.",
                     resource=food, count=1)
        if citizen.hunger >= HUNGER_STARVING:
            emit("starving", citizen.username,
                 f"{citizen.username} meurt de faim (faim={citizen.hunger}).",
                 hunger=citizen.hunger)

    w.tick = t
    w.venice_hour = (w.venice_hour + 1) % 24
    return w, events


# ------------------------------------------------------ conservation audit

def conservation_ledger(events: list[Event]) -> dict[str, dict[str, int]]:
    """Aggregate produced/consumed/rotted per resource from an event stream.

    Consumption = eaten food + production inputs. Production = recipe outputs.
    With these, for every resource:
        total_before + produced == total_after + consumed + rotted
    """
    ledger: dict[str, dict[str, int]] = {}

    def bucket(resource: str) -> dict[str, int]:
        return ledger.setdefault(resource, {"produced": 0, "consumed": 0, "rotted": 0})

    for e in events:
        if e.type == "produced":
            for r, q in e.data["outputs"].items():
                bucket(r)["produced"] += q
            for r, q in e.data["inputs"].items():
                bucket(r)["consumed"] += q
        elif e.type == "ate":
            bucket(e.data["resource"])["consumed"] += e.data["count"]
        elif e.type == "rotted":
            bucket(e.data["resource"])["rotted"] += e.data["count"]
    return ledger
