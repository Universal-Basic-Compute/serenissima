"""Demo: three different personas decide on the SAME menu via real Ollama.

*Venice*: three souls stand on the same campo at dawn — a starving porter,
a pious widow, a scheming merchant — and the same herald's list draws three
different answers.
Substrate: builds one menu with action_menu_builder on a synthetic world,
then calls decide() three times against local qwen3-vl:2b-instruct.

Run: backend/venv/Scripts/python.exe backend/minds/demo_three_personas_decide.py
"""
from __future__ import annotations

import sys

sys.stdout.reconfigure(encoding="utf-8")

from backend.minds.action_menu_builder import build_menu
from backend.minds.ollama_citizen_mind import decide, preload_model
from backend.physics.engine_contracts_and_types import (
    BuildingState,
    CitizenState,
    WorldState,
)

BASE = (45.4300, 12.3300)


def make_demo_world() -> WorldState:
    citizen = CitizenState(
        username="demo_citizen",
        position=BASE,
        ducats=60,
        hunger=15,  # hungry: past the eat threshold of 12
        carrying={},
        home_building="casa_demo",
        work_building="forge_demo",
    )
    buildings = {
        "forge_demo": BuildingState(
            building_id="forge_demo", type="blacksmith", position=(45.43001, 12.33030),
            category="business", storage_capacity=50, stock={"iron": 8},
            recipes=[{"inputs": {"iron": 2}, "outputs": {"tools": 1}, "craftMinutes": 120}],
        ),
        "boulangerie_demo": BuildingState(
            building_id="boulangerie_demo", type="bakery", position=(45.43040, 12.33000),
            category="business", storage_capacity=100, stock={"bread": 35},
        ),
        "casa_demo": BuildingState(
            building_id="casa_demo", type="canal_house", position=(45.43300, 12.33000),
            category="home", storage_capacity=0,
        ),
        "entrepot_demo": BuildingState(
            building_id="entrepot_demo", type="warehouse", position=(45.43500, 12.33100),
            category="business", storage_capacity=400,
        ),
    }
    return WorldState(tick=0, venice_hour=7, citizens={"demo_citizen": citizen}, buildings=buildings)


PERSONAS = [
    {
        "name": "Bartolo",
        "social_class": "facchino (porteur)",
        "personality": "Ventre vide, tête vide: quand il a faim, il ne pense qu'au pain, le reste attendra.",
    },
    {
        "name": "Contessa Morosini",
        "social_class": "nobildonna",
        "personality": "Hautaine, refuse tout travail manuel; une dame rentre dans son palais ou se repose.",
    },
    {
        "name": "Zanetto",
        "social_class": "mercante",
        "personality": "Avare notoire: il porterait des caisses sous la pluie pour gagner cinq ducats de plus.",
    },
]


def main() -> None:
    print("(préchauffage du modèle 2B...)")
    preload_model()
    world = make_demo_world()
    menu = build_menu(world, "demo_citizen")
    citizen = world.citizens["demo_citizen"]

    print("=== MENU COMMUN (faim 15/24, 60 ducats) ===")
    for i, entry in enumerate(menu, 1):
        print(f"  {i}. {entry['label']}")
    print()

    for persona in PERSONAS:
        intention = decide(citizen, menu, persona)
        print(f"--- {persona['name']} ({persona['social_class']}) ---")
        print(f"  personnalité : {persona['personality']}")
        print(f"  choix        : {intention.action['action']} -> {intention.action.get('label', '')}")
        print(f"  pensée       : « {intention.why} »")
        print()


if __name__ == "__main__":
    main()
