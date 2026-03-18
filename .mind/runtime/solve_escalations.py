# DOCS: docs/cli/core/PATTERNS_Why_CLI_Over_Copy.md
"""
Scan the repo for escalation markers and report them.
"""

from pathlib import Path
from typing import List, Tuple

from .file_utils import load_ignore_patterns, should_ignore_path, is_binary_file

ESCALATION_TAGS = (
    "@mind:doctor:escalation",
    "@mind:escalation",
)

PROPOSITION_TAGS = (
    "@mind:doctor:proposition",
    "@mind:proposition",
)

TODO_TAGS = (
    "@mind:doctor:todo",
    "@mind:todo",
)
IGNORED_FILES = {
    "mind/solve_escalations.py",
    "mind/init_cmd.py",
    "docs/cli/core/ALGORITHM_CLI_Command_Execution_Logic/ALGORITHM_Overview.md",
}


def _is_log_file(path: Path) -> bool:
    return path.suffix == ".log" or path.name.endswith(".log")


def _extract_priority_from_content(content: str, marker_tags: Tuple[str, ...]) -> int:
    """Extract priority from marker YAML. Returns 0-10 (higher = more urgent)."""
    import re
    for tag in marker_tags:
        if tag not in content:
            continue
        start = content.find(tag)
        end = min(start + 500, len(content))
        section = content[start:end]

        priority_match = re.search(r'priority:\s*(\d+|low|medium|high|critical)', section, re.IGNORECASE)
        if priority_match:
            val = priority_match.group(1).lower()
            if val.isdigit():
                return int(val)
            return {"critical": 10, "high": 8, "medium": 5, "low": 2}.get(val, 5)
    return 5  # Default priority


def _extract_title_from_content(content: str, marker_tags: Tuple[str, ...]) -> str:
    """Extract title from marker YAML."""
    import re
    for tag in marker_tags:
        if tag not in content:
            continue
        start = content.find(tag)
        end = min(start + 500, len(content))
        section = content[start:end]

        title_match = re.search(r'(?:title|task_name):\s*["\']?([^"\'\n]+)', section)
        if title_match:
            return title_match.group(1).strip()[:60]
    return ""


def _count_unresolved_markers(content: str, marker_tags: Tuple[str, ...]) -> int:
    """Count markers that are NOT marked as resolved."""
    import re
    count = 0
    for tag in marker_tags:
        # Find all occurrences of this tag
        start = 0
        while True:
            pos = content.find(tag, start)
            if pos == -1:
                break
            # Look at the next 500 chars for status: resolved
            end = min(pos + 500, len(content))
            section = content[pos:end]
            # Check if this marker is resolved
            if not re.search(r'status:\s*resolved', section, re.IGNORECASE):
                count += 1
            start = pos + 1
    return count


def _find_markers_in_files(target_dir: Path, marker_tags: Tuple[str, ...], task_type: str) -> List[Tuple[int, int, str, str, str]]:
    """Return file paths with given markers, ordered by priority (highest first).

    Returns: List of (priority_sort, occurrences, path, task_type, title)
    """
    ignore_patterns = load_ignore_patterns(target_dir)
    matches: List[Tuple[int, int, str, str, str]] = []

    # Directories to ignore (templates, skills contain instructional examples)
    ignore_dirs = {
        "templates/",  # Template sources - markers apply to .claude/ and .mind/ copies
        ".claude/skills/",  # Skill docs contain marker examples, not actual escalations
        ".mind/skills/",  # Same for .mind skills
        ".mind/views",
    }

    for path in target_dir.rglob("*"):
        if not path.is_file():
            continue
        try:
            rel_path = str(path.relative_to(target_dir))
        except ValueError:
            continue

        # Skip ignore dirs
        if any(rel_path.startswith(d) for d in ignore_dirs):
            continue

        if rel_path in IGNORED_FILES:
            continue
        if should_ignore_path(path, ignore_patterns, target_dir):
            continue
        if _is_log_file(path):
            continue
        if is_binary_file(path):
            continue

        try:
            content = path.read_text(errors="ignore")
        except Exception:
            continue

        if not any(tag in content for tag in marker_tags):
            continue

        # Count only unresolved markers (skip status: resolved)
        occurrences = _count_unresolved_markers(content, marker_tags)
        if occurrences == 0:
            continue  # All markers in this file are resolved

        # Extract priority from YAML (0-10, higher = more urgent)
        priority = _extract_priority_from_content(content, marker_tags)
        title = _extract_title_from_content(content, marker_tags)

        # Sort key: -priority (so higher priority comes first), then by occurrences
        matches.append((-priority, -occurrences, rel_path, task_type, title))

    matches.sort()
    return matches


def solve_special_markers_command(target_dir: Path) -> int:
    """CLI entrypoint for `mind solve-markers` to find and report special markers."""
    escalation_matches = _find_markers_in_files(target_dir, ESCALATION_TAGS, "ESCALATION")
    proposition_matches = _find_markers_in_files(target_dir, PROPOSITION_TAGS, "PROPOSITION")
    todo_matches = _find_markers_in_files(target_dir, TODO_TAGS, "TODO")

    all_matches = sorted(escalation_matches + proposition_matches + todo_matches)

    if not all_matches:
        print("No special markers found.")
        return 0

    print("Special markers (priority order, highest first):\n")

    # Group by priority ranges
    critical = [(m, -m[0]) for m in all_matches if -m[0] >= 7]
    important = [(m, -m[0]) for m in all_matches if 4 <= -m[0] < 7]
    normal = [(m, -m[0]) for m in all_matches if -m[0] < 4]

    if critical:
        print("## CRITICAL (priority 7-10) — blocking\n")
        for idx, ((neg_prio, occ, path, task_type, title), prio) in enumerate(critical, 1):
            display = f"{title}" if title else path
            print(f"  {idx}. [{task_type}] p{prio}: {display}")
            if title:
                print(f"      {path}")
        print()

    if important:
        print("## IMPORTANT (priority 4-6) — needs attention\n")
        for idx, ((neg_prio, occ, path, task_type, title), prio) in enumerate(important, 1):
            display = f"{title}" if title else path
            print(f"  {idx}. [{task_type}] p{prio}: {display}")
            if title:
                print(f"      {path}")
        print()

    if normal:
        print("## NORMAL (priority 1-3) — when time permits\n")
        for idx, ((neg_prio, occ, path, task_type, title), prio) in enumerate(normal, 1):
            display = f"{title}" if title else path
            print(f"  {idx}. [{task_type}] p{prio}: {display}")
            if title:
                print(f"      {path}")
        print()

    print("\nReview markers by priority. For escalations, provide decisions. For propositions, approve or reject.")
    print("For todos, complete the task. After resolving, fill the `response` field or remove the marker.")
    return 0
