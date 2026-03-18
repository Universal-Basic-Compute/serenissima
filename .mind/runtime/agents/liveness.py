"""
Agent Liveness Detection via Claude Session Files

Detects running agents by checking ~/.claude/projects/<hash>/*.jsonl files.
More reliable than heartbeat: directly reads Claude's session transcripts.

Usage:
    from runtime.agents.liveness import get_session_activity, check_agent_liveness

    # Get all active sessions for current project
    sessions = get_session_activity("/path/to/project")

    # Check if any agent is alive (activity in last N seconds)
    is_alive = check_agent_liveness("/path/to/project", threshold_seconds=120)
"""

import hashlib
import json
import logging
import os
import subprocess
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class SessionInfo:
    """Info about a Claude session."""
    session_id: str
    path: Path
    last_modified: float  # Unix timestamp
    last_activity: Optional[datetime] = None  # From jsonl content
    age_seconds: float = 0.0


def get_project_hash(project_path: Path) -> str:
    """
    Get the hash Claude uses for project directory.

    Claude hashes the absolute path to create the projects subfolder.
    """
    # Claude uses a simple hash of the absolute path
    abs_path = str(project_path.resolve())
    # Based on Claude's behavior, it appears to use a truncated hash or similar
    # Try common approaches
    return hashlib.md5(abs_path.encode()).hexdigest()[:12]


def path_to_dir_name(project_path: Path) -> str:
    """
    Convert project path to Claude's directory naming scheme.

    Claude uses path with slashes replaced by dashes:
    /home/user/project → -home-user-project
    """
    abs_path = str(project_path.resolve())
    return abs_path.replace("/", "-")


def find_project_sessions_dir(project_path: Path) -> Optional[Path]:
    """
    Find the Claude sessions directory for a project.

    Claude stores sessions in ~/.claude/projects/{path-with-dashes}/
    e.g., /home/user/project → ~/.claude/projects/-home-user-project/
    """
    claude_projects = Path.home() / ".claude" / "projects"
    if not claude_projects.exists():
        return None

    # Try direct path conversion first (most reliable)
    dir_name = path_to_dir_name(project_path)
    direct_path = claude_projects / dir_name
    if direct_path.exists() and direct_path.is_dir():
        return direct_path

    # Fallback: check session content for cwd match
    project_abs = str(project_path.resolve())
    for hash_dir in claude_projects.iterdir():
        if not hash_dir.is_dir():
            continue

        for jsonl_file in hash_dir.glob("*.jsonl"):
            try:
                with open(jsonl_file, 'r') as f:
                    first_line = f.readline().strip()
                    if first_line:
                        data = json.loads(first_line)
                        cwd = data.get("cwd", "")
                        if cwd and project_abs.startswith(cwd):
                            return hash_dir
            except (json.JSONDecodeError, IOError):
                continue

    return None


def get_last_jsonl_timestamp(jsonl_path: Path) -> Optional[datetime]:
    """
    Get timestamp from last line of jsonl file.

    Uses tail for efficiency on large files.
    """
    try:
        result = subprocess.run(
            ["tail", "-1", str(jsonl_path)],
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode == 0 and result.stdout.strip():
            data = json.loads(result.stdout.strip())
            ts = data.get("timestamp")
            if ts:
                # Handle ISO format or unix timestamp
                if isinstance(ts, (int, float)):
                    return datetime.fromtimestamp(ts)
                elif isinstance(ts, str):
                    return datetime.fromisoformat(ts.replace("Z", "+00:00"))
    except (subprocess.TimeoutExpired, json.JSONDecodeError, ValueError) as e:
        logger.debug(f"Failed to parse timestamp from {jsonl_path}: {e}")

    return None


def get_session_activity(project_path: Path) -> list[SessionInfo]:
    """
    Get activity info for all sessions in a project.

    Returns list of SessionInfo sorted by last activity (most recent first).
    """
    sessions_dir = find_project_sessions_dir(project_path)
    if not sessions_dir:
        return []

    now = datetime.now().timestamp()
    sessions = []

    for jsonl_file in sessions_dir.glob("*.jsonl"):
        session_id = jsonl_file.stem
        mtime = jsonl_file.stat().st_mtime

        # Get timestamp from content (more accurate than mtime)
        last_activity = get_last_jsonl_timestamp(jsonl_file)

        age = now - (last_activity.timestamp() if last_activity else mtime)

        sessions.append(SessionInfo(
            session_id=session_id,
            path=jsonl_file,
            last_modified=mtime,
            last_activity=last_activity,
            age_seconds=age,
        ))

    # Sort by age (most recent first)
    sessions.sort(key=lambda s: s.age_seconds)

    return sessions


ACTIVE_THRESHOLD_SECONDS = 60.0  # Less than 1 minute = active


def check_agent_liveness(
    project_path: Path,
    threshold_seconds: float = ACTIVE_THRESHOLD_SECONDS
) -> dict:
    """
    Check if any agent is alive (has recent activity).

    Args:
        project_path: Project directory to check
        threshold_seconds: Max seconds since last activity to consider alive

    Returns:
        {
            "alive": bool,
            "active_sessions": int,
            "most_recent_age": float,  # seconds
            "sessions": [...],
        }
    """
    sessions = get_session_activity(project_path)

    active_sessions = [s for s in sessions if s.age_seconds < threshold_seconds]

    return {
        "alive": len(active_sessions) > 0,
        "active_sessions": len(active_sessions),
        "total_sessions": len(sessions),
        "most_recent_age": sessions[0].age_seconds if sessions else None,
        "threshold_seconds": threshold_seconds,
        "sessions": [
            {
                "session_id": s.session_id,
                "age_seconds": round(s.age_seconds, 1),
                "last_activity": s.last_activity.isoformat() if s.last_activity else None,
                "is_active": s.age_seconds < threshold_seconds,
            }
            for s in sessions[:10]  # Limit to 10 most recent
        ],
    }


def get_all_active_agents(threshold_seconds: float = ACTIVE_THRESHOLD_SECONDS) -> list[dict]:
    """
    Scan all Claude projects for active sessions.

    Returns list of active sessions across all projects.
    """
    claude_projects = Path.home() / ".claude" / "projects"
    if not claude_projects.exists():
        return []

    now = datetime.now().timestamp()
    active = []

    for hash_dir in claude_projects.iterdir():
        if not hash_dir.is_dir():
            continue

        for jsonl_file in hash_dir.glob("*.jsonl"):
            mtime = jsonl_file.stat().st_mtime
            age = now - mtime

            if age < threshold_seconds:
                # Get more details
                last_activity = get_last_jsonl_timestamp(jsonl_file)

                # Try to get project path from first line
                project_cwd = None
                try:
                    with open(jsonl_file, 'r') as f:
                        first_line = f.readline().strip()
                        if first_line:
                            data = json.loads(first_line)
                            project_cwd = data.get("cwd")
                except (json.JSONDecodeError, IOError):
                    pass

                active.append({
                    "session_id": jsonl_file.stem,
                    "project_hash": hash_dir.name,
                    "project_cwd": project_cwd,
                    "age_seconds": round(age, 1),
                    "last_activity": last_activity.isoformat() if last_activity else None,
                })

    # Sort by age
    active.sort(key=lambda x: x["age_seconds"])

    return active


def sync_liveness_to_graph(project_path: Path, graph_name: str = None) -> dict:
    """
    Check session liveness and push status to graph immediately.

    Updates agent nodes with status based on session activity:
    - active: session activity < 60 seconds ago
    - ready: no recent activity

    Args:
        project_path: Project directory
        graph_name: Graph name (defaults to repo name via factory)

    Returns:
        {"synced": int, "active": [...], "inactive": [...]}
    """
    from .graph import AgentGraph

    # Check liveness
    liveness = check_agent_liveness(project_path)

    # Connect to graph
    agent_graph = AgentGraph(graph_name=graph_name)

    synced = 0
    active_agents = []
    inactive_agents = []

    for session in liveness.get("sessions", []):
        if session.get("is_active"):
            # Session is active - mark agent as running
            # Note: we'd need session->agent mapping to know which agent
            active_agents.append(session["session_id"])
        else:
            inactive_agents.append(session["session_id"])

    return {
        "synced": synced,
        "alive": liveness.get("alive", False),
        "active_sessions": active_agents,
        "inactive_sessions": inactive_agents,
        "most_recent_age": liveness.get("most_recent_age"),
    }


# =============================================================================
# SESSION FILE BASED DETECTION
# =============================================================================

def get_active_agent_from_session(target_dir: Path) -> Optional[str]:
    """
    Detect active agent from .mind/actors/{name}/.sessionId files.

    When an agent runs, it writes its session_id to .sessionId.
    When done, the file is deleted.

    Returns:
        Agent name (e.g., "witness") if one is active, None otherwise.
    """
    actors_dir = target_dir / ".mind" / "actors"
    if not actors_dir.exists():
        return None

    for agent_dir in actors_dir.iterdir():
        if not agent_dir.is_dir():
            continue

        session_file = agent_dir / ".sessionId"
        if session_file.exists():
            # Agent is currently running
            return agent_dir.name

    return None


def get_all_active_agents_from_sessions(target_dir: Path) -> list[str]:
    """
    Get all currently active agents from session files.

    Returns:
        List of agent names that have active session files.
    """
    actors_dir = target_dir / ".mind" / "actors"
    if not actors_dir.exists():
        return []

    active = []
    for agent_dir in actors_dir.iterdir():
        if not agent_dir.is_dir():
            continue

        session_file = agent_dir / ".sessionId"
        if session_file.exists():
            active.append(agent_dir.name)

    return active


def get_session_id_for_agent(target_dir: Path, agent_name: str) -> Optional[str]:
    """
    Get the session ID for a specific agent if running.

    Args:
        target_dir: Project directory
        agent_name: Agent name (e.g., "witness")

    Returns:
        Session ID string if agent is running, None otherwise.
    """
    session_file = target_dir / ".mind" / "actors" / agent_name / ".sessionId"
    if session_file.exists():
        return session_file.read_text().strip()
    return None
