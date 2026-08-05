"""Tests of the diff-based Airtable position writer on synthetic worlds.

*Venice*: a scribe's rehearsal — paper citizens stroll a paper city while the
census-taker practices inking only the names of those who actually moved.
Substrate: CitizenPositionLiveWriter with its Airtable table swapped for a
recording fake, zero network. Run:
backend/venv/Scripts/python.exe -m pytest tests/physics/test_citizen_position_live_writer.py -v
"""
from __future__ import annotations

import json

import pytest

from backend.physics.airtable_citizen_position_live_writer import (
    CitizenPositionLiveWriter,
    snapshot_positions,
)
from backend.physics.engine_contracts_and_types import CitizenState, WorldState


class RecordingFakeTable:
    """Stands in for pyairtable Table; records batch_update payloads."""

    def __init__(self):
        self.batches: list[list[dict]] = []

    def batch_update(self, updates):
        self.batches.append(updates)


def make_world(positions: dict[str, tuple[float, float]]) -> WorldState:
    citizens = {
        username: CitizenState(username=username, position=position, ducats=0)
        for username, position in positions.items()
    }
    return WorldState(tick=0, venice_hour=6, citizens=citizens, buildings={})


def make_writer(record_ids: dict[str, str]) -> tuple[CitizenPositionLiveWriter, RecordingFakeTable]:
    writer = CitizenPositionLiveWriter.__new__(CitizenPositionLiveWriter)
    fake = RecordingFakeTable()
    writer._table = fake
    writer._record_ids = record_ids
    return writer, fake


def test_only_moved_citizens_are_written():
    world = make_world({"anna": (45.43, 12.33), "berto": (45.44, 12.34)})
    baseline = snapshot_positions(world)
    writer, fake = make_writer({"anna": "recA", "berto": "recB"})

    world.citizens["anna"].position = (45.4310, 12.3315)
    written = writer.persist_changed_positions(world, baseline)

    assert written == 1
    assert len(fake.batches) == 1
    (update,) = fake.batches[0]
    assert update["id"] == "recA"
    assert json.loads(update["fields"]["Position"]) == {"lat": 45.4310, "lng": 12.3315}


def test_no_moves_writes_nothing():
    world = make_world({"anna": (45.43, 12.33)})
    baseline = snapshot_positions(world)
    writer, fake = make_writer({"anna": "recA"})

    assert writer.persist_changed_positions(world, baseline) == 0
    assert fake.batches == []


def test_baseline_advances_so_second_call_is_idempotent():
    world = make_world({"anna": (45.43, 12.33)})
    baseline = snapshot_positions(world)
    writer, fake = make_writer({"anna": "recA"})

    world.citizens["anna"].position = (45.4310, 12.3315)
    assert writer.persist_changed_positions(world, baseline) == 1
    assert writer.persist_changed_positions(world, baseline) == 0
    assert len(fake.batches) == 1


def test_moved_citizen_without_record_fails_loud():
    world = make_world({"ghost": (45.43, 12.33)})
    baseline = snapshot_positions(world)
    writer, _ = make_writer({})

    world.citizens["ghost"].position = (45.4310, 12.3315)
    with pytest.raises(KeyError):
        writer.persist_changed_positions(world, baseline)
