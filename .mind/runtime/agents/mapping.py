"""
Agent Mapping

Agent discovery and ID generation from .mind/actors/ directory.
Task→Agent routing uses graph physics (embedding similarity * weight).

ID Pattern: TYPE_Name (e.g., AGENT_Witness, TASK_FixAuth)

DOCS: docs/agents/PATTERNS_Agent_System.md
"""

from pathlib import Path
from typing import Dict, List, Optional

# Default agent when no match found
DEFAULT_NAME = "fixer"

# Static mapping: name -> actor_id
# Pattern: id = name = TYPE_Name
NAME_TO_AGENT_ID: Dict[str, str] = {
    "witness": "AGENT_Witness",
    "groundwork": "AGENT_Groundwork",
    "keeper": "AGENT_Keeper",
    "weaver": "AGENT_Weaver",
    "voice": "AGENT_Voice",
    "scout": "AGENT_Scout",
    "architect": "AGENT_Architect",
    "fixer": "AGENT_Fixer",
    "herald": "AGENT_Herald",
    "steward": "AGENT_Steward",
}

def make_id(type_prefix: str, name: str) -> str:
    """Create ID in TYPE_Name format. TYPE is uppercase, Name is capitalized."""
    return f"{type_prefix.upper()}_{name.capitalize()}"


def normalize_citizen_id(handle: str) -> str:
    """Normalize a citizen handle to canonical CITIZEN_{handle} format.

    Citizen handles are snake_case, not capitalized (unlike agent IDs).
    Strips leading @ if present.

    Args:
        handle: e.g. "dragon_slayer", "@dragon_slayer", "CITIZEN_dragon_slayer"

    Returns:
        "CITIZEN_dragon_slayer"
    """
    handle = handle.strip().lstrip("@")
    if handle.upper().startswith("CITIZEN_"):
        handle = handle[8:]  # Remove CITIZEN_ prefix
    return f"CITIZEN_{handle.lower()}"


def extract_citizen_handle(citizen_id: str) -> str:
    """Extract the handle from a CITIZEN_ prefixed ID.

    Args:
        citizen_id: "CITIZEN_dragon_slayer"

    Returns:
        "dragon_slayer"
    """
    if citizen_id.startswith("CITIZEN_"):
        return citizen_id[8:]
    return citizen_id.lower()


# =============================================================================
# DYNAMIC AGENT DISCOVERY
# =============================================================================


def discover_agents(target_dir: Optional[Path] = None) -> Dict[str, str]:
    """
    Discover agents by scanning .mind/actors/ directory.

    Args:
        target_dir: Project root (defaults to cwd)

    Returns:
        Dict mapping name -> actor_id (e.g., {"witness": "AGENT_Witness"})
    """
    if target_dir is None:
        target_dir = Path.cwd()

    actors_dir = target_dir / ".mind" / "actors"
    if not actors_dir.exists():
        return {}

    agents = {}
    for actor_dir in actors_dir.iterdir():
        if not actor_dir.is_dir():
            continue

        # Check if it has a prompt file (CLAUDE.md or AGENTS.md)
        has_prompt = (
            (actor_dir / "CLAUDE.md").exists() or
            (actor_dir / "AGENTS.md").exists()
        )
        if not has_prompt:
            continue

        name = actor_dir.name
        # ID pattern: TYPE_Name
        agent_id = f"AGENT_{name.capitalize()}"
        agents[name.lower()] = agent_id

    return agents


def get_agent_id(name: str, target_dir: Optional[Path] = None) -> str:
    """
    Get agent ID for a name, discovering from .mind/actors/.

    Args:
        name: Agent name (e.g., "witness")
        target_dir: Project root

    Returns:
        Agent ID (e.g., "AGENT_Witness")
    """
    agents = discover_agents(target_dir)
    if name in agents:
        return agents[name]
    # Fallback: generate ID from name
    return f"AGENT_{name.capitalize()}"


def list_agents(target_dir: Optional[Path] = None) -> List[str]:
    """
    List all available agent names.

    Args:
        target_dir: Project root

    Returns:
        List of agent names
    """
    return list(discover_agents(target_dir).keys())


def get_name_description(name: str) -> str:
    """Get description for a name."""
    descriptions = {
        "witness": "evidence-first, traces what actually happened",
        "groundwork": "foundation-first, builds scaffolding",
        "keeper": "verification-first, checks before declaring done",
        "weaver": "connection-first, patterns across modules",
        "voice": "naming-first, finds right words for concepts",
        "scout": "exploration-first, navigates and surveys",
        "architect": "structure-first, shapes systems",
        "fixer": "work-first, resolves without breaking",
        "herald": "communication-first, broadcasts changes",
        "steward": "coordination-first, prioritizes and assigns",
    }
    return descriptions.get(name, "general agent")


def detect_citizen_id(target_dir: Optional[Path] = None) -> Optional[str]:
    """Detect current citizen from env var, cwd path, or target_dir config.

    Priority:
    1. MIND_CITIZEN_ID env var (explicit override)
    2. cwd within a citizens/ directory
    3. .mind/citizen_id file in target_dir (written by session setup)

    Returns CITIZEN_{handle} if detected, None otherwise.
    """
    import os

    # 1. Explicit env var
    citizen = os.environ.get("MIND_CITIZEN_ID")
    if citizen:
        return normalize_citizen_id(citizen)

    # 2. cwd within a citizens/ directory
    cwd = Path.cwd()
    parts = cwd.parts
    if "citizens" in parts:
        idx = parts.index("citizens")
        if idx + 1 < len(parts):
            return normalize_citizen_id(parts[idx + 1])

    # 3. .mind/citizen_id file (project-level config)
    if target_dir:
        cid_file = Path(target_dir) / ".mind" / "citizen_id"
        if cid_file.exists():
            try:
                handle = cid_file.read_text().strip()
                if handle:
                    return normalize_citizen_id(handle)
            except OSError:
                pass

    return None


def normalize_agent_id(
    agent_input: str,
    target_dir: Optional[Path] = None,
    graph_ops=None,
) -> str:
    """
    Normalize various agent name formats to canonical AGENT_Name ID.

    Handles:
        - "AGENT_Witness" → "AGENT_Witness"
        - "witness" → "AGENT_Witness"
        - "Witness" → "AGENT_Witness"
        - "WITNESS" → "AGENT_Witness"
        - "agent_witness" → "AGENT_Witness"
        - "agent-witness" → "AGENT_Witness"
        - "" or None → Citizen from env/cwd, or HUMAN from graph, or AGENT_Fixer

    Args:
        agent_input: Any agent name/ID format
        target_dir: Project root for discovery
        graph_ops: Optional graph ops for HUMAN lookup

    Returns:
        Canonical actor ID (e.g., "AGENT_Witness", "CITIZEN_dragon_slayer", or "HUMAN_Nicolas")
    """
    if not agent_input:
        # 1. Check for citizen context (env var, cwd, or target_dir config)
        citizen_id = detect_citizen_id(target_dir)
        if citizen_id:
            return citizen_id

        # 2. Find best HUMAN actor from graph
        if graph_ops:
            try:
                result = graph_ops._query(
                    """
                    MATCH (a)
                    WHERE a.node_type = 'actor' AND a.type = 'HUMAN'
                    RETURN a.id, COALESCE(a.weight, 1.0) * COALESCE(a.energy, 0.5) as score
                    ORDER BY score DESC
                    LIMIT 1
                    """
                )
                if result and result[0]:
                    return result[0][0]
            except Exception:
                pass

        # 3. Fallback to default agent
        return f"AGENT_{DEFAULT_NAME.capitalize()}"

    # Strip whitespace
    agent_input = agent_input.strip()

    # Already canonical format
    if agent_input.startswith("CITIZEN_"):
        return agent_input  # Citizens use snake_case, no capitalize
    if agent_input.startswith("AGENT_"):
        name = agent_input[6:]  # Remove AGENT_ prefix
        return f"AGENT_{name.capitalize()}"

    # Remove common prefixes (case-insensitive)
    lower = agent_input.lower()
    for prefix in ["agent_", "agent-", "actor_", "actor-"]:
        if lower.startswith(prefix):
            agent_input = agent_input[len(prefix):]
            break

    # Extract name (handle remaining separators)
    name = agent_input.replace("-", "_").split("_")[-1]

    # Normalize to lowercase for lookup
    name_lower = name.lower()

    # Check if it's a known agent
    agents = discover_agents(target_dir)
    if name_lower in agents:
        return agents[name_lower]

    # Fallback to static mapping
    if name_lower in NAME_TO_AGENT_ID:
        return NAME_TO_AGENT_ID[name_lower]

    # Generate ID from name
    return f"AGENT_{name.capitalize()}"


def extract_agent_name(agent_id: str) -> str:
    """
    Extract lowercase name from agent ID.

    Args:
        agent_id: "AGENT_Witness" or any format

    Returns:
        Lowercase name: "witness"
    """
    normalized = normalize_agent_id(agent_id)
    if normalized.startswith("AGENT_"):
        return normalized[6:].lower()
    return normalized.lower()
