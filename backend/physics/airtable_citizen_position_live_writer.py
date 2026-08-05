"""Persist citizen positions from the in-memory WorldState back to Airtable.

*Venice*: the census-takers who counted souls at dawn now walk the calli at
each hour's bell, inking the new whereabouts of every citizen into the
Doge's registers — so the maps of the city show where people truly stand.
Substrate: diff-based writer. Holds a {username: record_id} index of the
CITIZENS table and a last-known-positions snapshot; persist_changed_positions()
PATCHes only citizens whose (lat, lng) moved since the previous call.

Scope (deliberate, see .mind/state/SYNC_Project_State.md):
- Positions ONLY. Ducats and RESOURCES stacks are NOT persisted while the
  economy-v2 escalation is open (buy_food sinks ducats, haul pay is ex nihilo;
  writing those would inject a non-conserved economy into the shared base).

Fail-loud policy:
- A moved citizen without an Airtable record -> KeyError (crash; the world
  and the register must agree before we write anything).
- Airtable API failures propagate (pyairtable raises) — no silent retries.
"""
from __future__ import annotations

import json

from backend.physics.engine_contracts_and_types import Position, WorldState
from backend.physics.world_state_loader import _airtable_api


def snapshot_positions(world: WorldState) -> dict[str, Position]:
    """Capture every citizen's current position — the diff baseline."""
    return {username: citizen.position for username, citizen in world.citizens.items()}


class CitizenPositionLiveWriter:
    """Writes moved citizens' positions to the CITIZENS table, nothing else."""

    def __init__(self) -> None:
        api, base_id = _airtable_api()
        self._table = api.table(base_id, "CITIZENS")
        rows = self._table.all(formula="AND({IsAI}=1, {InVenice}=1)", fields=["Username"])
        self._record_ids: dict[str, str] = {
            row["fields"]["Username"]: row["id"]
            for row in rows if row["fields"].get("Username")
        }

    def persist_changed_positions(self, world: WorldState, baseline: dict[str, Position]) -> int:
        """PATCH every citizen whose position differs from the baseline.

        Mutates the baseline in place so successive calls only write new moves.
        Returns the number of citizens written.
        """
        updates: list[dict] = []
        for username, citizen in world.citizens.items():
            if baseline.get(username) == citizen.position:
                continue
            record_id = self._record_ids.get(username)
            if record_id is None:
                raise KeyError(
                    f"citizen {username} moved but has no Airtable record — "
                    f"world and register disagree, refusing to write"
                )
            lat, lng = citizen.position
            updates.append({
                "id": record_id,
                "fields": {"Position": json.dumps({"lat": lat, "lng": lng})},
            })
            baseline[username] = citizen.position
        if updates:
            self._table.batch_update(updates)
        return len(updates)
