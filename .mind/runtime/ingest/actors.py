"""
Actor ingestion for the mind graph.

Creates Actor nodes from .mind/actors/{name}/CLAUDE.md files.
Each actor represents a work agent with a specific name.

Structure:
    .mind/actors/
    ├── witness/
    │   ├── CLAUDE.md   # Claude-specific prompts
    │   ├── GEMINI.md   # Gemini-specific prompts
    │   └── AGENTS.md   # Generic prompts
    └── fixer/
        └── ...

DOCS: .mind/docs/AGENT_TEMPLATE.md
"""

import logging
import re
from pathlib import Path
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)


def ingest_actors(
    target_dir: Path,
    graph_name: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Ingest actors from .mind/actors/ into the graph.

    Reads .mind/actors/{name}/CLAUDE.md and creates Actor nodes with:
    - id: AGENT_{Name}
    - synthesis: for embedding
    - content: purpose description

    Args:
        target_dir: Repository root (where .mind/ lives)
        graph_name: Graph to ingest into (default: from config)

    Returns:
        Stats dict: {actors, created, updated, unchanged}
    """
    from ..infrastructure.database import get_database_adapter
    from ..inject import inject

    actors_dir = target_dir / ".mind" / "actors"
    if not actors_dir.exists():
        return {"actors": 0, "created": 0, "updated": 0, "unchanged": 0}

    # Get database adapter
    adapter = get_database_adapter(graph_name=graph_name)

    stats = {
        "actors": 0,
        "created": 0,
        "updated": 0,
        "unchanged": 0,
    }

    # Create actors space (no context - init-time bulk operation)
    result = inject(adapter, {
        "id": "space:actors",
        "label": "Space",
        "name": "actors",
        "type": "system",
        "synthesis": "space:actors — Work agents that execute tasks with specific cognitive names",
        "content": "Work agents that execute tasks with specific cognitive names",
        "weight": 8.0,
        "energy": 0.0,
    }, with_context=False)
    logger.debug(f"space:actors: {result}")

    # Link actors space to root
    inject(adapter, {
        "from": "space:root",
        "to": "space:actors",
        "nature": "contains",
    }, with_context=False)

    # Process each actor folder (actors/{name}/)
    actor_dirs = [d for d in actors_dir.iterdir() if d.is_dir()]
    stats["actors"] = len(actor_dirs)

    for actor_dir in sorted(actor_dirs):
        result = _ingest_actor(adapter, actor_dir)
        stats[result] += 1

    return stats


def _ingest_actor(adapter, actor_dir: Path) -> str:
    """
    Ingest a single actor from folder.

    Reads from actors/{name}/CLAUDE.md (or AGENTS.md as fallback).

    Returns: "created", "updated", or "unchanged"
    """
    from ..inject import inject

    name = actor_dir.name
    actor_id = f"AGENT_{name.capitalize()}"

    # Find prompt file (prefer CLAUDE.md, fallback to AGENTS.md)
    prompt_file = actor_dir / "CLAUDE.md"
    if not prompt_file.exists():
        prompt_file = actor_dir / "AGENTS.md"
    if not prompt_file.exists():
        logger.warning(f"No CLAUDE.md or AGENTS.md in {actor_dir}")
        return "unchanged"

    # Parse the file
    content = prompt_file.read_text(encoding='utf-8', errors='ignore')

    # Extract purpose from ## Purpose section
    purpose_match = re.search(
        r"## Purpose\s*\n\s*\n(.+?)(?=\n\n|\n---|\n##|$)",
        content,
        re.DOTALL
    )
    purpose = purpose_match.group(1).strip() if purpose_match else f"{name} agent"

    # Extract move pattern
    move_match = re.search(r"\*\*Move:\*\*\s*(.+)", content)
    move = move_match.group(1).strip() if move_match else ""

    # Build synthesis for embedding
    synthesis = f"AGENT_{name.capitalize()} — {purpose[:150]}"
    if move:
        synthesis += f" ({move})"

    # Inject the actor node (no context - init-time)
    result = inject(adapter, {
        "id": actor_id,
        "label": "Actor",
        "name": name.capitalize(),
        "type": "AGENT",
        "synthesis": synthesis,
        "content": purpose,
        "status": "ready",
        "weight": 1.0,
        "energy": 0.0,
    }, with_context=False)

    # Link actor to actors space
    inject(adapter, {
        "from": "space:actors",
        "to": actor_id,
        "nature": "contains",
    }, with_context=False)

    return result
