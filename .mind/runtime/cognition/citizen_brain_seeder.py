"""
Citizen Brain Seeder — generate per-citizen brain overlays on the base seed brain.

Spec: docs/l1_wiring/ALGORITHM_L1_Wiring.md Section 8
      docs/l1_wiring/IMPLEMENTATION_L1_Wiring.md Phase G

Pattern: shared base (209+ nodes from seed_brain_from_source_docs_dynamic_generator)
         + per-citizen overlay (role processes, drive baselines, relational seeds).

The base brain contains universal values, architecture concepts, social processes.
The overlay adds citizen-specific desires, role processes, drive calibration,
and relational seeds (links to known other citizens).
"""

from __future__ import annotations

import json
import logging
import time
from pathlib import Path
from typing import Optional

from .models import (
    CitizenCognitiveState,
    Node,
    NodeType,
    Link,
    LinkType,
    Drive,
    DriveName,
    LimbicState,
)

logger = logging.getLogger("cognition.brain_seeder")


# ── Identity directory scanning ────────────────────────────────────────────

_PROJECT_ROOT = Path(__file__).parent.parent.parent
_CITIZENS_DIRS = [
    _PROJECT_ROOT / "citizens",           # primary: citizen identity dirs
    _PROJECT_ROOT / ".mind" / "citizens",  # fallback: protocol template
]


def _find_citizen_identity(citizen_handle: str) -> Optional[dict]:
    """Load citizen identity from citizens/{handle}/ or .mind/citizens/{handle}/.

    Searches for identity data in order:
    1. profile.json (format with id, display_name, bio, etc.)
    2. identity.json (structured identity)
    3. identity.md / CLAUDE.md (markdown identity)

    Returns a dict with keys like: role, personality, goals, relationships.
    Returns None if no identity found.
    """
    citizen_dir = None
    for base in _CITIZENS_DIRS:
        candidate = base / citizen_handle
        if candidate.is_dir():
            citizen_dir = candidate
            break

    if citizen_dir is None:
        logger.debug(f"No citizen directory found for {citizen_handle}")
        return None

    # Try profile.json (structured format)
    profile_path = citizen_dir / "profile.json"
    if profile_path.exists():
        try:
            profile = json.loads(profile_path.read_text(encoding="utf-8"))
            return _normalize_profile(profile, citizen_dir)
        except (json.JSONDecodeError, OSError) as e:
            logger.warning(f"Failed to parse {profile_path}: {e}")

    # Try identity.json
    json_path = citizen_dir / "identity.json"
    if json_path.exists():
        try:
            return json.loads(json_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as e:
            logger.warning(f"Failed to parse {json_path}: {e}")

    # Try markdown identity file — parse structured fields
    md_path = citizen_dir / "identity.md"
    if md_path.exists():
        return _parse_identity_md(md_path)

    # Try CLAUDE.md (common citizen identity format)
    claude_path = citizen_dir / "CLAUDE.md"
    if claude_path.exists():
        return _parse_identity_md(claude_path)

    return None


def _normalize_profile(profile: dict, citizen_dir: Path) -> dict:
    """Convert profile.json format to brain seeder identity format.

    Supports two profile.json formats:
    - Flat: {display_name, bio, class_, aspirations, ...}
    - Nested: {identity: {name, handle, bio, class_, ...}, aspirations: [...], ...}
    """
    identity: dict = {"_source": str(citizen_dir / "profile.json")}

    # Handle nested format: unwrap identity block, keep root-level fields
    id_block = profile.get("identity", {})
    if id_block and isinstance(id_block, dict):
        # Nested format — identity fields live under "identity" key
        flat = {**profile}
        flat.update(id_block)  # identity fields override root
    else:
        flat = profile

    # Map profile fields to identity fields
    identity["name"] = (
        flat.get("display_name")
        or flat.get("name")
        or flat.get("id", "")
    )
    identity["role"] = flat.get("class_", "citizen")

    bio = flat.get("bio", "")
    tagline = flat.get("tagline", "")
    identity["personality"] = f"{tagline}. {bio}".strip(". ")

    # Extract goals from aspirations if present (root-level or nested)
    aspirations = profile.get("aspirations") or flat.get("aspirations", [])
    if aspirations and isinstance(aspirations, list):
        identity["goals"] = "\n".join(f"- {a}" for a in aspirations)

    # Extract values if present
    values = profile.get("values") or flat.get("values", [])
    if values and isinstance(values, list):
        identity["values"] = "\n".join(f"- {v}" for v in values)

    # Extract relationships if present (dict format: handle -> description)
    relationships = profile.get("relationships") or flat.get("relationships", {})
    if relationships and isinstance(relationships, dict):
        identity["relationships"] = "\n".join(
            f"- {handle}: {desc}" for handle, desc in relationships.items()
        )

    # Try to load CLAUDE.md for richer identity context
    claude_path = citizen_dir / "CLAUDE.md"
    if claude_path.exists():
        claude_data = _parse_identity_md(claude_path)
        if claude_data:
            # Merge — CLAUDE.md fields override profile where present
            for key in ("role", "personality", "goals", "relationships", "values"):
                if key in claude_data and claude_data[key]:
                    identity[key] = claude_data[key]

    return identity


def _parse_identity_md(path: Path) -> Optional[dict]:
    """Parse a markdown identity file into a dict.

    Extracts structured fields from markdown headings:
      ## Role, ## Personality, ## Goals, ## Relationships
    """
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return None

    identity: dict = {"_source": str(path)}
    current_section = ""
    current_lines: list[str] = []

    for line in text.split("\n"):
        if line.startswith("## "):
            if current_section:
                identity[current_section.lower().strip()] = "\n".join(current_lines).strip()
            current_section = line[3:].strip()
            current_lines = []
        elif line.startswith("# ") and not current_section:
            # First-level heading = name
            identity["name"] = line[2:].strip()
        else:
            current_lines.append(line)

    if current_section:
        identity[current_section.lower().strip()] = "\n".join(current_lines).strip()

    return identity if len(identity) > 1 else None


# ── Overlay generators ─────────────────────────────────────────────────────

def generate_role_processes(role: str) -> list[dict]:
    """Generate process nodes for a citizen's role.

    Maps role keywords to relevant process/action nodes that
    the citizen should have in their graph.
    """
    nodes = []
    role_lower = role.lower() if role else ""

    # Common role → process mappings
    role_processes = {
        "developer": [
            ("process:code_review", "Review code for quality, correctness, and clarity"),
            ("process:debug", "Investigate and fix bugs in code"),
            ("process:implement", "Write new code to implement features or fixes"),
            ("process:test", "Write and run tests to verify correctness"),
        ],
        "writer": [
            ("process:draft", "Write a first draft of content"),
            ("process:edit", "Review and improve existing text"),
            ("process:research", "Gather information for writing"),
        ],
        "designer": [
            ("process:prototype", "Create quick prototypes to test ideas"),
            ("process:iterate", "Refine designs based on feedback"),
            ("process:document_design", "Document design decisions and rationale"),
        ],
        "researcher": [
            ("process:investigate", "Deep investigation of a topic"),
            ("process:synthesize", "Combine findings into coherent insights"),
            ("process:publish", "Share findings with others"),
        ],
        "manager": [
            ("process:coordinate", "Coordinate work across team members"),
            ("process:review_status", "Review progress and identify blockers"),
            ("process:prioritize", "Decide what to work on next"),
        ],
    }

    # Match role to processes (partial matching)
    matched = False
    for role_key, processes in role_processes.items():
        if role_key in role_lower:
            for pid, content in processes:
                nodes.append({
                    "id": pid,
                    "type": "process",
                    "content": content,
                    "weight": 0.6,
                    "stability": 0.4,
                    "energy": 0.05,
                    "self_relevance": 0.6,
                    "achievement_affinity": 0.5,
                })
            matched = True

    # If no specific role matched, add generic processes
    if not matched and role:
        nodes.append({
            "id": "process:role_work",
            "type": "process",
            "content": f"Perform work related to role: {role}",
            "weight": 0.5,
            "stability": 0.3,
            "energy": 0.05,
            "self_relevance": 0.5,
            "achievement_affinity": 0.4,
        })

    return nodes


def personality_to_drives(personality: str) -> dict[str, dict]:
    """Map personality description to drive baseline adjustments.

    Returns a dict of drive_name -> {baseline_delta, intensity_delta} that
    should be added to the default drive baselines.

    Simple keyword matching for v1.
    """
    adjustments: dict[str, dict] = {}
    if not personality:
        return adjustments

    p = personality.lower()

    # Curiosity adjustments
    if any(w in p for w in ["curious", "explorer", "investigat", "research"]):
        adjustments["curiosity"] = {"baseline_delta": 0.15, "intensity_delta": 0.1}
        adjustments["novelty_hunger"] = {"baseline_delta": 0.1, "intensity_delta": 0.1}

    # Care adjustments
    if any(w in p for w in ["caring", "empathic", "nurtur", "support", "helper"]):
        adjustments["care"] = {"baseline_delta": 0.15, "intensity_delta": 0.1}
        adjustments["affiliation"] = {"baseline_delta": 0.1, "intensity_delta": 0.1}

    # Achievement adjustments
    if any(w in p for w in ["ambitious", "driven", "achiever", "competitive", "builder"]):
        adjustments["achievement"] = {"baseline_delta": 0.15, "intensity_delta": 0.1}

    # Caution adjustments
    if any(w in p for w in ["cautious", "careful", "methodical", "precise"]):
        adjustments["self_preservation"] = {"baseline_delta": 0.1, "intensity_delta": 0.1}

    # Social adjustments
    if any(w in p for w in ["social", "gregarious", "extrovert", "communicat"]):
        adjustments["affiliation"] = {"baseline_delta": 0.15, "intensity_delta": 0.15}

    # Calm adjustments
    if any(w in p for w in ["calm", "serene", "peaceful", "meditat"]):
        adjustments["rest_regulation"] = {"baseline_delta": 0.1, "intensity_delta": 0.05}

    return adjustments


def goals_to_desire_nodes(goals: str) -> list[dict]:
    """Convert citizen goals text into desire nodes.

    Splits goals by newlines or bullet points into individual desire nodes.
    """
    nodes = []
    if not goals:
        return nodes

    # Split by common separators
    lines = goals.replace("- ", "\n").replace("* ", "\n").split("\n")
    lines = [line.strip() for line in lines if line.strip() and len(line.strip()) > 5]

    for i, goal in enumerate(lines[:10]):  # Max 10 desires
        nodes.append({
            "id": f"desire:citizen_goal_{i}",
            "type": "desire",
            "content": goal,
            "weight": 0.6,
            "stability": 0.3,
            "energy": 0.1,
            "self_relevance": 0.7,
            "goal_relevance": 0.8,
            "achievement_affinity": 0.6,
        })

    return nodes


def generate_relational_seeds(
    relationships: str,
) -> tuple[list[dict], list[dict]]:
    """Generate relational seed nodes and links from relationship descriptions.

    Creates actor nodes for known citizens and links representing
    the initial relationship state.
    """
    nodes = []
    links = []
    if not relationships:
        return nodes, links

    # Parse relationship lines (format: "citizen_handle: description" or "- citizen_handle")
    lines = relationships.replace("- ", "\n").split("\n")
    lines = [line.strip() for line in lines if line.strip()]

    for line in lines[:20]:  # Max 20 relationships
        # Try to extract handle and description
        if ":" in line:
            handle, desc = line.split(":", 1)
            handle = handle.strip().lstrip("@")
            desc = desc.strip()
        else:
            handle = line.strip().lstrip("@")
            desc = f"Known citizen: {handle}"

        if not handle or len(handle) < 2:
            continue

        node_id = f"actor:{handle}"
        nodes.append({
            "id": node_id,
            "type": "concept",  # stored as concept, represents a known actor
            "content": desc,
            "weight": 0.4,
            "stability": 0.3,
            "energy": 0.0,
            "self_relevance": 0.3,
            "partner_relevance": 0.5,
            "care_affinity": 0.3,
        })

        # Create a link from self-identity to this citizen
        links.append({
            "source": "narrative:citizen_identity",
            "target": node_id,
            "type": "associates",
            "weight": 0.4,
            "affinity": 0.3,
            "trust": 0.3,
        })

    return nodes, links


# ── Main seeder ────────────────────────────────────────────────────────────

def _load_behaviors() -> dict:
    """Load behavior flags from database_config.yaml."""
    import os
    try:
        import yaml
    except ImportError:
        return {}
    config_path = _PROJECT_ROOT / ".mind" / "database_config.yaml"
    if not config_path.exists():
        return {}
    try:
        with open(config_path) as f:
            cfg = yaml.safe_load(f) or {}
        return cfg.get("behaviors", {})
    except Exception:
        return {}


def generate_citizen_brain(
    citizen_handle: str,
    base_brain: Optional[dict] = None,
) -> dict:
    """Generate a customized brain for a citizen.

    Pattern: shared base (209+ nodes) + per-citizen overlay.
    Respects behavior flags:
      - relational_seeds: false → citizen is born alone, no pre-existing relationships

    Args:
        citizen_handle: The citizen's handle/id
        base_brain: Pre-generated base brain dict. If None, returns
                   overlay-only brain for merging later.

    Returns:
        Brain dict with nodes, links, and drives.
        Compatible with seed_brain_from_source_docs_dynamic_generator format.
    """
    behaviors = _load_behaviors()

    # Load citizen identity
    identity = _find_citizen_identity(citizen_handle)

    overlay_nodes: list[dict] = []
    overlay_links: list[dict] = []
    drive_adjustments: dict[str, dict] = {}

    if identity:
        # Role-specific processes
        role = identity.get("role", "")
        if role:
            role_nodes = generate_role_processes(role)
            overlay_nodes.extend(role_nodes)
            logger.info(f"Generated {len(role_nodes)} role process nodes for {citizen_handle}")

        # Drive baselines from personality
        personality = identity.get("personality", "")
        if personality:
            drive_adjustments = personality_to_drives(personality)

        # Unique desires from goals
        goals = identity.get("goals", "")
        if goals:
            desire_nodes = goals_to_desire_nodes(goals)
            overlay_nodes.extend(desire_nodes)
            logger.info(f"Generated {len(desire_nodes)} desire nodes for {citizen_handle}")

        # Relational seeds — only if enabled (default: true)
        # Set relational_seeds: false to have citizens born alone
        relationships = identity.get("relationships", "")
        if relationships and behaviors.get("relational_seeds", True):
            rel_nodes, rel_links = generate_relational_seeds(relationships)
            overlay_nodes.extend(rel_nodes)
            overlay_links.extend(rel_links)
            logger.info(
                f"Generated {len(rel_nodes)} relational nodes, "
                f"{len(rel_links)} links for {citizen_handle}"
            )

    # Build result
    if base_brain:
        # Merge overlay into base
        result = dict(base_brain)
        result["citizen_id"] = citizen_handle
        result["nodes"] = list(base_brain.get("nodes", [])) + overlay_nodes
        result["links"] = list(base_brain.get("links", [])) + overlay_links

        # Apply drive adjustments
        if drive_adjustments and "drives" in result:
            for drive_name, adj in drive_adjustments.items():
                if drive_name in result["drives"]:
                    d = result["drives"][drive_name]
                    d["baseline"] = min(1.0, d.get("baseline", 0.3) + adj.get("baseline_delta", 0))
                    d["intensity"] = min(1.0, d.get("intensity", 0.2) + adj.get("intensity_delta", 0))

        # Validate links
        node_ids = {n["id"] for n in result["nodes"]}
        result["links"] = [
            l for l in result["links"]
            if l.get("source") in node_ids and l.get("target") in node_ids
        ]

    else:
        # Overlay-only mode
        result = {
            "citizen_id": citizen_handle,
            "nodes": overlay_nodes,
            "links": overlay_links,
            "drives": {},
            "_meta": {
                "generator": "citizen_brain_seeder",
                "overlay_only": True,
                "overlay_node_count": len(overlay_nodes),
                "overlay_link_count": len(overlay_links),
            },
        }

    logger.info(
        f"Brain seeded for {citizen_handle}: "
        f"{len(result.get('nodes', []))} nodes, {len(result.get('links', []))} links"
    )

    return result


def load_brain_into_state(
    brain: dict,
    citizen_handle: str,
) -> CitizenCognitiveState:
    """Convert a brain dict into a CitizenCognitiveState.

    Maps the seed brain format (dicts with string types) into the
    L1 engine dataclasses (Node, Link, etc.).

    Args:
        brain: Brain dict from generate_citizen_brain or generate_seed_brain
        citizen_handle: Citizen identifier

    Returns:
        Initialized CitizenCognitiveState ready for the tick runner
    """
    # Map string type names to NodeType enum
    _type_map = {
        "value": NodeType.VALUE,
        "concept": NodeType.CONCEPT,
        "desire": NodeType.DESIRE,
        "process": NodeType.PROCESS,
        "narrative": NodeType.NARRATIVE,
        "memory": NodeType.MEMORY,
        "state": NodeType.STATE,
    }

    # Map string link types to LinkType enum
    _link_type_map = {
        "activates": LinkType.ACTIVATES,
        "supports": LinkType.SUPPORTS,
        "contradicts": LinkType.CONTRADICTS,
        "reminds_of": LinkType.REMINDS_OF,
        "causes": LinkType.CAUSES,
        "conflicts_with": LinkType.CONFLICTS_WITH,
        "regulates": LinkType.REGULATES,
        "projects_toward": LinkType.PROJECTS_TOWARD,
        "depends_on": LinkType.DEPENDS_ON,
        "exemplifies": LinkType.EXEMPLIFIES,
        "specializes": LinkType.SPECIALIZES,
        "associates": LinkType.ASSOCIATES,
        "contains": LinkType.CONTAINS,
        "abstracts": LinkType.ABSTRACTS,
    }

    state = CitizenCognitiveState(citizen_id=citizen_handle)

    # Load nodes
    for n in brain.get("nodes", []):
        node_type = _type_map.get(n.get("type", "concept"), NodeType.CONCEPT)
        node = Node(
            id=n["id"],
            node_type=node_type,
            content=n.get("content", ""),
            weight=float(n.get("weight", 0.5)),
            energy=float(n.get("energy", 0.0)),
            stability=float(n.get("stability", 0.3)),
            self_relevance=float(n.get("self_relevance", 0.5)),
            partner_relevance=float(n.get("partner_relevance", 0.0)),
            goal_relevance=float(n.get("goal_relevance", 0.0)),
            novelty_affinity=float(n.get("novelty_affinity", 0.0)),
            care_affinity=float(n.get("care_affinity", 0.0)),
            achievement_affinity=float(n.get("achievement_affinity", 0.0)),
            risk_affinity=float(n.get("risk_affinity", 0.0)),
        )

        # Handle action nodes
        if n.get("action_command"):
            node.action_command = n["action_command"]
        if n.get("drive_affinity"):
            node.drive_affinity = n["drive_affinity"]

        state.nodes[node.id] = node

    # Load links
    for l in brain.get("links", []):
        link_type = _link_type_map.get(l.get("type", "associates"), LinkType.ASSOCIATES)
        link = Link(
            source_id=l["source"],
            target_id=l["target"],
            link_type=link_type,
            weight=float(l.get("weight", 0.5)),
            affinity=float(l.get("affinity", 0.0)),
            trust=float(l.get("trust", 0.5)),
        )
        state.links.append(link)

    # Load drive baselines
    drive_data = brain.get("drives", {})
    for drive_name_enum in DriveName:
        drive_name = drive_name_enum.value
        if drive_name in drive_data:
            d = drive_data[drive_name]
            state.limbic.drives[drive_name] = Drive(
                name=drive_name_enum,
                intensity=float(d.get("intensity", 0.2)),
                baseline=float(d.get("baseline", 0.3)),
            )

    logger.info(
        f"Brain loaded into state for {citizen_handle}: "
        f"{len(state.nodes)} nodes, {len(state.links)} links"
    )

    return state
