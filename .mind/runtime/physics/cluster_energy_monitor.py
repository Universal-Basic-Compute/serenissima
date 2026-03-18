"""Real-time cluster energy monitoring for high-density physics graphs."""
from __future__ import annotations

import time
from collections import deque
from dataclasses import dataclass, field
from typing import Deque, Dict, Iterable, List


@dataclass
class ClusterEnergyReading:
    cluster_id: str
    timestamp: float
    total_energy: float
    node_count: int


@dataclass
class ClusterEnergyMonitor:
    large_cluster_threshold: int = 50
    max_history: int = 16
    _history: Dict[str, Deque[ClusterEnergyReading]] = field(default_factory=dict, init=False)

    def record(self, cluster_id: str, node_energies: Dict[str, float], timestamp: float | None = None) -> ClusterEnergyReading:
        timestamp = timestamp if timestamp is not None else time.monotonic()
        total_energy = sum(node_energies.values())
        reading = ClusterEnergyReading(
            cluster_id=cluster_id,
            timestamp=timestamp,
            total_energy=total_energy,
            node_count=len(node_energies),
        )
        history = self._history.setdefault(cluster_id, deque(maxlen=self.max_history))
        history.append(reading)
        return reading

    def recent_readings(self, cluster_id: str) -> List[ClusterEnergyReading]:
        return list(self._history.get(cluster_id, []))

    def large_clusters(self) -> List[ClusterEnergyReading]:
        snapshots: List[ClusterEnergyReading] = []
        for cluster_id, history in self._history.items():
            if not history:
                continue
            latest = history[-1]
            if latest.node_count >= self.large_cluster_threshold:
                snapshots.append(latest)
        return snapshots

    def detect_spike(self, cluster_id: str, multiplier: float = 1.5) -> ClusterEnergyReading | None:
        history = self._history.get(cluster_id)
        if not history or len(history) < 2:
            return None
        latest = history[-1]
        baseline = sum(r.total_energy for r in list(history)[:-1]) / (len(history) - 1)
        if latest.total_energy > baseline * multiplier:
            return latest
        return None

    def summary(self) -> Dict[str, Dict[str, float]]:
        report: Dict[str, Dict[str, float]] = {}
        for cluster_id, history in self._history.items():
            if not history:
                continue
            latest = history[-1]
            report[cluster_id] = {
                'total_energy': latest.total_energy,
                'node_count': latest.node_count,
                'timestamp': latest.timestamp,
            }
        return report
