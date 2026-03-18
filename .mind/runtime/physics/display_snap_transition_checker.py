"""Physics display rules for The Snap transition.

Doc: docs/physics/algorithms/ALGORITHM_Physics_Energy_Mechanics_And_Link_Semantics.md
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import FrozenSet, Optional, Sequence, Set

DEFAULT_PLAYER_IDS: FrozenSet[str] = frozenset({'player'})
DEFAULT_COMPANIONS: FrozenSet[str] = frozenset()


class SnapPhase(Enum):
    RUNNING = 'running'
    BEAT = 'beat'
    ARRIVAL = 'arrival'


@dataclass
class SnapMomentContext:
    weight: float = 0.8
    type: str = 'narration'
    action: Optional[str] = None
    references: Set[str] = field(default_factory=set)
    importance: float = 0.0
    dramatic_pressure: float = 0.0
    choices: int = 0
    witnessed_by_player: bool = False
    threatens: Set[str] = field(default_factory=set)


@dataclass
class SnapPhaseRecord:
    phase: SnapPhase
    duration: float
    description: str
    visual_hint: str


@dataclass
class SnapDisplayState:
    speed: str = '3x'

    def set_speed(self, new_speed: str) -> None:
        self.speed = new_speed


def is_interrupt(
    moment: SnapMomentContext,
    player_ids: Optional[Set[str]] = None,
    companion_ids: Optional[Set[str]] = None,
) -> bool:
    player_ids = player_ids or DEFAULT_PLAYER_IDS
    companion_ids = companion_ids or DEFAULT_COMPANIONS

    if moment.references & player_ids:
        return True

    if moment.action == 'attack':
        return True

    if moment.importance > 0.7:
        return True

    if moment.dramatic_pressure > 0.9:
        return True

    if moment.choices >= 2:
        return True

    if moment.witnessed_by_player:
        return True

    if moment.threatens & (player_ids | companion_ids):
        return True

    return False


def should_display(
    moment: SnapMomentContext,
    speed: str,
    player_ids: Optional[Set[str]] = None,
    companion_ids: Optional[Set[str]] = None,
) -> bool:
    if speed == '1x':
        return True

    if speed == '2x':
        if moment.type == 'dialogue':
            return True
        return moment.weight >= 0.4

    if speed == '3x':
        return is_interrupt(moment, player_ids, companion_ids)

    return True


def execute_snap(
    moment: SnapMomentContext,
    state: SnapDisplayState,
    player_ids: Optional[Set[str]] = None,
    companion_ids: Optional[Set[str]] = None,
    beat_duration: float = 0.4,
) -> Sequence[SnapPhaseRecord]:
    if not is_interrupt(moment, player_ids, companion_ids):
        raise ValueError('The Snap only triggers for interrupting moments')

    phases = [
        SnapPhaseRecord(
            phase=SnapPhase.RUNNING,
            duration=0.0,
            description='Blurred 3x running: motion, muted colors, streaming text.',
            visual_hint='motion-blur',
        ),
        SnapPhaseRecord(
            phase=SnapPhase.BEAT,
            duration=beat_duration,
            description='Beat pause: screen freezes, silence, nothing displays.',
            visual_hint='freeze-pause',
        ),
        SnapPhaseRecord(
            phase=SnapPhase.ARRIVAL,
            duration=0.0,
            description='Arrival: 1x, full clarity, centered interrupt moment.',
            visual_hint='vivid-focus',
        ),
    ]

    state.set_speed('1x')
    return phases
