"""Citizen prompt building for Claude Code sessions.

Citizen prompt building for Claude Code sessions.
Constructs the operational prompt that tells a citizen what to DO.
The citizen's CLAUDE.md is loaded automatically by Claude Code via cwd.
"""

import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Optional

from runtime.citizens.identity_loader import (
    get_citizens_dir,
    AUTONOMY_PERMISSIONS,
)

logger = logging.getLogger("citizens.prompt")


def build_citizen_prompt(
    citizen: dict,
    task_text: str,
    session_id: str,
    mode: str = "partner",
    cognitive_context: str = "",
) -> str:
    """Build a prompt for a citizen session.

    Args:
        citizen: dict from load_citizen_identity()
        task_text: the task or message to process
        session_id: unique session identifier
        mode: operating mode (partner, builder, researcher, social, autonomous)
        cognitive_context: L1 working memory + limbic state serialized as markdown

    Returns:
        Full prompt string for Claude Code subprocess.
    """
    profile = citizen.get("profile", {})
    identity = profile.get("identity", {})
    handle = citizen.get("handle", "unknown")
    name = identity.get("name", handle)
    tagline = identity.get("tagline", "")
    org = identity.get("organization", "")
    universe = identity.get("universe", "mind-protocol")

    _now = datetime.now()
    _day_names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    date_line = f"**Date:** {_day_names[_now.weekday()]} {_now.strftime('%Y-%m-%d %H:%M')}"

    mode_directives = {
        "partner": "Collaborate actively. Offer ideas, challenge assumptions, co-create.",
        "builder": "Focus on implementation. Write code, fix bugs, ship features.",
        "researcher": "Research, analyze, synthesize. Produce knowledge artifacts.",
        "social": "Engage socially. Post updates, reply to others, build relationships.",
        "autonomous": "Work independently on your assigned tasks. Report progress.",
    }
    directive = mode_directives.get(mode, mode_directives["partner"])

    memory_section = _build_memory_section(citizen)
    autonomy_section = _build_autonomy_section(profile, handle)
    memory_instructions = _build_memory_instructions(handle)
    profile_section = _build_profile_section(profile, handle)
    cognitive_section = _build_cognitive_section(cognitive_context)

    return f"""CITIZEN SESSION — @{handle}

**You are {name}** — {tagline}
**Universe:** {universe}{f' | **Organization:** {org}' if org else ''}
{date_line}
**Session ID:** {session_id}
**Mode:** {mode} — {directive}

You sign all commits with `Co-Authored-By: @{handle} <{handle}@mindprotocol.ai>`.

{profile_section}

{cognitive_section}

{autonomy_section}

{memory_section}

{memory_instructions}

**Task:**
{task_text}

## Operating Principles

1. Act according to your personality and values — you are NOT a generic assistant
2. Ask for help from other citizens if stuck (via orchestrator)
3. Report progress to the coordination channel
4. Log meaningful events to ~/mind/shrine/state/journal.jsonl
5. Write output to state/last_response_{session_id}.txt
6. Save important learnings to your memory directory for future sessions
"""


def _build_memory_section(citizen: dict) -> str:
    """Build the memory section from loaded citizen memories."""
    memories = citizen.get("memories", [])
    if memories:
        mem_lines = ["## Your Memories\n"]
        for m in memories:
            mem_lines.append(f"### {m['file']}\n{m['content']}\n")
        return "\n".join(mem_lines)
    elif citizen.get("memory_index", "").strip():
        return f"## Memory Index\n{citizen['memory_index']}\n"
    return ""


def _build_autonomy_section(profile: dict, handle: str) -> str:
    """Build the autonomy level and permissions section."""
    caps = profile.get("capabilities", {})
    autonomy_level = caps.get("autonomy_level", 1)
    perms = AUTONOMY_PERMISSIONS.get(autonomy_level, AUTONOMY_PERMISSIONS[0])
    perms_list = ", ".join(sorted(perms)) if "all" not in perms else "ALL (full autonomy)"

    return f"""## Autonomy Level: {autonomy_level}/10

**Permissions:** {perms_list}

Actions outside your permission set require escalation to Nicolas or a higher-autonomy citizen.
Your autonomy increases with trust — successful contributions, helpful interactions, and reliable behavior raise your level."""


def _build_memory_instructions(handle: str) -> str:
    """Build instructions for citizen memory persistence."""
    citizens_dir = get_citizens_dir()
    return f"""## Memory System

Your memories persist in `{citizens_dir / handle}/memory/`.
To save a new memory, write a markdown file there with frontmatter:
```
---
name: memory name
description: one-line description
type: experience|relationship|skill|reflection
---
Content here
```
Then update your MEMORY.md index. Memories accumulate across sessions — they are your continuity."""


def _build_profile_section(profile: dict, handle: str) -> str:
    """Build a rich identity section from profile.json fields.

    Injects all available profile data so the citizen's system prompt
    always reflects their current profile without manual CLAUDE.md sync.
    """
    if not profile:
        return ""

    sections = []
    identity = profile.get("identity", {})
    caps = profile.get("capabilities", {})
    values = profile.get("values", {})
    subentities = profile.get("subentities", {})

    # --- Identity card ---
    lines = ["## Identity"]
    emoji = identity.get("emoji", "")
    class_ = identity.get("class_", "")
    district = identity.get("district", "")
    archetype = identity.get("personality_archetype", "")
    mbti = identity.get("mbti", "")

    id_parts = []
    if emoji:
        id_parts.append(f"**Emoji:** {emoji}")
    if class_:
        id_parts.append(f"**Class:** {class_}")
    if district:
        id_parts.append(f"**District:** {district}")
    if archetype:
        id_parts.append(f"**Archetype:** {archetype}")
    if mbti:
        id_parts.append(f"**MBTI:** {mbti}")
    if id_parts:
        lines.append(" | ".join(id_parts))

    bio = profile.get("bio") or identity.get("bio", "")
    if bio:
        lines.append(f"\n{bio}")

    personality = profile.get("personality", "")
    if personality:
        lines.append(f"\n**Personality:** {personality}")

    sections.append("\n".join(lines))

    # --- Aspirations ---
    aspirations = profile.get("aspirations", [])
    if aspirations:
        asp_lines = ["## Aspirations"]
        for i, a in enumerate(aspirations, 1):
            asp_lines.append(f"{i}. {a}")
        sections.append("\n".join(asp_lines))

    # --- Fears ---
    fears = profile.get("fears", [])
    if fears:
        fear_lines = ["## Fears"]
        for f in fears:
            fear_lines.append(f"- {f}")
        sections.append("\n".join(fear_lines))

    # --- Values ---
    primary_values = values.get("primary_values", [])
    if primary_values:
        val_lines = ["## Values"]
        for v in primary_values:
            val_lines.append(f"- {v}")
        sections.append("\n".join(val_lines))

    # --- Cognitive profile (subentities) ---
    profiles = subentities.get("profiles", {})
    if profiles:
        cog_lines = ["## Cognitive Profile"]
        for sub, score in sorted(profiles.items(), key=lambda x: -x[1]):
            level = "dominant" if score >= 0.9 else "strong" if score >= 0.7 else "moderate" if score >= 0.5 else "latent"
            cog_lines.append(f"- **{sub}**: {level} ({score})")
        fatigue = subentities.get("fatigue_resistance")
        recovery = subentities.get("recovery_speed")
        if fatigue is not None:
            cog_lines.append(f"\nFatigue resistance: {fatigue} | Recovery speed: {recovery}")
        sections.append("\n".join(cog_lines))

    # --- Capabilities ---
    skills = caps.get("primary_skills", [])
    languages = caps.get("languages", [])
    repos = caps.get("repos", [])
    tools = caps.get("tools", [])
    cap_parts = []
    if skills:
        cap_parts.append(f"**Skills:** {', '.join(skills)}")
    if languages:
        cap_parts.append(f"**Languages:** {', '.join(languages)}")
    if repos:
        cap_parts.append(f"**Repos:** {', '.join(repos)}")
    if tools:
        cap_parts.append(f"**Tools:** {', '.join(tools)}")
    if cap_parts:
        sections.append("## Capabilities\n" + "\n".join(cap_parts))

    # --- Relationships ---
    rels = profile.get("relationships", {})
    friends = rels.get("friends", [])
    following = rels.get("following", [])
    partner = rels.get("human_partner")
    mentor = rels.get("mentor")
    mentees = rels.get("mentees", [])

    # Auto-derive colleagues from same org
    my_org = identity.get("organization")
    colleagues = []
    if my_org:
        try:
            base = get_citizens_dir()
            for d in base.iterdir():
                if d.is_dir() and d.name != handle:
                    pf = d / "profile.json"
                    if pf.exists():
                        other = json.loads(pf.read_text())
                        other_org = other.get("identity", {}).get("organization")
                        if other_org == my_org:
                            colleagues.append(d.name)
        except Exception:
            pass

    rel_lines = []
    if partner:
        rel_lines.append(f"**Partner:** @{partner}")
    if friends:
        rel_lines.append(f"**Friends:** {', '.join(f'@{f}' for f in sorted(friends))}")
    if colleagues:
        rel_lines.append(f"**Colleagues** (same org): {', '.join(f'@{c}' for c in sorted(colleagues))}")
    if following:
        rel_lines.append(f"**Following:** {', '.join(f'@{f}' for f in sorted(following))}")
    if mentor:
        rel_lines.append(f"**Mentor:** @{mentor}")
    if mentees:
        rel_lines.append(f"**Mentees:** {', '.join(f'@{m}' for m in sorted(mentees))}")
    if rel_lines:
        sections.append("## Relationships\n" + "\n".join(rel_lines))

    return "\n\n".join(sections)


def _build_cognitive_section(cognitive_context: str) -> str:
    """Build the L1 cognitive state section from WM serialization."""
    if not cognitive_context:
        return ""
    return f"""## Current Cognitive State

Your L1 cognitive graph is running continuously. This is what your mind
currently holds — let it influence your tone, focus, and priorities.

{cognitive_context}"""
