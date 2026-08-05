"""Tests for the Minds layer: action menu builder, Ollama mind, scheduler.

*Venice*: the notary checks the herald's scroll line by line — no illegal
action may ever reach a citizen's ear.
Substrate: pure-function menu tests against a hand-built synthetic world,
mocked-HTTP tests for decide() parsing/retry/fallback, and one real
integration test against local Ollama (skipped if :11434 is unreachable).
"""
from __future__ import annotations

import copy
import json
import math

import pytest
import requests

from backend.minds import action_menu_builder as amb
from backend.minds import ollama_citizen_mind as mind
from backend.minds.action_menu_builder import build_menu
from backend.minds.mind_round_scheduler import pick_thinkers
from backend.minds.ollama_citizen_mind import FALLBACK_WHY, decide
from backend.physics.engine_contracts_and_types import (
    CARRY_CAPACITY,
    BuildingState,
    CitizenState,
    Intention,
    WorldState,
)

# ---------------------------------------------------------------- world tools

BASE = (45.4300, 12.3300)  # somewhere in the lagoon


def pos_at(north_m: float = 0.0, east_m: float = 0.0):
    """Position offset from BASE by meters (good enough at this scale)."""
    lat = BASE[0] + north_m / 111_320.0
    lng = BASE[1] + east_m / (111_320.0 * math.cos(math.radians(BASE[0])))
    return (lat, lng)


def make_building(building_id, btype="warehouse", position=BASE, category="business",
                  capacity=100, stock=None, recipes=None, active_production=None):
    return BuildingState(
        building_id=building_id,
        type=btype,
        position=position,
        category=category,
        storage_capacity=capacity,
        stock=dict(stock or {}),
        recipes=list(recipes or []),
        active_production=active_production,
    )


def make_world():
    """Synthetic Venice: one citizen, five buildings at known distances."""
    marco = CitizenState(
        username="marco",
        position=BASE,
        ducats=100,
        hunger=10,
        carrying={},
        home_building="home_1",
        work_building="work_1",
    )
    buildings = {
        "work_1": make_building(
            "work_1", "blacksmith", pos_at(east_m=30), capacity=5,
            stock={"iron": 5},
            recipes=[{"inputs": {"iron": 1}, "outputs": {"tools": 1}, "craftMinutes": 60}],
        ),
        "bakery_1": make_building(
            "bakery_1", "bakery", pos_at(north_m=50), capacity=100,
            stock={"bread": 30},
        ),
        "home_1": make_building(
            "home_1", "canal_house", pos_at(north_m=400), category="home", capacity=0,
        ),
        "warehouse_1": make_building(
            "warehouse_1", "warehouse", pos_at(north_m=600), capacity=500,
        ),
        "far_1": make_building(
            "far_1", "granary", pos_at(north_m=2000), capacity=500, stock={"grain": 90},
        ),
    }
    return WorldState(tick=0, venice_hour=8, citizens={"marco": marco}, buildings=buildings)


def entries_of(menu, action):
    return [e for e in menu if e["action"] == action]


# ------------------------------------------------------------------ menu: rest

def test_rest_always_present_even_in_empty_world():
    world = WorldState(
        tick=0, venice_hour=0,
        citizens={"solo": CitizenState(username="solo", position=BASE, ducats=0)},
        buildings={},
    )
    menu = build_menu(world, "solo")
    assert menu == [{"action": "rest", "label": "Me reposer ici"}]


def test_rest_present_exactly_once_and_last():
    menu = build_menu(make_world(), "marco")
    rests = entries_of(menu, "rest")
    assert len(rests) == 1
    assert menu[-1]["action"] == "rest"


def test_unknown_citizen_raises():
    with pytest.raises(KeyError):
        build_menu(make_world(), "ghost")


# ------------------------------------------------------------------- menu: eat

def test_eat_absent_without_food():
    menu = build_menu(make_world(), "marco")
    assert entries_of(menu, "eat") == []


def test_eat_present_when_carrying_food():
    world = make_world()
    world.citizens["marco"].carrying = {"bread": 2}
    menu = build_menu(world, "marco")
    assert len(entries_of(menu, "eat")) == 1


def test_eat_absent_when_carrying_only_non_food():
    world = make_world()
    world.citizens["marco"].carrying = {"timber": 5}
    menu = build_menu(world, "marco")
    assert entries_of(menu, "eat") == []


# -------------------------------------------------------------- menu: buy_food

def test_buy_food_offered_with_stock_money_and_proximity():
    menu = build_menu(make_world(), "marco")
    buys = entries_of(menu, "buy_food")
    assert len(buys) == 1
    buy = buys[0]
    assert buy["building"] == "bakery_1"
    assert buy["resource"] == "bread"
    assert buy["price"] == 10
    # min(stock=30, ducats//10=10, carry space=20) == 10
    assert buy["max_count"] == 10


def test_buy_food_absent_without_money():
    world = make_world()
    world.citizens["marco"].ducats = 5  # < 1 unit at 10 ducats
    assert entries_of(build_menu(world, "marco"), "buy_food") == []


def test_buy_food_absent_when_carrying_full():
    world = make_world()
    world.citizens["marco"].carrying = {"timber": CARRY_CAPACITY}
    assert entries_of(build_menu(world, "marco"), "buy_food") == []


def test_buy_food_absent_when_shop_too_far():
    world = make_world()
    world.buildings["bakery_1"].position = pos_at(north_m=200)  # > 100 m
    assert entries_of(build_menu(world, "marco"), "buy_food") == []


def test_buy_food_max_count_limited_by_stock():
    world = make_world()
    world.buildings["bakery_1"].stock = {"bread": 3}
    buys = entries_of(build_menu(world, "marco"), "buy_food")
    assert buys[0]["max_count"] == 3


# ------------------------------------------------------------------ menu: goto

def test_goto_offers_home_and_work_and_nearby():
    menu = build_menu(make_world(), "marco")
    gotos = entries_of(menu, "goto")
    targets = [g["to_building"] for g in gotos]
    assert "home_1" in targets
    assert "work_1" in targets
    assert "bakery_1" in targets       # 50 m, within 500 m
    assert "warehouse_1" not in targets  # 600 m, beyond 500 m
    assert "far_1" not in targets
    for g in gotos:
        assert isinstance(g["hours"], int) and g["hours"] >= 1
        assert isinstance(g["label"], str) and g["label"]


def test_goto_nearby_capped_at_four_and_sorted_by_distance():
    world = make_world()
    world.citizens["marco"].home_building = None
    world.citizens["marco"].work_building = None
    world.buildings = {
        f"b_{d}": make_building(f"b_{d}", "inn", pos_at(north_m=d))
        for d in (450, 100, 300, 50, 200, 400)
    }
    gotos = entries_of(build_menu(world, "marco"), "goto")
    assert [g["to_building"] for g in gotos] == ["b_50", "b_100", "b_200", "b_300"]


# ------------------------------------------------------------------ menu: work

def test_work_offered_at_work_building_with_inputs():
    menu = build_menu(make_world(), "marco")
    assert len(entries_of(menu, "work")) == 1


def test_work_absent_when_too_far():
    world = make_world()
    world.citizens["marco"].position = pos_at(north_m=100)  # > 50 m from work_1
    assert entries_of(build_menu(world, "marco"), "work") == []


def test_work_absent_without_recipe_inputs():
    world = make_world()
    world.buildings["work_1"].stock = {}
    assert entries_of(build_menu(world, "marco"), "work") == []


def test_work_offered_when_production_already_active():
    world = make_world()
    world.buildings["work_1"].stock = {}
    world.buildings["work_1"].active_production = {
        "recipe": {"inputs": {"iron": 1}, "outputs": {"tools": 1}, "craftMinutes": 60},
        "minutes_left": 30,
    }
    assert len(entries_of(build_menu(world, "marco"), "work")) == 1


# ------------------------------------------------------------------ menu: haul

def test_haul_offered_from_surplus_to_free_space():
    menu = build_menu(make_world(), "marco")
    hauls = entries_of(menu, "haul")
    assert len(hauls) == 1
    haul = hauls[0]
    assert haul["from_building"] == "bakery_1"   # 30 bread > 20 surplus threshold
    assert haul["to_building"] == "warehouse_1"  # only building with free space < 800 m
    assert haul["resource"] == "bread"
    assert haul["count"] == 10                   # min(CARRY=20, surplus=10, space=500)
    assert haul["pay"] == 5


def test_haul_absent_without_surplus():
    world = make_world()
    world.buildings["bakery_1"].stock = {"bread": 20}  # not > 20
    assert entries_of(build_menu(world, "marco"), "haul") == []


def test_haul_capped_at_three_proposals():
    world = make_world()
    # No home/work so goto/work entries leave room under the 10-entry cap;
    # timber is not food, so no extra buy_food entries either.
    world.citizens["marco"].home_building = None
    world.citizens["marco"].work_building = None
    for i in range(5):
        world.buildings[f"silo_{i}"] = make_building(
            f"silo_{i}", "lumberyard", pos_at(north_m=60 + i), capacity=200,
            stock={"timber": 80},
        )
    hauls = entries_of(build_menu(world, "marco"), "haul")
    assert len(hauls) == 3


# --------------------------------------------------------- menu: global shape

REQUIRED_KEYS = {
    "goto": {"action", "to_building", "label", "hours"},
    "buy_food": {"action", "building", "resource", "price", "max_count"},
    "eat": {"action"},
    "work": {"action"},
    "haul": {"action", "from_building", "to_building", "resource", "count", "pay"},
    "rest": {"action"},
}


def test_menu_entries_conform_to_contract_shapes():
    world = make_world()
    world.citizens["marco"].carrying = {"bread": 1}
    menu = build_menu(world, "marco")
    assert menu, "menu must not be empty"
    for entry in menu:
        action = entry["action"]
        assert action in REQUIRED_KEYS
        missing = REQUIRED_KEYS[action] - set(entry)
        assert not missing, f"{action} entry missing {missing}"
        for key, value in entry.items():
            if key in ("hours", "max_count", "count", "price", "pay"):
                assert isinstance(value, int), f"{action}.{key} must be int"


def test_menu_capped_at_ten_with_rest_surviving():
    world = make_world()
    world.citizens["marco"].carrying = {"bread": 1}
    for i in range(8):
        world.buildings[f"shop_{i}"] = make_building(
            f"shop_{i}", "market_stall", pos_at(north_m=20 + i, east_m=10),
            capacity=200, stock={"fish": 50, "vegetables": 40},
        )
    menu = build_menu(world, "marco")
    assert len(menu) <= 10
    assert menu[-1]["action"] == "rest"


def test_build_menu_is_pure():
    world = make_world()
    snapshot = copy.deepcopy(world)
    build_menu(world, "marco")
    assert world == snapshot


# ------------------------------------------------------------------- scheduler

def make_crowd(n):
    citizens = {
        f"citizen_{i:03d}": CitizenState(username=f"citizen_{i:03d}", position=BASE, ducats=0)
        for i in range(n)
    }
    return WorldState(tick=0, venice_hour=0, citizens=citizens, buildings={})


def test_scheduler_deterministic():
    world = make_crowd(25)
    assert pick_thinkers(world, per_tick=10, tick=3) == pick_thinkers(world, per_tick=10, tick=3)


def test_scheduler_rotation_covers_everyone():
    world = make_crowd(25)
    seen = set()
    for tick in range(math.ceil(25 / 10)):
        seen.update(pick_thinkers(world, per_tick=10, tick=tick))
    assert seen == set(world.citizens)


def test_scheduler_returns_all_when_few_citizens():
    world = make_crowd(4)
    assert pick_thinkers(world, per_tick=10, tick=7) == sorted(world.citizens)


def test_scheduler_empty_world():
    world = WorldState(tick=0, venice_hour=0, citizens={}, buildings={})
    assert pick_thinkers(world, per_tick=10, tick=0) == []


def test_scheduler_uses_world_tick_by_default():
    world = make_crowd(25)
    world.tick = 2
    assert pick_thinkers(world, per_tick=10) == pick_thinkers(world, per_tick=10, tick=2)


# --------------------------------------------------------------- decide (mock)

SIMPLE_MENU = [
    {"action": "goto", "to_building": "home_1", "label": "Rentrer chez moi", "hours": 1},
    {"action": "buy_food", "building": "bakery_1", "resource": "bread", "price": 10,
     "max_count": 5, "label": "Acheter du pain (10 ducats l'unité, max 5)"},
    {"action": "rest", "label": "Me reposer ici"},
]

PERSONA = {"name": "Marco", "social_class": "Facchino", "personality": "Bourru mais loyal."}


def make_citizen_state():
    return CitizenState(username="marco", position=BASE, ducats=50, hunger=14)


class FakeResponse:
    def __init__(self, content):
        self._content = content

    def raise_for_status(self):
        pass

    def json(self):
        return {"message": {"content": self._content}}


def patch_post(monkeypatch, contents):
    """Patch requests.post inside the mind module; returns list of captured payloads."""
    calls = []
    contents = list(contents)

    def fake_post(url, json=None, timeout=None):
        calls.append({"url": url, "json": json, "timeout": timeout})
        return FakeResponse(contents.pop(0))

    monkeypatch.setattr(mind.requests, "post", fake_post)
    return calls


def test_decide_valid_first_try(monkeypatch):
    calls = patch_post(monkeypatch, ['{"choice": 2, "why": "Mon ventre gronde plus fort que ma bourse."}'])
    intention = decide(make_citizen_state(), SIMPLE_MENU, PERSONA)
    assert isinstance(intention, Intention)
    assert intention.citizen == "marco"
    assert intention.action == SIMPLE_MENU[1]
    assert intention.why == "Mon ventre gronde plus fort que ma bourse."
    assert len(calls) == 1
    payload = calls[0]["json"]
    assert payload["model"] == mind.MODEL_NAME
    assert payload["format"] == "json"
    assert payload["stream"] is False
    assert payload["keep_alive"] == "10m"
    assert calls[0]["timeout"] == 30


def test_decide_retry_after_invalid_json(monkeypatch):
    calls = patch_post(monkeypatch, [
        "je choisis le pain!",  # not JSON
        '{"choice": 1, "why": "Je rentre."}',
    ])
    intention = decide(make_citizen_state(), SIMPLE_MENU, PERSONA)
    assert intention.action == SIMPLE_MENU[0]
    assert len(calls) == 2
    retry_messages = calls[1]["json"]["messages"]
    assert retry_messages[-1]["role"] == "user"
    assert "invalide" in retry_messages[-1]["content"]


def test_decide_retry_after_choice_out_of_range(monkeypatch):
    calls = patch_post(monkeypatch, [
        '{"choice": 9, "why": "Neuf!"}',
        '{"choice": "3", "why": "Je me repose."}',  # str digits accepted
    ])
    intention = decide(make_citizen_state(), SIMPLE_MENU, PERSONA)
    assert intention.action == SIMPLE_MENU[2]
    assert len(calls) == 2


def test_decide_falls_back_to_rest_after_two_failures(monkeypatch, caplog):
    calls = patch_post(monkeypatch, ["gibberish", '{"choice": 42}'])
    with caplog.at_level("ERROR", logger="backend.minds.ollama_citizen_mind"):
        intention = decide(make_citizen_state(), SIMPLE_MENU, PERSONA)
    assert intention.action == SIMPLE_MENU[2]  # the rest entry from the menu
    assert intention.why == FALLBACK_WHY
    assert len(calls) == 2
    assert any("falling back to rest" in rec.message for rec in caplog.records)


def test_decide_network_error_propagates(monkeypatch):
    def exploding_post(url, json=None, timeout=None):
        raise requests.ConnectionError("Ollama down")

    monkeypatch.setattr(mind.requests, "post", exploding_post)
    with pytest.raises(requests.ConnectionError):
        decide(make_citizen_state(), SIMPLE_MENU, PERSONA)


def test_decide_empty_menu_raises():
    with pytest.raises(ValueError):
        decide(make_citizen_state(), [], PERSONA)


# ----------------------------------------------------- decide (real Ollama 2B)

def ollama_reachable_and_warm():
    """True if Ollama answers AND the 2B model is loaded (cold load can
    exceed decide()'s 30 s budget, so we preload with a generous timeout)."""
    try:
        if requests.get("http://localhost:11434/api/tags", timeout=3).status_code != 200:
            return False
        mind.preload_model()
        return True
    except requests.RequestException:
        return False


@pytest.mark.integration
def test_decide_against_real_ollama_model():
    if not ollama_reachable_and_warm():
        pytest.skip("Ollama not reachable on :11434")
    citizen = make_citizen_state()  # hunger 14: hungry, 50 ducats
    try:
        intention = decide(citizen, SIMPLE_MENU, PERSONA)
    except requests.ReadTimeout:
        # Other local models (e.g. qwen3:4b) can evict ours from VRAM between
        # the preload and the call; one re-warm covers that infrastructure
        # race without masking what this test verifies (model output quality).
        mind.preload_model()
        intention = decide(citizen, SIMPLE_MENU, PERSONA)
    assert isinstance(intention, Intention)
    assert intention.citizen == "marco"
    assert intention.action in SIMPLE_MENU
    assert isinstance(intention.why, str) and intention.why.strip()
