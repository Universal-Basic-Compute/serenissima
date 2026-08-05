"""Load the physical WorldState from the real sources of truth.

*Venice*: at dawn the census-takers of the Doge walk every calle, counting
souls, sacks of flour and standing stones, so the day's laws apply to what
truly exists — never to imagined riches.
Substrate: reads Airtable (CITIZENS, BUILDINGS, RESOURCES) and the on-disk
building type definitions (data/buildings/*.json), producing one WorldState.
Read-only: this module NEVER writes to Airtable.

Fail-loud policy:
- Missing .env keys -> KeyError (crash).
- Citizen without a parseable Position -> excluded with a printed warning.
- Building type without a JSON definition -> loaded with 0 capacity/recipes,
  printed warning (the stone exists even if the guild lost its blueprint).
- Resource stacks pointing at unknown assets -> counted and reported, skipped.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Optional

from dotenv import load_dotenv
from pyairtable import Api

from backend.physics.engine_contracts_and_types import (
    BuildingState,
    CitizenState,
    Position,
    WorldState,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
BUILDING_DEFS_DIR = REPO_ROOT / "data" / "buildings"

# The engine starts its clock at dawn; hunger=6 because nobody has eaten
# since the city woke.
INITIAL_VENICE_HOUR = 6
INITIAL_HUNGER = 6


# ------------------------------------------------------------------ parsing

def parse_position_json(raw: Any) -> Optional[Position]:
    """Parse an Airtable Position value like '{"lat": 45.43, "lng": 12.33}'.

    Returns None when the value is absent or malformed — callers decide
    whether that is fatal (buildings) or an exclusion (citizens).
    """
    if not raw:
        return None
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except (json.JSONDecodeError, ValueError):
            return None
    if not isinstance(raw, dict):
        return None
    lat, lng = raw.get("lat"), raw.get("lng")
    if not isinstance(lat, (int, float)) or not isinstance(lng, (int, float)):
        return None
    return (float(lat), float(lng))


def load_building_type_definitions() -> dict[str, dict[str, Any]]:
    """Read every data/buildings/<type>.json into a lookup by type name.

    Returns {type: {"storage_capacity": int, "recipes": [...], "sells": [...]}}.
    """
    if not BUILDING_DEFS_DIR.is_dir():
        raise FileNotFoundError(f"Building definitions directory missing: {BUILDING_DEFS_DIR}")
    defs: dict[str, dict[str, Any]] = {}
    for path in sorted(BUILDING_DEFS_DIR.glob("*.json")):
        with open(path, encoding="utf-8") as f:
            raw = json.load(f)
        prod = raw.get("productionInformation") or {}
        recipes = []
        for arti in prod.get("Arti") or []:
            # Normalize quantities to integers (contract: integer economy).
            recipes.append({
                "inputs": {r: int(q) for r, q in (arti.get("inputs") or {}).items()},
                "outputs": {r: int(q) for r, q in (arti.get("outputs") or {}).items()},
                "craftMinutes": int(arti.get("craftMinutes", 60)),
            })
        defs[path.stem] = {
            "storage_capacity": int(prod.get("storageCapacity", 0)),
            "recipes": recipes,
            "sells": list(prod.get("sells") or []),
        }
    if not defs:
        raise FileNotFoundError(f"No building definitions found in {BUILDING_DEFS_DIR}")
    return defs


# ------------------------------------------------------------------ airtable

def _airtable_api() -> tuple[Api, str]:
    load_dotenv(REPO_ROOT / ".env")
    api_key = os.environ["AIRTABLE_API_KEY"]        # KeyError = fail loud
    base_id = os.environ["AIRTABLE_BASE_ID"]
    return Api(api_key), base_id


def load_world() -> WorldState:
    """Assemble the full WorldState from Airtable + building definitions."""
    api, base_id = _airtable_api()
    type_defs = load_building_type_definitions()

    # ---- buildings -------------------------------------------------------
    buildings: dict[str, BuildingState] = {}
    missing_type_defs: set[str] = set()
    for rec in api.table(base_id, "BUILDINGS").all():
        f = rec["fields"]
        building_id = f.get("BuildingId")
        btype = f.get("Type")
        if not building_id or not btype:
            print(f"WARNING [loader]: building record {rec['id']} lacks BuildingId/Type — skipped")
            continue
        position = parse_position_json(f.get("Position"))
        if position is None:
            print(f"WARNING [loader]: building {building_id} has no valid Position — skipped")
            continue
        tdef = type_defs.get(btype)
        if tdef is None:
            missing_type_defs.add(btype)
            tdef = {"storage_capacity": 0, "recipes": [], "sells": []}
        buildings[building_id] = BuildingState(
            building_id=building_id,
            type=btype,
            position=position,
            category=str(f.get("Category", "")),
            storage_capacity=tdef["storage_capacity"],
            stock={},
            recipes=tdef["recipes"],
            active_production=None,
            run_by=f.get("RunBy"),
        )
    for btype in sorted(missing_type_defs):
        print(f"WARNING [loader]: no data/buildings/{btype}.json — capacity 0, no recipes")

    # ---- citizens (AI, in Venice) ---------------------------------------
    citizens: dict[str, CitizenState] = {}
    citizen_rows = api.table(base_id, "CITIZENS").all(
        formula="AND({IsAI}=1, {InVenice}=1)",
        fields=["Username", "Ducats", "Position"],
    )
    for rec in citizen_rows:
        f = rec["fields"]
        username = f.get("Username")
        if not username:
            print(f"WARNING [loader]: citizen record {rec['id']} has no Username — excluded")
            continue
        position = parse_position_json(f.get("Position"))
        if position is None:
            print(f"WARNING [loader]: citizen {username} has no valid Position — excluded "
                  f"(raw={f.get('Position')!r})")
            continue
        citizens[username] = CitizenState(
            username=username,
            position=position,
            ducats=int(f.get("Ducats", 0)),
            hunger=INITIAL_HUNGER,
            carrying={},
            travel=None,
            home_building=None,
            work_building=None,
        )

    # ---- home/work assignment from building occupants -------------------
    # In the Airtable schema, a building's Occupant is the citizen living
    # there (category=home) or employed there (category=business).
    for rec in api.table(base_id, "BUILDINGS").all(fields=["BuildingId", "Category", "Occupant"]):
        f = rec["fields"]
        occupant, building_id = f.get("Occupant"), f.get("BuildingId")
        if not occupant or building_id not in buildings or occupant not in citizens:
            continue
        if f.get("Category") == "home":
            citizens[occupant].home_building = building_id
        elif f.get("Category") == "business":
            citizens[occupant].work_building = building_id

    # ---- resource stacks -------------------------------------------------
    skipped_unknown_asset = 0
    skipped_non_physical = 0
    for rec in api.table(base_id, "RESOURCES").all(
        fields=["Type", "Count", "Asset", "AssetType"]
    ):
        f = rec["fields"]
        rtype, asset, asset_type = f.get("Type"), f.get("Asset"), f.get("AssetType")
        count = int(f.get("Count", 0))
        if not rtype or not asset or count <= 0:
            continue
        if asset_type == "building":
            if asset not in buildings:
                skipped_unknown_asset += 1
                continue
            stock = buildings[asset].stock
            stock[rtype] = stock.get(rtype, 0) + count
        elif asset_type == "citizen":
            if asset not in citizens:
                # Mostly human citizens or AI citizens outside Venice — out of
                # scope for this engine, counted for transparency.
                skipped_unknown_asset += 1
                continue
            carrying = citizens[asset].carrying
            carrying[rtype] = carrying.get(rtype, 0) + count
        else:
            # e.g. AssetType == "wearable": worn items are not part of the
            # tradeable economy simulated here.
            skipped_non_physical += 1
    if skipped_unknown_asset:
        print(f"WARNING [loader]: {skipped_unknown_asset} resource stacks attached to assets "
              f"outside the simulated world (human citizens, unknown buildings) — skipped")
    if skipped_non_physical:
        print(f"WARNING [loader]: {skipped_non_physical} non-physical stacks (wearables) — skipped")

    world = WorldState(
        tick=0,
        venice_hour=INITIAL_VENICE_HOUR,
        citizens=citizens,
        buildings=buildings,
    )
    print(f"[loader] world loaded: {len(citizens)} citizens, {len(buildings)} buildings, "
          f"{sum(sum(b.stock.values()) for b in buildings.values())} units in buildings, "
          f"{sum(sum(c.carrying.values()) for c in citizens.values())} units carried")
    return world
