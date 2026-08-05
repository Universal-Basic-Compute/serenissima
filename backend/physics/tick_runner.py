"""Run the physics engine for N ticks — dry-run by default.

*Venice*: the great clock of the Piazza turns its bronze hands while the
city breathes without minds — bread ages, stomachs growl, nothing moves
that no one wills. The clockmaster only watches; he touches nothing.
Substrate: CLI entry point. Loads the real world from Airtable (read-only),
advances N ticks with empty intentions (the minds layer plugs in later),
prints events and a conservation audit. NEVER writes to Airtable in dry-run.

Usage:
    backend/venv/Scripts/python.exe -m backend.physics.tick_runner --ticks 3
"""
from __future__ import annotations

import argparse

from backend.physics.laws_of_conservation_and_transport import (
    apply_intentions_and_tick,
    conservation_ledger,
    total_resource_counts,
)
from backend.physics.world_state_loader import load_world


def main() -> None:
    parser = argparse.ArgumentParser(description="Venice physics tick runner (dry-run by default)")
    parser.add_argument("--ticks", type=int, default=3, help="Venice hours to simulate")
    parser.add_argument("--live", action="store_true",
                        help="Write resulting state back to Airtable (NOT IMPLEMENTED)")
    args = parser.parse_args()

    if args.live:
        # Position persistence lives in the orchestrator (--live-positions,
        # backend/physics/airtable_citizen_position_live_writer.py) — this
        # mindless runner has no intentions, so nobody ever moves here and a
        # live mode would write nothing but drift.
        # @mind:escalation — Ducats/RESOURCES persistence stays blocked on
        # economy v2 (buy_food sinks ducats, haul pay is ex nihilo).
        raise NotImplementedError(
            "--live n'existe pas ici ; utilisez backend.venice_engine_orchestrator "
            "--live-positions (les positions), le reste attend l'économie v2."
        )

    world = load_world()
    totals_before = total_resource_counts(world)

    all_events = []
    for _ in range(args.ticks):
        world, events = apply_intentions_and_tick(world, intentions=[])
        all_events.extend(events)
        print(f"\n=== Tick {world.tick} (heure de Venise {world.venice_hour:02d}h) — "
              f"{len(events)} événements ===")
        for e in events:
            print(f"  [{e.type:>18}] {e.narrative}")

    # ---- conservation audit ---------------------------------------------
    totals_after = total_resource_counts(world)
    ledger = conservation_ledger(all_events)
    print(f"\n=== Bilan de conservation sur {args.ticks} ticks ===")
    print(f"{'ressource':<20}{'avant':>8}{'produit':>9}{'consommé':>10}{'pourri':>8}"
          f"{'après':>8}  {'loi'}")
    violations = 0
    for resource in sorted(set(totals_before) | set(totals_after) | set(ledger)):
        before = totals_before.get(resource, 0)
        after = totals_after.get(resource, 0)
        led = ledger.get(resource, {"produced": 0, "consumed": 0, "rotted": 0})
        ok = before + led["produced"] == after + led["consumed"] + led["rotted"]
        if not ok:
            violations += 1
        print(f"{resource:<20}{before:>8}{led['produced']:>9}{led['consumed']:>10}"
              f"{led['rotted']:>8}{after:>8}  {'OK' if ok else 'VIOLATION'}")
    if violations:
        raise AssertionError(f"CONSERVATION VIOLATED for {violations} resource(s) — "
                             f"the laws are broken, fix the physics.")
    print(f"\nConservation respectée pour toutes les ressources. "
          f"(dry-run: rien n'a été écrit dans Airtable)")


if __name__ == "__main__":
    main()
