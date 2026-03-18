from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, List, Mapping, Sequence, Dict


@dataclass(frozen=True)
class DisplaySnapshot:
    """Describes a render snapshot during a speed transition."""

    speed: str
    visual_style: str
    text_flow: str
    silence_ms: int = 0
    moment_id: str = ""


@dataclass
class SnapCheckResult:
    is_valid: bool
    reasons: List[str]


@dataclass
class ClusterEnergySummary:
    cluster_id: str
    total_energy: float
    node_count: int

    @property
    def average_energy(self) -> float:
        if self.node_count == 0:
            return 0.0
        return self.total_energy / self.node_count


def validate_snap_transition(frames: Sequence[DisplaySnapshot]) -> SnapCheckResult:
    """Ensure "The Snap" transition follows the documented visual phases."""
    reasons: List[str] = []

    if len(frames) < 3:
        return SnapCheckResult(False, ["Sequence too short for a snap"])  # pragma: no cover

    first, middle, last = frames[0], next((f for f in frames if f.silence_ms > 0), None), frames[-1]

    if first.speed != "3x" or "blur" not in first.visual_style.lower():
        reasons.append("Phase 1 should run at 3x with blur style")

    if first.text_flow.lower() != "streaming":
        reasons.append("Phase 1 text flow should be streaming")

    if not middle:
        reasons.append("Phase 2 (the beat) must include a silence interval")
    else:
        if not (300 <= middle.silence_ms <= 500):
            reasons.append("Phase 2 silence should last 300-500ms")
        if "freeze" not in middle.visual_style.lower():
            reasons.append("Phase 2 should display the freeze state")

    if last.speed != "1x" or "full" not in last.visual_style.lower():
        reasons.append("Phase 3 must land at 1x with full visual clarity")

    if last.text_flow.lower() not in {"static", "centered", "full"}:
        reasons.append("Phase 3 text should stop streaming and center")

    return SnapCheckResult(is_valid=not reasons, reasons=reasons)


def summarize_cluster_energy(nodes: Iterable[Mapping[str, object]]) -> Dict[str, ClusterEnergySummary]:
    """Aggregate energy statistics for each identified cluster."""
    clusters: Dict[str, ClusterEnergySummary] = {}
    for node in nodes:
        cluster_id = node.get("cluster_id") or node.get("cluster") or "default"
        energy = float(node.get("energy", 0.0)) if node.get("energy") is not None else 0.0
        summary = clusters.setdefault(cluster_id, ClusterEnergySummary(cluster_id=cluster_id, total_energy=0.0, node_count=0))
        summary.total_energy += energy
        summary.node_count += 1
    return clusters


def detect_cluster_surges(
    clusters: Mapping[str, ClusterEnergySummary],
    surge_multiplier: float = 2.0
) -> List[str]:
    """Report clusters whose energy exceeds the fleet average by the multiplier."""
    if not clusters:
        return []

    total = sum(summary.total_energy for summary in clusters.values())
    average = total / len(clusters)
    threshold = average * surge_multiplier

    return [cluster_id for cluster_id, summary in clusters.items() if summary.total_energy > threshold]
