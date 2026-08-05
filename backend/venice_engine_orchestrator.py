"""Venice Engine Orchestrator — wires the Physics layer to the Minds layer.

*Venice*: the great clockwork under the Doge's Palace — each hour it wakes a
handful of citizens, whispers their choices to the laws of the city, and the
laws answer with events carved into the day.
Substrate: per tick — pick thinkers (round-robin), build legal menus (pure),
ask Ollama qwen3-vl:2b-instruct for one Intention each, then hand everything
to apply_intentions_and_tick(). Dry-run by default; --live-thoughts writes the
citizens' "why" sentences to Airtable MESSAGES as thought_log records.

Usage:
  backend/venv/Scripts/python.exe -m backend.venice_engine_orchestrator --ticks 3
  backend/venv/Scripts/python.exe -m backend.venice_engine_orchestrator --ticks 1 --thinkers 5 --live-thoughts
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.physics.engine_contracts_and_types import Intention, WorldState
from backend.physics.world_state_loader import load_world
from backend.physics.laws_of_conservation_and_transport import apply_intentions_and_tick, legal_actions
from backend.minds.ollama_citizen_mind import decide, preload_model
from backend.minds.mind_round_scheduler import pick_thinkers


def load_personas() -> dict[str, dict]:
    """Compact personas for the minds, straight from Airtable CITIZENS."""
    import urllib.request
    import urllib.parse
    from dotenv import dotenv_values

    env = dotenv_values(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))
    key, base = env["AIRTABLE_API_KEY"], env["AIRTABLE_BASE_ID"]
    personas: dict[str, dict] = {}
    offset = None
    while True:
        params = {"pageSize": 100, "filterByFormula": "AND({IsAI}=1,{InVenice}=1)"}
        if offset:
            params["offset"] = offset
        url = f"https://api.airtable.com/v0/{base}/CITIZENS?" + urllib.parse.urlencode(params)
        req = urllib.request.Request(url, headers={"Authorization": f"Bearer {key}"})
        data = json.load(urllib.request.urlopen(req, timeout=60))
        for rec in data.get("records", []):
            f = rec["fields"]
            u = f.get("Username")
            if not u:
                continue
            personas[u] = {
                "name": f"{f.get('FirstName', '')} {f.get('LastName', '')}".strip() or u,
                "social_class": f.get("SocialClass", "Popolani"),
                "personality": str(f.get("CorePersonality", ""))[:200],
            }
        offset = data.get("offset")
        if not offset:
            return personas


def push_thoughts(intentions: list[Intention]) -> int:
    """Write each mind's 'why' to Airtable MESSAGES as a thought_log."""
    import urllib.request
    from dotenv import dotenv_values

    env = dotenv_values(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))
    key, base = env["AIRTABLE_API_KEY"], env["AIRTABLE_BASE_ID"]
    records = [
        {"fields": {"Sender": i.citizen, "Receiver": i.citizen, "Content": i.why, "Type": "thought_log"}}
        for i in intentions if i.why
    ]
    written = 0
    for start in range(0, len(records), 10):
        body = json.dumps({"records": records[start:start + 10]}).encode()
        req = urllib.request.Request(
            f"https://api.airtable.com/v0/{base}/MESSAGES", data=body, method="POST",
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        )
        written += len(json.load(urllib.request.urlopen(req, timeout=60)).get("records", []))
        time.sleep(0.25)
    return written


def run(ticks: int, thinkers_per_tick: int, live_thoughts: bool, live_positions: bool = False) -> None:
    print("⚙️  Chargement du monde…", flush=True)
    world: WorldState = load_world()
    personas = load_personas()
    print(f"   {len(world.citizens)} citoyens · {len(world.buildings)} bâtiments · {len(personas)} personas", flush=True)

    position_writer = None
    position_baseline = None
    if live_positions:
        from backend.physics.airtable_citizen_position_live_writer import (
            CitizenPositionLiveWriter,
            snapshot_positions,
        )
        position_writer = CitizenPositionLiveWriter()
        position_baseline = snapshot_positions(world)

    for _ in range(ticks):
        # qwen3-vl:2b shares a 6 GB GPU with another local service (qwen3:4b) that
        # evicts it; the reload can queue for minutes behind that service's calls.
        preload_model(timeout_seconds=300)
        thinkers = pick_thinkers(world, per_tick=thinkers_per_tick, tick=world.tick)
        intentions: list[Intention] = []
        for username in thinkers:
            citizen = world.citizens.get(username)
            if citizen is None or citizen.travel is not None:
                continue  # absent or mid-journey: the road decides for them
            # Single source of legality: the menu the mind sees IS the menu
            # physics validates against (legal_actions), never a parallel builder.
            menu = legal_actions(world, username)
            persona = personas.get(username, {"name": username, "social_class": "Popolani", "personality": ""})
            t0 = time.time()
            try:
                intention = decide(citizen, menu, persona)
            except Exception as exc:
                # GPU eviction by the other local service can starve one call;
                # one mute citizen must not stop the city. Loud, visible, skipped.
                print(f"🔇 {username}: l'esprit n'a pas répondu ({type(exc).__name__}: {exc}) — il rate son tour", flush=True)
                continue
            intentions.append(intention)
            print(f"🧠 {username}: {intention.action.get('action')} — « {intention.why} » ({time.time()-t0:.1f}s)", flush=True)

        world, events = apply_intentions_and_tick(world, intentions)
        print(f"\n⏱️  Tick {world.tick} (heure vénitienne {world.venice_hour}h) — {len(events)} événements", flush=True)
        for ev in events:
            print(f"   [{ev.type}] {ev.narrative}", flush=True)

        if live_thoughts and intentions:
            n = push_thoughts(intentions)
            print(f"💭 {n} pensées écrites dans Airtable", flush=True)
        if position_writer is not None:
            moved = position_writer.persist_changed_positions(world, position_baseline)
            if moved:
                print(f"🗺️  {moved} positions écrites dans Airtable", flush=True)
        print(flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Venice engine: physics + minds")
    parser.add_argument("--ticks", type=int, default=1)
    parser.add_argument("--thinkers", type=int, default=10, help="citizens who think per tick")
    parser.add_argument("--live-thoughts", action="store_true", help="write thoughts to Airtable MESSAGES")
    parser.add_argument("--live-positions", action="store_true",
                        help="write moved citizens' positions to Airtable CITIZENS")
    args = parser.parse_args()
    run(args.ticks, args.thinkers, args.live_thoughts, args.live_positions)
