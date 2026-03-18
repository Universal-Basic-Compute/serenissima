"""
Capability ingestion for the mind graph.

Creates graph nodes for the capability system at init time:
- space:capabilities (root)
- space:capability:{name} for each capability
- narrative:{subtype}:{name} for doc chain files
- narrative:task:{name} for tasks
- narrative:skill:{name} for skills
- space:procedure:{name} for procedures
- IMPLEMENTS links between doc chain files

DOCS: docs/capabilities/PATTERNS_Capabilities.md
"""

import logging
from pathlib import Path
from typing import Dict, Any, List, Optional

logger = logging.getLogger(__name__)

# Doc chain files in implementation order
DOC_CHAIN_ORDER = [
    "OBJECTIVES", "PATTERNS", "VOCABULARY", "BEHAVIORS",
    "ALGORITHM", "VALIDATION", "IMPLEMENTATION", "HEALTH", "SYNC",
]


def ingest_capabilities(
    target_dir: Path,
    graph_name: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Ingest capabilities into the graph.

    Creates the full capability graph structure with proper synthesis fields.
    Only updates nodes if synthesis has changed (to avoid unnecessary re-embedding).

    Args:
        target_dir: Repository root (where .mind/ lives)
        graph_name: Graph to ingest into (default: from config)

    Returns:
        Stats dict: {capabilities, nodes_changed, nodes_unchanged, links_created}
    """
    from ..infrastructure.database import get_database_adapter
    from ..inject import inject

    capabilities_dir = target_dir / ".mind" / "capabilities"
    if not capabilities_dir.exists():
        return {"capabilities": 0, "nodes_changed": 0, "nodes_unchanged": 0, "links_created": 0}

    # Get database adapter
    adapter = get_database_adapter(graph_name=graph_name)

    stats = {
        "capabilities": 0,
        "nodes_changed": 0,
        "nodes_unchanged": 0,
        "links_created": 0,
    }

    # 1. Create root capabilities space
    # with_context=False: init-time bulk load, not query-driven
    # - No moment creation (would flood graph with init moments)
    # - No actor/space linking (no active task context at init)
    result = inject(adapter, {
        "id": "space:capabilities",
        "label": "Space",
        "name": "Capabilities",
        "type": "SYSTEM",  # Uppercase type for system containers
        "content": "Root space for health checks, tasks, skills, and procedures",
        "weight": 10.0,
        "energy": 0.0,
    }, with_context=False)
    if result in ("created", "updated"):
        stats["nodes_changed"] += 1
    else:
        stats["nodes_unchanged"] += 1

    # Link to root space
    inject(adapter, {
        "from": "space:root",
        "to": "space:capabilities",
        "nature": "contains",
    }, with_context=False)
    stats["links_created"] += 1

    # 2. Process each capability folder
    capabilities = [d for d in capabilities_dir.iterdir() if d.is_dir()]
    stats["capabilities"] = len(capabilities)

    for cap_dir in sorted(capabilities):
        cap_stats = _ingest_capability(adapter, cap_dir, cap_dir.name)
        stats["nodes_changed"] += cap_stats["changed"]
        stats["nodes_unchanged"] += cap_stats["unchanged"]
        stats["links_created"] += cap_stats["links"]

    return stats


def _ingest_capability(adapter, cap_dir: Path, cap_name: str) -> Dict[str, int]:
    """Ingest a single capability folder."""
    from ..inject import inject

    stats = {"changed": 0, "unchanged": 0, "links": 0}
    cap_id = f"space:capability:{cap_name}"

    # 1. Create capability space
    result = inject(adapter, {
        "id": cap_id,
        "label": "Space",
        "name": cap_name,
        "type": "CAPABILITY",  # Uppercase type
        "content": f"Capability providing health checks, tasks, and skills for {cap_name}",
        "weight": 8.0,
        "energy": 0.0,
    })
    if result in ("created", "updated"):
        stats["changed"] += 1
    else:
        stats["unchanged"] += 1

    # Link to capabilities root
    inject(adapter, {
        "from": "space:capabilities",
        "to": cap_id,
        "nature": "contains",
    })
    stats["links"] += 1

    # 2. Create doc chain narrative nodes
    doc_ids = []
    for doc_type in DOC_CHAIN_ORDER:
        doc_file = cap_dir / f"{doc_type}.md"
        if doc_file.exists():
            doc_id = f"narrative:{doc_type.lower()}:{cap_name}"
            synthesis = _generate_synthesis(doc_file, doc_type, cap_name)

            result = inject(adapter, {
                "id": doc_id,
                "label": "Narrative",
                "name": f"{doc_type} - {cap_name}",
                "type": doc_type.lower(),
                "synthesis": synthesis,
                "path": str(doc_file),
                "weight": 5.0,
                "energy": 0.0,
            })
            if result in ("created", "updated"):
                stats["changed"] += 1
            else:
                stats["unchanged"] += 1
            doc_ids.append(doc_id)

            # Link doc to capability
            inject(adapter, {
                "from": cap_id,
                "to": doc_id,
                "nature": "defines",
            })
            stats["links"] += 1

    # 3. Create IMPLEMENTS links between consecutive doc chain files
    for i in range(len(doc_ids) - 1):
        inject(adapter, {
            "from": doc_ids[i + 1],
            "to": doc_ids[i],
            "nature": "implements",
        })
        stats["links"] += 1

    # 4. Create task narrative nodes
    tasks_dir = cap_dir / "tasks"
    if tasks_dir.exists():
        for task_file in tasks_dir.glob("TASK_*.md"):
            task_name = task_file.stem
            task_id = f"narrative:task:{task_name}"
            synthesis = _generate_synthesis(task_file, "TASK", cap_name)

            result = inject(adapter, {
                "id": task_id,
                "label": "Narrative",
                "name": task_name,
                "type": "task",
                "synthesis": synthesis,
                "path": str(task_file),
                "capability": cap_name,
                "weight": 6.0,
                "energy": 0.0,
            })
            if result in ("created", "updated"):
                stats["changed"] += 1
            else:
                stats["unchanged"] += 1

            # Link task to capability
            inject(adapter, {
                "from": cap_id,
                "to": task_id,
                "nature": "provides",
            })
            stats["links"] += 1

    # 5. Create skill narrative nodes
    skills_dir = cap_dir / "skills"
    if skills_dir.exists():
        for skill_file in skills_dir.glob("SKILL_*.md"):
            skill_name = skill_file.stem
            skill_id = f"narrative:skill:{skill_name}"
            synthesis = _generate_synthesis(skill_file, "SKILL", cap_name)

            result = inject(adapter, {
                "id": skill_id,
                "label": "Narrative",
                "name": skill_name,
                "type": "skill",
                "synthesis": synthesis,
                "path": str(skill_file),
                "capability": cap_name,
                "weight": 6.0,
                "energy": 0.0,
            })
            if result in ("created", "updated"):
                stats["changed"] += 1
            else:
                stats["unchanged"] += 1

            # Link skill to capability
            inject(adapter, {
                "from": cap_id,
                "to": skill_id,
                "nature": "provides",
            })
            stats["links"] += 1

            # Link skill to procedure if referenced
            proc_ref = _extract_procedure_reference(skill_file)
            if proc_ref:
                proc_id = f"space:procedure:{proc_ref}"
                inject(adapter, {
                    "from": skill_id,
                    "to": proc_id,
                    "nature": "executes",
                })
                stats["links"] += 1

            # Link tasks to skill if referenced
            task_refs = _extract_task_references(skill_file)
            for task_ref in task_refs:
                task_id = f"narrative:task:{task_ref}"
                inject(adapter, {
                    "from": task_id,
                    "to": skill_id,
                    "nature": "uses",
                })
                stats["links"] += 1

    # 6. Create procedure space nodes
    procedures_dir = cap_dir / "procedures"
    if procedures_dir.exists():
        for proc_file in procedures_dir.glob("PROCEDURE_*.yaml"):
            proc_name = proc_file.stem
            proc_id = f"space:procedure:{proc_name}"
            proc_info = _parse_procedure_yaml(proc_file)

            purpose = proc_info.get("purpose", "").strip()
            content = purpose if purpose else f"Procedure in {cap_name}"

            result = inject(adapter, {
                "id": proc_id,
                "label": "Space",
                "name": proc_name,
                "type": "PROCEDURE",  # Uppercase type
                "content": content,
                "path": str(proc_file),
                "capability": cap_name,
                "status": proc_info.get("status", "active"),
                "weight": 7.0,
                "energy": 0.0,
            })
            if result in ("created", "updated"):
                stats["changed"] += 1
            else:
                stats["unchanged"] += 1

            # Link procedure to capability
            inject(adapter, {
                "from": cap_id,
                "to": proc_id,
                "nature": "provides",
            })
            stats["links"] += 1

    return stats


def _generate_synthesis(md_file: Path, doc_type: str, cap_name: str) -> str:
    """Generate synthesis text from markdown file content."""
    try:
        content = md_file.read_text()[:2000]
        lines = content.split("\n")

        # Extract first meaningful paragraph
        in_code_block = False
        paragraph_lines = []

        for line in lines:
            if line.startswith("```"):
                in_code_block = not in_code_block
                continue
            if in_code_block:
                continue
            if line.startswith("#") or line.startswith("---"):
                continue

            stripped = line.strip()
            if not stripped:
                if paragraph_lines:
                    break
                continue

            paragraph_lines.append(stripped)

        if paragraph_lines:
            desc = " ".join(paragraph_lines)
            if len(desc) > 200:
                desc = desc[:197] + "..."
            return f"{doc_type} {cap_name} — {desc}"

    except Exception:
        pass

    return f"{doc_type} {cap_name} — documentation"


def _parse_procedure_yaml(yaml_file: Path) -> Dict[str, Any]:
    """Parse procedure YAML file for metadata."""
    try:
        import yaml
        with open(yaml_file) as f:
            return yaml.safe_load(f) or {}
    except Exception:
        return {}


def _extract_procedure_reference(skill_file: Path) -> str:
    """Extract procedure reference from skill file."""
    try:
        import re
        content = skill_file.read_text()
        match = re.search(r"procedure:\s*(PROCEDURE_\w+)", content)
        if match:
            return match.group(1)
    except Exception:
        pass
    return ""


def _extract_task_references(skill_file: Path) -> List[str]:
    """Extract task references from skill file used_by section."""
    try:
        import re
        content = skill_file.read_text()
        match = re.search(r"used_by:.*?tasks:(.*?)(?:\n\w|\n##|\Z)", content, re.DOTALL)
        if match:
            return re.findall(r"-\s*(TASK_\w+)", match.group(1))
    except Exception:
        pass
    return []
