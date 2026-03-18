"""
Agent Prompt Construction

Builds system prompts and task prompts for work agents.
Extracts prompt templates and helper functions from work_core.

Contains:
- AGENT_SYSTEM_PROMPT: Base system prompt for work agents
- build_agent_prompt: Constructs full task prompt with context
- get_learnings_content: Loads global learnings for injection
- split_docs_to_read: Separates existing from missing docs
- _detect_github_issue_number: Finds GitHub issue from git history

DOCS: docs/agents/PATTERNS_Agent_System.md
"""

import re
import subprocess
from pathlib import Path
from typing import Any, Dict, List, Optional


# =============================================================================
# AGENT SYSTEM PROMPT
# =============================================================================


def get_agent_system_prompt(name: str, target_dir: Path) -> str:
    """
    Load full agent system prompt from .mind/actors/{name}/.

    Combines:
    1. Root system prompt from CLAUDE.md (shared by all agents)
    2. Actor-specific prompt from .mind/actors/{name}/CLAUDE.md

    Args:
        name: Agent name (e.g., "witness", "fixer")
        target_dir: Project root directory

    Returns:
        Combined system prompt content

    Raises:
        FileNotFoundError: If actor file doesn't exist (fail loud)
    """
    import logging
    logger = logging.getLogger(__name__)

    parts = []

    # 1. Load root CLAUDE.md system prompt (no fallback — fail loud)
    claude_path = target_dir / "CLAUDE.md"
    if claude_path.exists():
        parts.append(claude_path.read_text())

    # 2. Load actor-specific prompt from .mind/actors/{name}/
    name_lower = name.lower()
    actor_dir = target_dir / ".mind" / "actors" / name_lower

    # Try CLAUDE.md, GEMINI.md, AGENTS.md in order
    actor_path = None
    for filename in ["CLAUDE.md", "AGENTS.md", "GEMINI.md"]:
        candidate = actor_dir / filename
        if candidate.exists():
            actor_path = candidate
            break

    if not actor_path:
        raise FileNotFoundError(
            f"Actor prompt not found in: {actor_dir}/\n"
            f"Create .mind/actors/{name_lower}/CLAUDE.md to define the {name} agent."
        )

    parts.append(f"\n\n---\n\n# Agent: {name.capitalize()}\n\n")
    parts.append(actor_path.read_text())

    return "".join(parts)


# =============================================================================
# LEARNINGS LOADER
# =============================================================================

def get_learnings_content(target_dir: Path) -> str:
    """
    Load learnings from GLOBAL_LEARNINGS.md.

    Args:
        target_dir: Project root directory

    Returns:
        Formatted learnings content to append to system prompt,
        or empty string if no learnings file exists.
    """
    views_dir = target_dir / ".mind" / "views"
    global_learnings = views_dir / "GLOBAL_LEARNINGS.md"

    if global_learnings.exists():
        content = global_learnings.read_text()
        if "## Learnings" in content and content.count("\n") > 10:
            return "\n\n---\n\n# GLOBAL LEARNINGS (apply to ALL tasks)\n" + content
    return ""


# =============================================================================
# DOC SPLITTING HELPER
# =============================================================================

def split_docs_to_read(docs_to_read: List[str], target_dir: Path) -> tuple:
    """
    Split docs into existing and missing paths relative to target_dir.

    Args:
        docs_to_read: List of doc paths to check
        target_dir: Project root directory

    Returns:
        Tuple of (existing_docs, missing_docs) as lists of paths
    """
    existing = []
    missing = []
    for doc in docs_to_read:
        if not doc:
            continue
        doc_path = Path(doc)
        candidate = doc_path if doc_path.is_absolute() else (target_dir / doc_path)
        if candidate.exists():
            existing.append(doc)
        else:
            missing.append(doc)
    return existing, missing


# =============================================================================
# GITHUB ISSUE DETECTION
# =============================================================================

def _detect_github_issue_number(target_dir: Path, max_commits: int = 5) -> Optional[int]:
    """
    Detect a GitHub issue number from the last few commit messages.

    Scans recent git commits for #N patterns to find an associated
    GitHub issue number for commit message references.

    Args:
        target_dir: Project root directory
        max_commits: How many recent commits to scan (default: 5)

    Returns:
        GitHub issue number if found, None otherwise
    """
    try:
        result = subprocess.run(
            ["git", "log", f"-{max_commits}", "--pretty=%s"],
            cwd=target_dir,
            capture_output=True,
            text=True,
            timeout=5,
        )
        if result.returncode != 0:
            return None
        for line in result.stdout.splitlines():
            match = re.search(r"#(\d+)", line)
            if match:
                return int(match.group(1))
    except Exception:
        return None
    return None


# =============================================================================
# PROMPT BUILDER
# =============================================================================

def build_agent_prompt(
    problem: Any,  # DoctorIssue - detected problem
    instructions: Dict[str, Any],
    target_dir: Path,
    github_issue_number: Optional[int] = None,
) -> str:
    """
    Build the full prompt for the work agent.

    Combines:
    - Problem metadata (type, severity)
    - View instructions
    - Docs to read (existing and missing)
    - GitHub issue reference (if any)
    - Completion instructions

    Args:
        problem: DoctorIssue with task_type, severity, path
        instructions: Dict with 'view', 'docs_to_read', 'prompt' keys
        target_dir: Project root directory
        github_issue_number: Optional GitHub issue to reference in commits

    Returns:
        Full prompt string for the work agent
    """
    existing_docs, missing_docs = split_docs_to_read(instructions["docs_to_read"], target_dir)
    docs_list = "\n".join(f"- {d}" for d in existing_docs) or "- (no docs found)"
    missing_section = ""
    if missing_docs:
        missing_list = "\n".join(f"- {d}" for d in missing_docs)
        missing_section = f"""
## Missing Docs at Prompt Time
{missing_list}

If any missing docs should exist, locate the correct paths before proceeding.
"""

    if github_issue_number is None:
        github_issue_number = _detect_github_issue_number(target_dir)

    github_section = ""
    if github_issue_number:
        github_section = f"""
## GitHub Issue
This fix is tracked by GitHub issue #{github_issue_number}.
When committing, include "Closes #{github_issue_number}" in your commit message.
"""

    return f"""# mind Work Task

## Problem Type: {problem.task_type}
## Severity: {problem.severity}
{github_section}
## VIEW to Follow
Load and follow: `.mind/views/{instructions['view']}`

## Docs to Read FIRST (before any changes)
{docs_list}
{missing_section}

{instructions['prompt']}

## After Completion
1. Commit your changes with a descriptive message using a type prefix (e.g., "fix:", "docs:", "refactor:"){f' and include "Closes #{github_issue_number}"' if github_issue_number else ''}
2. Update `.mind/state/SYNC_Project_State.md` with:
   - What you fixed
   - Files created/modified
   - Any issues encountered
"""
