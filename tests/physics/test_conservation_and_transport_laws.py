"""Tests of the deterministic laws of Venice on synthetic worlds.

*Venice*: a miniature city of glass on a magistrate's desk — two streets,
one oven, one warehouse — where every law can be watched with the naked eye.
Substrate: hand-built WorldState objects, zero Airtable, zero network.
Run: backend/venv/Scripts/python.exe -m pytest tests/physics/ -v
"""
from __future__ import annotations

import copy

from backend.physics.engine_contracts_and_types import (
    CARRY_CAPACITY,
    HUNGER_EAT_THRESHOLD,
    PERISHABLES,
    BuildingState,
    CitizenState,
    Intention,
    WorldState,
)
from backend.physics.laws_of_conservation_and_transport import (
    apply_intentions_and_tick,
    conservation_ledger,
    legal_actions,
    total_resource_counts,
)

# 1 degree of latitude ~= 111320 m; positions are built as meters north of a
# base point so haversine distances are predictable.
BASE_LAT, BASE_LNG = 45.4300, 12.3300


def pos(meters_north: float) -> tuple[float, float]:
    return (BASE_LAT + meters_north / 111320.0, BASE_LNG)


def make_bakery(stock=None, capacity=100) -> BuildingState:
    return BuildingState(
        building_id="bakery_1", type="bakery", position=pos(0), category="business",
        storage_capacity=capacity, stock=dict(stock or {}),
        recipes=[{"inputs": {"flour": 2, "water": 1}, "outputs": {"bread": 6},
                  "craftMinutes": 60}],
    )


def make_warehouse(meters_north=1000, stock=None, capacity=50) -> BuildingState:
    return BuildingState(
        building_id="warehouse_1", type="small_warehouse", position=pos(meters_north),
        category="business", storage_capacity=capacity, stock=dict(stock or {}), recipes=[],
    )


def make_world(citizens=(), buildings=()) -> WorldState:
    return WorldState(
        tick=0, venice_hour=6,
        citizens={c.username: c for c in citizens},
        buildings={b.building_id: b for b in buildings},
    )


def assert_conservation(world_before: WorldState, world_after: WorldState, events) -> None:
    """total_before + produced == total_after + consumed + rotted, per resource."""
    before = total_resource_counts(world_before)
    after = total_resource_counts(world_after)
    ledger = conservation_ledger(events)
    for resource in set(before) | set(after) | set(ledger):
        led = ledger.get(resource, {"produced": 0, "consumed": 0, "rotted": 0})
        assert before.get(resource, 0) + led["produced"] == (
            after.get(resource, 0) + led["consumed"] + led["rotted"]
        ), f"conservation violated for {resource}"
    # No negative quantities anywhere, ever.
    for b in world_after.buildings.values():
        assert all(c >= 0 for c in b.stock.values()), f"negative stock in {b.building_id}"
    for c in world_after.citizens.values():
        assert all(q >= 0 for q in c.carrying.values()), f"negative carry for {c.username}"


# --------------------------------------------------------------------------
# 1. Total conservation over 50 ticks with production + transport + hunger
# --------------------------------------------------------------------------

def test_conservation_over_50_ticks_with_production_transport_and_hunger():
    worker = CitizenState(
        username="worker", position=pos(0), ducats=100, hunger=6,
        carrying={"bread": 3}, work_building="bakery_1",
    )
    world = make_world(
        citizens=[worker],
        buildings=[make_bakery(stock={"flour": 10, "water": 5}),
                   make_warehouse(meters_north=1000)],
    )
    initial = copy.deepcopy(world)
    all_events = []

    for _ in range(50):
        # Deterministic driver: prefer work, then haul, else rest — exercising
        # production, transport and auto-eat within the legal menu only.
        intentions = []
        menu = legal_actions(world, "worker")
        chosen = next((e for e in menu if e["action"] == "work"),
                      next((e for e in menu if e["action"] == "haul"), None))
        if chosen is not None:
            intentions.append(Intention(citizen="worker", action=dict(chosen),
                                        why="Je fais tourner la ville."))
        world, events = apply_intentions_and_tick(world, intentions)
        all_events.extend(events)

    assert world.tick == 50
    # The world actually lived: bread was produced and someone ate.
    assert any(e.type == "produced" for e in all_events)
    assert any(e.type == "ate" for e in all_events)
    assert_conservation(initial, world, all_events)


# --------------------------------------------------------------------------
# 2. A journey takes the correct number of hours
# --------------------------------------------------------------------------

def test_travel_takes_correct_number_of_hours():
    # 8000 m at 4000 m/h => exactly 2 Venice hours.
    walker = CitizenState(username="walker", position=pos(0), ducats=0, hunger=0)
    far = make_warehouse(meters_north=8000)
    walker.home_building = far.building_id  # reachable in menu despite distance
    world = make_world(citizens=[walker], buildings=[far])

    menu = legal_actions(world, "walker")
    goto = next(e for e in menu if e["action"] == "goto"
                and e["to_building"] == "warehouse_1")
    assert goto["hours"] == 2

    world, events = apply_intentions_and_tick(
        world, [Intention(citizen="walker", action=dict(goto), why="Je rentre chez moi.")])
    assert world.citizens["walker"].travel is not None       # still walking
    assert not any(e.type == "arrived" for e in events)

    world, events = apply_intentions_and_tick(world, [])
    assert world.tick == 2                                    # arrival on hour 2
    assert any(e.type == "arrived" for e in events)
    assert world.citizens["walker"].travel is None
    assert world.citizens["walker"].position == far.position


# --------------------------------------------------------------------------
# 3. Capacity refuses surplus
# --------------------------------------------------------------------------

def test_storage_capacity_blocks_production_overflow():
    # Load 3 (flour 2 + water 1); recipe net +3 (6 bread - 3 inputs); capacity 5
    # => completing would need 6 slots: the law must refuse, losing nothing.
    bakery = make_bakery(stock={"flour": 2, "water": 1}, capacity=5)
    worker = CitizenState(username="worker", position=pos(0), ducats=0, hunger=0,
                          work_building="bakery_1")
    world = make_world(citizens=[worker], buildings=[bakery])
    initial = copy.deepcopy(world)

    world, events = apply_intentions_and_tick(
        world, [Intention(citizen="worker", action={"action": "work"}, why="Au four.")])
    assert any(e.type == "production_failed" and e.data["reason"] == "storage_full"
               for e in events)
    assert world.buildings["bakery_1"].stock == {"flour": 2, "water": 1}  # intact
    assert_conservation(initial, world, events)


def test_delivery_deposits_only_up_to_capacity_and_keeps_leftover():
    # A porter arrives with 5 bread at a warehouse with room for only 2.
    warehouse = make_warehouse(meters_north=0, stock={"timber": 48}, capacity=50)
    porter = CitizenState(
        username="porter", position=pos(1000), ducats=0, hunger=0,
        carrying={"bread": 5},
        travel={"to": warehouse.position, "to_building": "warehouse_1",
                "minutes_left": 60,
                "deliver": {"building": "warehouse_1", "resource": "bread",
                            "count": 5, "pay": 10}},
    )
    world = make_world(citizens=[porter], buildings=[warehouse])
    initial = copy.deepcopy(world)

    world, events = apply_intentions_and_tick(world, [])
    delivered = next(e for e in events if e.type == "delivered")
    assert delivered.data["count"] == 2
    assert delivered.data["leftover"] == 3
    wh = world.buildings["warehouse_1"]
    assert sum(wh.stock.values()) == wh.storage_capacity == 50
    assert world.citizens["porter"].carrying["bread"] == 3   # nothing vanished
    assert_conservation(initial, world, events)


# --------------------------------------------------------------------------
# 4. Bread rots at the lawful rate
# --------------------------------------------------------------------------

def test_bread_rots_at_the_correct_deterministic_rate():
    shelf = PERISHABLES["bread"]                      # 48 Venice hours
    warehouse = make_warehouse(meters_north=0, stock={"bread": 10, "timber": 5})
    world = make_world(citizens=[], buildings=[warehouse])

    all_events = []
    for _ in range(2 * shelf):                        # 96 ticks => exactly 2 rots
        world, events = apply_intentions_and_tick(world, [])
        all_events.extend(events)

    rots = [e for e in all_events if e.type == "rotted"]
    assert len(rots) == 2
    assert {e.tick for e in rots} == {shelf, 2 * shelf}
    assert world.buildings["warehouse_1"].stock["bread"] == 8
    assert world.buildings["warehouse_1"].stock["timber"] == 5   # timber is eternal


# --------------------------------------------------------------------------
# 5. A starving citizen eats what he carries
# --------------------------------------------------------------------------

def test_hungry_citizen_automatically_eats_carried_food():
    eater = CitizenState(username="eater", position=pos(0), ducats=0,
                         hunger=HUNGER_EAT_THRESHOLD - 1, carrying={"bread": 2})
    world = make_world(citizens=[eater], buildings=[])
    initial = copy.deepcopy(world)

    world, events = apply_intentions_and_tick(world, [])   # hunger hits 12
    ate = [e for e in events if e.type == "ate"]
    assert len(ate) == 1 and ate[0].subject == "eater"
    assert world.citizens["eater"].hunger == 0
    assert world.citizens["eater"].carrying == {"bread": 1}
    assert_conservation(initial, world, events)


# --------------------------------------------------------------------------
# 6. An illegal intention is refused with an Event
# --------------------------------------------------------------------------

def test_illegal_intentions_are_refused_with_events():
    citizen = CitizenState(username="dreamer", position=pos(0), ducats=0, hunger=0)
    world = make_world(citizens=[citizen], buildings=[make_bakery(stock={"bread": 4})])
    initial = copy.deepcopy(world)

    world, events = apply_intentions_and_tick(world, [
        # Eating with empty hands: not in the legal menu.
        Intention(citizen="dreamer", action={"action": "eat"}, why="J'ai faim."),
        # Going to a building that does not exist.
        Intention(citizen="dreamer", action={"action": "goto", "to_building": "atlantis"},
                  why="Je pars pour l'Atlantide."),
        # An unknown citizen acting.
        Intention(citizen="ghost", action={"action": "rest"}, why="Je hante."),
    ])
    refused = [e for e in events if e.type == "refused"]
    assert len(refused) == 3
    assert {e.data["reason"] for e in refused} == {"not_in_legal_menu", "unknown_citizen"}
    assert world.citizens["dreamer"].travel is None
    assert_conservation(initial, world, events)


def test_buy_food_over_the_legal_maximum_is_refused():
    buyer = CitizenState(username="buyer", position=pos(0), ducats=1000, hunger=0)
    world = make_world(citizens=[buyer], buildings=[make_bakery(stock={"bread": 4})])

    menu = legal_actions(world, "buyer")
    offer = next(e for e in menu if e["action"] == "buy_food")
    assert offer["max_count"] == 4
    greedy = dict(offer, count=CARRY_CAPACITY + 5)
    world, events = apply_intentions_and_tick(
        world, [Intention(citizen="buyer", action=greedy, why="Tout le pain!")])
    assert any(e.type == "refused" and e.data["reason"] == "count_out_of_bounds"
               for e in events)
    assert world.buildings["bakery_1"].stock["bread"] == 4
