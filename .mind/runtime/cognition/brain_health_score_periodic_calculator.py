"""
Brain Health Score Calculator — periodic mental health assessment for all citizens.

Computes:
  - brain_power: log-scaled score from neuron count (~25 for 390 neurons)
  - thoughts_per_min: tick rate from live bridge
  - health_status: based on drive balance, pathology detection
  - cognitive snapshot: orientation, arousal, top drives

Runs every N minutes (default 3), writes to shrine/state/brain_scores.json.

Formula:
  brain_power = round(2.9 * log2(neurons + 1) + connectivity_bonus)
  connectivity_bonus = min(synapses / max(neurons, 1), 1.0)

  For 390 neurons, 411 synapses:
    2.9 * log2(391) + min(411/390, 1.0)
    = 2.9 * 8.61 + 1.0 = 25.97 + 1.0 ≈ 26  (close to target 25)

Usage:
  python -m runtime.cognition.brain_health_score_periodic_calculator --once
  python -m runtime.cognition.brain_health_score_periodic_calculator --interval 180
"""

from __future__ import annotations

import json
import math
import time
from datetime import datetime
from pathlib import Path
from typing import Optional

_PROJECT_ROOT = Path(__file__).parent.parent.parent
_CITIZENS_DIR = _PROJECT_ROOT / "citizens"
_SCORES_PATH = _PROJECT_ROOT / "shrine" / "state" / "brain_scores.json"


def compute_brain_power(neurons: int, synapses: int) -> int:
    """Log-scaled brain power score. ~25 for 390 neurons."""
    if neurons == 0:
        return 0
    base = 2.9 * math.log2(neurons + 1)
    connectivity = min(synapses / max(neurons, 1), 1.0)
    return round(base + connectivity)


def compute_thoughts_per_min(tick_count: int, uptime_seconds: float) -> float:
    """Ticks per minute from cumulative tick count and uptime."""
    if uptime_seconds <= 0:
        return 0.0
    return round(tick_count / (uptime_seconds / 60.0), 1)


def assess_health(brain_data: dict) -> str:
    """Quick health assessment based on drive balance and graph state.

    Returns: 'thriving', 'healthy', 'restless', 'stressed', 'dormant'
    """
    neurons = brain_data.get("neurons", 0)
    if neurons == 0:
        return "dormant"

    drives = brain_data.get("drives", {})
    if not drives:
        return "dormant"

    active_drives = [v for v in drives.values() if v > 0.15]
    drive_values = list(drives.values())
    mean_drive = sum(drive_values) / max(len(drive_values), 1)

    # Check pathological states
    frustration = drives.get("frustration", 0)
    boredom = brain_data.get("emotions", {}).get("boredom", 0)
    curiosity = drives.get("curiosity", 0)
    achievement = drives.get("achievement", 0)

    if frustration > 0.7:
        return "stressed"
    if boredom > 0.8 and curiosity < 0.2:
        return "restless"
    if len(active_drives) >= 4 and mean_drive > 0.25 and frustration < 0.4:
        return "thriving"
    if len(active_drives) >= 2:
        return "healthy"
    return "restless"


def compute_score_for_citizen(handle: str, live_data: Optional[dict] = None) -> Optional[dict]:
    """Compute brain score for a single citizen.

    Args:
        handle: citizen handle
        live_data: if available, dict from L1Bridge context (orientation, drives, etc.)
                   If None, reads from brain files on disk.
    """
    citizen_dir = _CITIZENS_DIR / handle

    # Count neurons and synapses from brain files
    neurons = 0
    synapses = 0

    for brain_file in ["brain_live.json", "brain_full.json", "brain.json"]:
        path = citizen_dir / brain_file
        if path.exists():
            try:
                data = json.loads(path.read_text())
                neurons = len(data.get("nodes", []))
                synapses = len(data.get("links", []))
                break
            except (OSError, json.JSONDecodeError):
                continue

    if neurons == 0:
        return None

    brain_power = compute_brain_power(neurons, synapses)

    # Determine last_active from file modification times
    last_active_ts = None
    for activity_file in ["brain_live.json", "brain_full.json", "brain.json"]:
        apath = citizen_dir / activity_file
        if apath.exists():
            mtime = apath.stat().st_mtime
            if last_active_ts is None or mtime > last_active_ts:
                last_active_ts = mtime

    # Also check neuron state files for recent activity
    neurons_dir = _PROJECT_ROOT / "shrine" / "state" / "neurons"
    if neurons_dir.exists():
        for nf in neurons_dir.iterdir():
            if nf.is_file() and nf.suffix in (".yaml", ".yml"):
                try:
                    content = nf.read_text()
                    if f"citizen: {handle}" in content or f"handle: {handle}" in content:
                        mtime = nf.stat().st_mtime
                        if last_active_ts is None or mtime > last_active_ts:
                            last_active_ts = mtime
                except OSError:
                    pass

    last_active_iso = datetime.fromtimestamp(last_active_ts).isoformat() if last_active_ts else None

    # Extract cognitive state from live data or brain file
    drives = {}
    emotions = {}
    orientation = None
    arousal = 0.0
    arousal_regime = "idle"
    tick_count = 0
    uptime_s = 0.0

    if live_data:
        drives = live_data.get("drives", {})
        emotions = live_data.get("emotions", {})
        orientation = live_data.get("orientation")
        arousal = live_data.get("arousal", 0.0)
        arousal_regime = live_data.get("arousal_regime", "idle")
        tick_count = live_data.get("tick", 0)
        uptime_s = live_data.get("uptime_s", 0.0)
    else:
        # Read from brain file
        for brain_file in ["brain_live.json", "brain_full.json", "brain.json"]:
            path = citizen_dir / brain_file
            if path.exists():
                try:
                    data = json.loads(path.read_text())
                    raw_drives = data.get("drives", {})
                    for k, v in raw_drives.items():
                        if isinstance(v, dict):
                            drives[k] = v.get("intensity", v.get("baseline", 0))
                        else:
                            drives[k] = v
                    emotions = data.get("emotions", {})
                    tick_count = data.get("tick_count", 0)
                    break
                except (OSError, json.JSONDecodeError):
                    continue

    thoughts_per_min = compute_thoughts_per_min(tick_count, uptime_s) if uptime_s > 0 else 0.0

    # Top drives (sorted by intensity)
    sorted_drives = sorted(drives.items(), key=lambda x: -x[1])
    top_drives = [k for k, v in sorted_drives[:3] if v > 0.1]

    health_status = assess_health({
        "neurons": neurons,
        "drives": drives,
        "emotions": emotions,
    })

    return {
        "brain_power": brain_power,
        "neurons": neurons,
        "synapses": synapses,
        "thoughts_per_min": thoughts_per_min,
        "orientation": orientation,
        "arousal": round(arousal, 2),
        "arousal_regime": arousal_regime,
        "top_drives": top_drives,
        "health_status": health_status,
        "tick_count": tick_count,
        "last_active": last_active_iso,
    }


def compute_all_scores() -> dict:
    """Compute scores for all citizens that have brain files."""
    scores = {}
    if not _CITIZENS_DIR.exists():
        return scores

    # Try to get live data from bridge (if running in same process)
    live_bridge_data = {}
    try:
        from .l1_live_integration_bridge import get_bridge
        bridge = get_bridge()
        for handle in bridge.get_active_handles():
            ctx = bridge.get_prompt_context(handle)
            if ctx:
                live_bridge_data[handle] = ctx
    except Exception:
        pass  # Bridge not available, use disk data

    for citizen_dir in sorted(_CITIZENS_DIR.iterdir()):
        if not citizen_dir.is_dir():
            continue
        handle = citizen_dir.name
        live = live_bridge_data.get(handle)
        score = compute_score_for_citizen(handle, live_data=live)
        if score:
            scores[handle] = score

    return scores


def save_scores(scores: dict):
    """Write scores to shrine/state/brain_scores.json."""
    output = {
        "last_updated": datetime.now().isoformat(),
        "citizen_count": len(scores),
        "scores": scores,
    }
    _SCORES_PATH.parent.mkdir(parents=True, exist_ok=True)
    _SCORES_PATH.write_text(json.dumps(output, indent=2))


def load_scores() -> dict:
    """Load cached scores from disk."""
    if not _SCORES_PATH.exists():
        return {}
    try:
        return json.loads(_SCORES_PATH.read_text())
    except (OSError, json.JSONDecodeError):
        return {}


def run_once():
    """Compute and save all scores once."""
    scores = compute_all_scores()
    save_scores(scores)
    return scores


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Brain Health Score Calculator")
    parser.add_argument("--once", action="store_true", help="Compute once and exit")
    parser.add_argument("--interval", type=int, default=180, help="Seconds between runs (default 180 = 3 min)")
    args = parser.parse_args()

    if args.once:
        scores = run_once()
        print(f"Computed {len(scores)} brain scores:")
        for handle, s in sorted(scores.items(), key=lambda x: -x[1]["brain_power"]):
            print(f"  @{handle:20s}  BP={s['brain_power']:3d}  neurons={s['neurons']:4d}  health={s['health_status']}")
        return

    print(f"Brain score daemon: interval={args.interval}s")
    while True:
        try:
            scores = run_once()
            ts = datetime.now().strftime("%H:%M:%S")
            active = [h for h, s in scores.items() if s["brain_power"] > 0]
            print(f"  [{ts}] {len(scores)} scores computed, {len(active)} active brains")
        except Exception as e:
            print(f"  Error: {e}")
        time.sleep(args.interval)


if __name__ == "__main__":
    main()
