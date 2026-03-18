"""
PRIMES lag and half-life decay mechanism.

Implements M2 from MECHANISMS v0:
- Lag gate before influence
- Half-life decay after lag
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, List, Mapping, Sequence


def clamp(value: float, low: float, high: float) -> float:
    if value < low:
        return low
    if value > high:
        return high
    return value


@dataclass(frozen=True)
class PrimeLink:
    link_id: str
    source_id: str
    target_id: str
    strength: float
    lag_ticks: int
    half_life_ticks: float
    intent_tags: Sequence[str]
    source_tick_created: int


@dataclass(frozen=True)
class PrimeDecayContext:
    current_tick: int
    half_life_floor: float
    strength_min: float
    strength_max: float


@dataclass(frozen=True)
class PrimeContribution:
    link_id: str
    source_id: str
    target_id: str
    strength: float
    lag_ticks: int
    half_life_ticks: float
    age_ticks: int
    effect: float
    intent_tags: Sequence[str]


def compute_prime_effect(link: PrimeLink, ctx: PrimeDecayContext) -> PrimeContribution:
    age = ctx.current_tick - link.source_tick_created
    if age < link.lag_ticks:
        return PrimeContribution(
            link_id=link.link_id,
            source_id=link.source_id,
            target_id=link.target_id,
            strength=link.strength,
            lag_ticks=link.lag_ticks,
            half_life_ticks=link.half_life_ticks,
            age_ticks=age,
            effect=0.0,
            intent_tags=link.intent_tags,
        )

    half_life = max(link.half_life_ticks, ctx.half_life_floor)
    decay_power = -((age - link.lag_ticks) / half_life)
    decay = pow(2.0, decay_power)
    strength = clamp(link.strength, ctx.strength_min, ctx.strength_max)
    effect = clamp(strength * decay, 0.0, strength)

    return PrimeContribution(
        link_id=link.link_id,
        source_id=link.source_id,
        target_id=link.target_id,
        strength=link.strength,
        lag_ticks=link.lag_ticks,
        half_life_ticks=link.half_life_ticks,
        age_ticks=age,
        effect=effect,
        intent_tags=link.intent_tags,
    )


def compute_prime_contributions(
    links: Iterable[PrimeLink],
    ctx: PrimeDecayContext,
) -> List[PrimeContribution]:
    return [compute_prime_effect(link, ctx) for link in links]
