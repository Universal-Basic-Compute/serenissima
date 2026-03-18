"""
Contradiction pressure mechanism (negative polarity).

Implements M3 from MECHANISMS v0:
- Aggregate negative polarity edges in neighborhood
- Convert to bounded dramatic pressure
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, List, Sequence


def clamp(value: float, low: float, high: float) -> float:
    if value < low:
        return low
    if value > high:
        return high
    return value


@dataclass(frozen=True)
class ContradictionEdge:
    edge_id: str
    source_id: str
    target_id: str
    polarity: float
    strength: float
    confidence: float


@dataclass(frozen=True)
class ContradictionPressureContext:
    contradiction_gain: float
    pressure_decay: float
    pressure_min: float
    pressure_max: float


@dataclass(frozen=True)
class ContradictionContribution:
    edge_id: str
    source_id: str
    target_id: str
    polarity: float
    strength: float
    confidence: float
    pressure: float


@dataclass(frozen=True)
class ContradictionPressureResult:
    pressure: float
    pressure_next: float
    contributions: Sequence[ContradictionContribution]


def compute_contradiction_pressure(
    edges: Iterable[ContradictionEdge],
    ctx: ContradictionPressureContext,
    previous_pressure: float,
) -> ContradictionPressureResult:
    contributions: List[ContradictionContribution] = []
    total_pressure = 0.0
    for edge in edges:
        if edge.polarity >= 0.0:
            continue
        edge_pressure = (-edge.polarity) * edge.strength * edge.confidence
        contributions.append(
            ContradictionContribution(
                edge_id=edge.edge_id,
                source_id=edge.source_id,
                target_id=edge.target_id,
                polarity=edge.polarity,
                strength=edge.strength,
                confidence=edge.confidence,
                pressure=edge_pressure,
            )
        )
        total_pressure += edge_pressure

    pressure = clamp(ctx.contradiction_gain * total_pressure, ctx.pressure_min, ctx.pressure_max)
    pressure_next = max(0.0, previous_pressure * ctx.pressure_decay + pressure)

    return ContradictionPressureResult(
        pressure=pressure,
        pressure_next=pressure_next,
        contributions=contributions,
    )
