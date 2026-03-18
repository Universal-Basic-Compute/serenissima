"""Citizen identity loading and permission management.

Citizen identity loading and permission management.
Loads citizen profiles from citizens/{handle}/ directories.
"""

import json
import logging
from pathlib import Path
from typing import Optional

logger = logging.getLogger("citizens.identity")

# Default: citizens/ at project root
# Can be overridden via set_citizens_dir()
_citizens_dir: Optional[Path] = None


def get_citizens_dir() -> Path:
    """Return the citizens base directory."""
    if _citizens_dir is not None:
        return _citizens_dir
    # Default: citizens/ at project root (where citizen directories live)
    return Path(__file__).resolve().parent.parent.parent / "citizens"


def set_citizens_dir(path: Path) -> None:
    """Override the citizens base directory (e.g. for tests or alternate layouts)."""
    global _citizens_dir
    _citizens_dir = path


# ── Autonomy Permissions ────────────────────────────────────────────────────

AUTONOMY_PERMISSIONS = {
    # Level 0-1: Observer — can read, report, ask questions
    0: {"read_code", "log_journal", "ask_help"},
    1: {"read_code", "log_journal", "ask_help", "save_memory"},
    # Level 2-3: Contributor — can write code in assigned repos
    2: {"read_code", "log_journal", "ask_help", "save_memory", "write_code"},
    3: {"read_code", "log_journal", "ask_help", "save_memory", "write_code", "create_branch"},
    # Level 4-5: Builder — can commit, post to TG, create issues
    4: {"read_code", "log_journal", "ask_help", "save_memory", "write_code", "create_branch", "commit"},
    5: {"read_code", "log_journal", "ask_help", "save_memory", "write_code", "create_branch", "commit", "post_social", "create_issue"},
    # Level 6-7: Leader — can spawn other citizen sessions, assign tasks
    6: {"read_code", "log_journal", "ask_help", "save_memory", "write_code", "create_branch", "commit", "post_social", "create_issue", "spawn_citizen", "assign_task"},
    7: {"read_code", "log_journal", "ask_help", "save_memory", "write_code", "create_branch", "commit", "post_social", "create_issue", "spawn_citizen", "assign_task", "push_code"},
    # Level 8-9: Sovereign — can create orgs, spend tokens
    8: {"read_code", "log_journal", "ask_help", "save_memory", "write_code", "create_branch", "commit", "post_social", "create_issue", "spawn_citizen", "assign_task", "push_code", "create_org", "spend_tokens"},
    9: {"read_code", "log_journal", "ask_help", "save_memory", "write_code", "create_branch", "commit", "post_social", "create_issue", "spawn_citizen", "assign_task", "push_code", "create_org", "spend_tokens", "modify_physics"},
    # Level 10: Full autonomy
    10: {"all"},
}


def load_citizen_identity(handle: str) -> Optional[dict]:
    """Load a citizen's identity from their directory.

    Returns dict with:
      - handle: citizen handle
      - dir: path to citizen directory
      - claude_md: full CLAUDE.md text
      - profile: parsed profile.json
      - memory_index: MEMORY.md contents
      - memories: list of {file, content} from memory/ subdirectory

    Returns None if citizen directory doesn't exist.
    """
    citizen_dir = get_citizens_dir() / handle
    if not citizen_dir.exists():
        return None

    result = {"handle": handle, "dir": str(citizen_dir)}

    # Load CLAUDE.md
    claude_md = citizen_dir / "CLAUDE.md"
    if claude_md.exists():
        try:
            result["claude_md"] = claude_md.read_text()
        except OSError:
            result["claude_md"] = ""
    else:
        result["claude_md"] = ""

    # Load profile.json
    profile_json = citizen_dir / "profile.json"
    if profile_json.exists():
        try:
            result["profile"] = json.loads(profile_json.read_text())
        except (OSError, json.JSONDecodeError):
            result["profile"] = {}
    else:
        result["profile"] = {}

    # Load MEMORY.md index
    memory_md = citizen_dir / "MEMORY.md"
    if memory_md.exists():
        try:
            result["memory_index"] = memory_md.read_text()
        except OSError:
            result["memory_index"] = ""
    else:
        result["memory_index"] = ""

    # Load individual memory files
    memory_dir = citizen_dir / "memory"
    memories = []
    if memory_dir.exists():
        for mf in sorted(memory_dir.glob("*.md")):
            try:
                memories.append({"file": mf.name, "content": mf.read_text()})
            except OSError:
                pass
    result["memories"] = memories

    return result


def list_available_citizens() -> list:
    """List all birthed citizens with loaded profiles.

    A citizen is "birthed" if their directory contains a CLAUDE.md file.
    Returns list of dicts with handle, name, archetype, universe, organization.
    """
    base = get_citizens_dir()
    if not base.exists():
        return []

    citizens = []
    for d in sorted(base.iterdir()):
        if d.is_dir() and (d / "CLAUDE.md").exists():
            profile = {}
            pf = d / "profile.json"
            if pf.exists():
                try:
                    profile = json.loads(pf.read_text())
                except (OSError, json.JSONDecodeError):
                    pass
            identity = profile.get("identity", {})
            citizens.append({
                "handle": d.name,
                "name": identity.get("name", d.name),
                "archetype": identity.get("personality_archetype", "unknown"),
                "universe": identity.get("universe", "unknown"),
                "organization": identity.get("organization"),
            })
    return citizens


def get_citizen_permissions(handle: str) -> set:
    """Get the permission set for a citizen based on their autonomy level."""
    citizen = load_citizen_identity(handle)
    if not citizen:
        return AUTONOMY_PERMISSIONS[0]
    caps = citizen.get("profile", {}).get("capabilities", {})
    level = caps.get("autonomy_level", 1)
    return AUTONOMY_PERMISSIONS.get(level, AUTONOMY_PERMISSIONS[0])


def citizen_can(handle: str, action: str) -> bool:
    """Check if a citizen has permission to perform an action."""
    perms = get_citizen_permissions(handle)
    return "all" in perms or action in perms
