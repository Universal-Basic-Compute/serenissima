"""Session tracker — neuron profile management for active Claude Code sessions.

Neurons are YAML files in shrine/state/neurons/{session_id}.yaml that track
active, busy, idle, and timed-out sessions. The dispatcher uses these for
routing decisions and stale session recovery.

Manages neuron profiles for active Claude Code sessions.
"""

import json
import re
import logging
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

logger = logging.getLogger("orchestrator.sessions")

# ── Constants ───────────────────────────────────────────────────────────────

SESSION_TIMEOUT = 900  # 15 min before considering stale
NEURON_MAX_AGE_SECONDS = 300  # 5 min before archiving idle neurons
MAX_TOTAL_NEURONS = 100  # Hard cap on neuron files

_neurons_dir: Optional[Path] = None


def set_neurons_dir(path: Path):
    global _neurons_dir
    _neurons_dir = path


def get_neurons_dir() -> Path:
    if _neurons_dir:
        return _neurons_dir
    return Path(__file__).resolve().parent.parent.parent / "shrine" / "state" / "neurons"


# ── Write / Update ──────────────────────────────────────────────────────────

def write_neuron_profile(
    session_id: str,
    name: str,
    purpose: str,
    status: str = "active",
    parent_id: Optional[str] = None,
    metadata: Optional[dict] = None,
):
    """Write/update a neuron's profile with public metadata."""
    neurons = get_neurons_dir()
    neurons.mkdir(parents=True, exist_ok=True)
    profile_path = neurons / f"{session_id}.yaml"

    profile = f"""# Neuron Profile: {session_id}
name: {name}
purpose: {purpose}
status: {status}
created: {datetime.now().isoformat()}
"""
    if parent_id:
        profile += f"parent: {parent_id}\n"

    if metadata:
        profile += "\n# Public Metadata\n"
        for key, value in metadata.items():
            if isinstance(value, (list, dict)):
                profile += f"{key}: {json.dumps(value)}\n"
            else:
                profile += f"{key}: {value}\n"

    profile_path.write_text(profile)


def update_neuron_status(session_id: str, status: str, sender_id: Optional[str] = None):
    """Update a neuron's status and optionally its last sender."""
    profile_path = get_neurons_dir() / f"{session_id}.yaml"
    if not profile_path.exists():
        return

    content = profile_path.read_text()
    content = re.sub(r"status: .*", f"status: {status}", content)
    if "updated:" in content:
        content = re.sub(r"updated: .*", f"updated: {datetime.now().isoformat()}", content)
    else:
        content += f"updated: {datetime.now().isoformat()}\n"

    if sender_id:
        if "last_sender_id:" in content:
            content = re.sub(r"last_sender_id: .*", f"last_sender_id: {sender_id}", content)
        else:
            content += f"last_sender_id: {sender_id}\n"

    profile_path.write_text(content)


# ── Read / List ─────────────────────────────────────────────────────────────

def get_active_neurons() -> list[dict]:
    """List all non-archived neurons with their status."""
    neurons_dir = get_neurons_dir()
    if not neurons_dir.exists():
        return []

    result = []
    for profile in neurons_dir.glob("*.yaml"):
        try:
            content = profile.read_text()
            info = {"session_id": profile.stem}
            for line in content.split("\n"):
                if ":" in line and not line.startswith("#"):
                    key, val = line.split(":", 1)
                    info[key.strip()] = val.strip()
            result.append(info)
        except (OSError, IOError):
            continue
    return result


# ── Cleanup ─────────────────────────────────────────────────────────────────

def cleanup_old_neurons() -> int:
    """Archive neurons that are idle/complete and older than NEURON_MAX_AGE_SECONDS."""
    neurons_dir = get_neurons_dir()
    if not neurons_dir.exists():
        return 0

    archive_dir = neurons_dir / "archive"
    archive_dir.mkdir(exist_ok=True)

    archived_count = 0
    cutoff_time = datetime.now() - timedelta(seconds=NEURON_MAX_AGE_SECONDS)

    for profile in neurons_dir.glob("*.yaml"):
        try:
            content = profile.read_text()
            if any(status in content for status in ["status: busy", "status: spawning"]):
                continue

            timestamp_str = None
            for line in content.split("\n"):
                if line.startswith("updated:") or line.startswith("created:"):
                    timestamp_str = line.split(":", 1)[1].strip()
                    break

            if timestamp_str:
                try:
                    neuron_time = datetime.fromisoformat(timestamp_str)
                    if neuron_time < cutoff_time:
                        profile.rename(archive_dir / profile.name)
                        archived_count += 1
                except (ValueError, TypeError):
                    pass
        except (OSError, IOError):
            continue

    if archived_count > 0:
        logger.debug(f"Archived {archived_count} old neurons")
    return archived_count


def find_stale_neurons(active_session_ids: set) -> list[tuple[str, str, float]]:
    """Find busy/spawning neurons with no active future (crashed or timed out).

    Returns list of (session_id, purpose, age_seconds) tuples.
    """
    neurons_dir = get_neurons_dir()
    if not neurons_dir.exists():
        return []

    stale = []
    now = datetime.now()

    for profile in neurons_dir.glob("*.yaml"):
        try:
            content = profile.read_text()
            session_id = profile.stem

            if not any(s in content for s in ["status: busy", "status: spawning"]):
                continue
            if session_id in active_session_ids:
                continue

            purpose = ""
            created_str = None
            for line in content.split("\n"):
                if line.startswith("purpose:"):
                    purpose = line.split(":", 1)[1].strip()
                if line.startswith("created:") or line.startswith("updated:"):
                    created_str = line.split(":", 1)[1].strip()

            if created_str:
                try:
                    created = datetime.fromisoformat(created_str)
                    age = (now - created).total_seconds()
                    if age > 3600:
                        # Ancient zombie — archive directly
                        archive_dir = neurons_dir / "archive"
                        archive_dir.mkdir(exist_ok=True)
                        profile.rename(archive_dir / profile.name)
                        logger.debug(f"Archived zombie {session_id} ({int(age)}s old)")
                    elif age > SESSION_TIMEOUT:
                        stale.append((session_id, purpose, age))
                except (ValueError, TypeError):
                    pass
        except (OSError, IOError):
            continue

    return stale


def relaunch_stale_neurons(active_session_ids: set, enqueue_fn=None) -> list[str]:
    """Find stale neurons, re-queue them, return list of re-queued session IDs."""
    stale = find_stale_neurons(active_session_ids)
    relaunched = []

    for session_id, purpose, age in stale:
        if "[RELAUNCH]" in purpose:
            update_neuron_status(session_id, "timeout")
            logger.debug(f"Skipping relaunch cascade for {session_id}")
            continue

        update_neuron_status(session_id, "timeout")

        if enqueue_fn:
            relaunch_request = {
                "mode": "partner",
                "voice_text": f"[RELAUNCH] Session {session_id} timed out after {int(age)}s. Original purpose: {purpose}. Continue or close this work.",
                "timestamp": datetime.now().isoformat(),
                "source": "relaunch",
                "hotkey": "RELAUNCH",
                "metadata": {"original_session": session_id, "original_purpose": purpose, "is_relaunch": True},
            }
            enqueue_fn(relaunch_request)

        relaunched.append(session_id)
        logger.info(f"Relaunching stale neuron {session_id} ({int(age)}s old)")

    return relaunched


def enforce_neuron_cap() -> int:
    """Enforce hard cap on total neurons. Archive oldest idle if over limit."""
    neurons_dir = get_neurons_dir()
    if not neurons_dir.exists():
        return 0

    archive_dir = neurons_dir / "archive"
    archive_dir.mkdir(exist_ok=True)

    neurons = list(neurons_dir.glob("*.yaml"))
    if len(neurons) <= MAX_TOTAL_NEURONS:
        return 0

    neurons_with_time = []
    for n in neurons:
        try:
            mtime = n.stat().st_mtime
            content = n.read_text()
            is_active = "status: active" in content or "status: busy" in content
            neurons_with_time.append((n, mtime, is_active))
        except (OSError, IOError):
            continue

    neurons_with_time.sort(key=lambda x: (x[2], x[1]))

    to_archive = len(neurons_with_time) - MAX_TOTAL_NEURONS
    archived = 0
    for neuron_path, _, is_active in neurons_with_time:
        if archived >= to_archive:
            break
        if not is_active:
            neuron_path.rename(archive_dir / neuron_path.name)
            archived += 1

    if archived > 0:
        logger.info(f"Archived {archived} neurons to stay under cap of {MAX_TOTAL_NEURONS}")
    return archived
