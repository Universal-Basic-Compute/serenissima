"""
Attention split mechanism (sink mass distribution).

Implements M1 from MECHANISMS v0:
- Build sink mass from focus + link axes + visibility
- Softmax split of player attention budget
- Blend moment energy toward allocations
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Dict, Iterable, List, Mapping, Sequence, Tuple


def clamp(value: float, low: float, high: float) -> float:
    if value < low:
        return low
    if value > high:
        return high
    return value


def softmax(values: Sequence[float], temperature: float, epsilon: float) -> List[float]:
    temp = max(temperature, epsilon)
    scaled = [v / temp for v in values]
    max_scaled = max(scaled) if scaled else 0.0
    exp_values = [pow(2.718281828459045, v - max_scaled) for v in scaled]
    total = sum(exp_values)
    if total <= epsilon:
        return [0.0 for _ in values]
    return [v / total for v in exp_values]


def blend(prev: float, target: float, inertia: float) -> float:
    return prev * inertia + target * (1.0 - inertia)


@dataclass(frozen=True)
class AttentionSplitContext:
    attention_temp: float
    attention_scale: Callable[[str, str], float]
    energy_inertia: float
    sink_mass_min: float
    sink_mass_max: float
    softmax_epsilon: float
    role_weight: Callable[[str], float]
    mode_weight: Callable[[str], float]
    status_weight: Callable[[str], float]


@dataclass(frozen=True)
class IncomingAxisLink:
    strength: float
    role: str
    mode: str


@dataclass(frozen=True)
class AttentionSink:
    sink_id: str
    sink_type: str
    focus: float
    status: str
    energy: float
    visibility: float
    incoming_links: Sequence[IncomingAxisLink]


@dataclass(frozen=True)
class AttentionSplitResult:
    attention_budget: float
    masses: Mapping[str, float]
    shares: Mapping[str, float]
    allocations: Mapping[str, float]
    moment_energy_next: Mapping[str, float]
    narrative_salience: Mapping[str, float]


def compute_sink_mass(
    sink: AttentionSink,
    ctx: AttentionSplitContext,
) -> float:
    if sink.sink_type == "narrative":
        focus_term = sink.focus
    else:
        focus_term = 1.0 + ctx.status_weight(sink.status)

    link_term = 0.0
    for link in sink.incoming_links:
        link_term += link.strength * ctx.role_weight(link.role) * ctx.mode_weight(link.mode)

    vis_term = clamp(sink.visibility, 0.0, 1.0)
    mass = focus_term * link_term * vis_term
    return clamp(mass, ctx.sink_mass_min, ctx.sink_mass_max)


def apply_attention_split(
    player_id: str,
    place_id: str,
    attention_budget: float,
    sinks: Sequence[AttentionSink],
    ctx: AttentionSplitContext,
) -> AttentionSplitResult:
    if attention_budget <= 0.0 or not sinks:
        return AttentionSplitResult(
            attention_budget=0.0,
            masses={},
            shares={},
            allocations={},
            moment_energy_next={},
            narrative_salience={},
        )

    scaled_budget = attention_budget * ctx.attention_scale(player_id, place_id)
    masses: Dict[str, float] = {}
    for sink in sinks:
        masses[sink.sink_id] = compute_sink_mass(sink, ctx)

    shares_list = softmax(list(masses.values()), ctx.attention_temp, ctx.softmax_epsilon)
    allocations: Dict[str, float] = {}
    for sink_id, share in zip(masses.keys(), shares_list):
        allocations[sink_id] = scaled_budget * share

    moment_energy_next: Dict[str, float] = {}
    narrative_salience: Dict[str, float] = {}
    for sink in sinks:
        alloc = allocations.get(sink.sink_id, 0.0)
        if sink.sink_type == "moment":
            moment_energy_next[sink.sink_id] = blend(sink.energy, alloc, ctx.energy_inertia)
        else:
            narrative_salience[sink.sink_id] = alloc

    return AttentionSplitResult(
        attention_budget=scaled_budget,
        masses=masses,
        shares=allocations and {sid: allocations[sid] / scaled_budget for sid in allocations} or {},
        allocations=allocations,
        moment_energy_next=moment_energy_next,
        narrative_salience=narrative_salience,
    )
