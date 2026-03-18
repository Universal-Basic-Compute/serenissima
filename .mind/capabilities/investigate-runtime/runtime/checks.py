"""
Health Checks: investigate-runtime

Decorator-based health checks for runtime issue detection.
Source: capabilities/investigate-runtime/runtime/checks.py
Installed to: .mind/capabilities/investigate-runtime/runtime/checks.py
"""

import re
from pathlib import Path
from datetime import datetime, timedelta

# Import from capability runtime infrastructure
try:
    from runtime.capability import check, Signal, triggers
except ImportError:
    # Fallback: when running from .mind/capabilities after init
    from runtime.capability import check, Signal, triggers


# =============================================================================
# CONSTANTS
# =============================================================================

ERROR_PATTERNS = [
    re.compile(r'\bERROR\b', re.IGNORECASE),
    re.compile(r'\bCRITICAL\b', re.IGNORECASE),
    re.compile(r'\bException\b'),
    re.compile(r'\bTraceback\b'),
]

HOOK_LOCATIONS = [
    ".git/hooks",
    "scripts/hooks",
    ".husky",
]

# Standard git hooks that might exist
KNOWN_HOOKS = {
    "pre-commit", "post-commit", "pre-push", "post-merge",
    "pre-rebase", "post-checkout", "post-rewrite",
    "prepare-commit-msg", "commit-msg",
}


# =============================================================================
# HEALTH CHECKS
# =============================================================================

@check(
    id="log_error_detection",
    triggers=[
        triggers.stream.on_error(".mind/logs/*.log"),
        triggers.cron.hourly(),
    ],
    on_problem="LOG_ERROR",
    task="TASK_investigate_error",
)
def log_error_detection(ctx) -> dict:
    """
    H1: Detect ERROR entries in log files.

    Returns CRITICAL if 5+ errors found.
    Returns DEGRADED if any errors found.
    Returns HEALTHY if no errors.
    """
    log_dir = Path(".mind/logs")

    if not log_dir.exists():
        return Signal.healthy()

    # Calculate cutoff time (24 hours ago)
    cutoff = datetime.now() - timedelta(hours=24)

    errors = []

    for log_file in log_dir.glob("*.log"):
        try:
            content = log_file.read_text()
            lines = content.split('\n')

            for i, line in enumerate(lines):
                for pattern in ERROR_PATTERNS:
                    if pattern.search(line):
                        # Extract timestamp if possible
                        error_entry = {
                            "log_path": str(log_file),
                            "line": i + 1,
                            "message": line[:500],  # Truncate long lines
                        }

                        # Look for stack trace in following lines
                        stack_lines = []
                        for j in range(i + 1, min(i + 20, len(lines))):
                            if lines[j].startswith(' ') or lines[j].startswith('\t'):
                                stack_lines.append(lines[j])
                            else:
                                break

                        if stack_lines:
                            error_entry["stack_trace"] = '\n'.join(stack_lines)

                        errors.append(error_entry)
                        break  # One match per line is enough

        except Exception:
            continue

    # Deduplicate by message signature
    seen_signatures = set()
    unique_errors = []
    for error in errors:
        # Create signature from first 100 chars of message
        signature = error["message"][:100]
        if signature not in seen_signatures:
            seen_signatures.add(signature)
            unique_errors.append(error)

    if not unique_errors:
        return Signal.healthy()

    if len(unique_errors) >= 5:
        return Signal.critical(errors=unique_errors, count=len(unique_errors))

    return Signal.degraded(errors=unique_errors, count=len(unique_errors))


@check(
    id="hook_documentation",
    triggers=[
        triggers.init.after_scan(),
        triggers.file.on_create(".git/hooks/*"),
    ],
    on_problem="HOOK_UNDOC",
    task="TASK_document_hook",
)
def hook_documentation(ctx) -> dict:
    """
    H2: Detect undocumented hooks.

    Returns DEGRADED if any hooks lack documentation.
    Returns HEALTHY if all hooks documented.
    """
    project_root = Path(ctx.project_root) if hasattr(ctx, 'project_root') else Path(".")

    # Find all hooks
    hooks = []
    for hook_dir in HOOK_LOCATIONS:
        hook_path = project_root / hook_dir
        if hook_path.exists() and hook_path.is_dir():
            for hook_file in hook_path.iterdir():
                if hook_file.is_file():
                    # Check if executable (on Unix) or has no extension
                    is_hook = (
                        hook_file.stat().st_mode & 0o111  # Has execute bit
                        or hook_file.suffix == ""         # No extension
                        or hook_file.stem in KNOWN_HOOKS  # Known hook name
                    )
                    if is_hook and not hook_file.name.endswith('.sample'):
                        hooks.append(hook_file)

    if not hooks:
        return Signal.healthy()

    # Find BEHAVIORS docs
    behaviors_docs = list(project_root.glob("docs/**/BEHAVIORS*.md"))
    behaviors_content = ""
    for doc in behaviors_docs:
        try:
            behaviors_content += doc.read_text().lower()
        except Exception:
            continue

    # Check which hooks are documented
    undocumented = []
    for hook in hooks:
        hook_name = hook.stem

        # Check if hook is mentioned in any BEHAVIORS doc
        if hook_name.lower() not in behaviors_content:
            undocumented.append({
                "hook_path": str(hook),
                "hook_name": hook_name,
                "trigger_type": _infer_trigger_type(hook_name),
            })

    if not undocumented:
        return Signal.healthy()

    return Signal.degraded(hooks=undocumented, count=len(undocumented))


def _infer_trigger_type(hook_name: str) -> str:
    """Infer when a hook triggers based on its name."""
    if hook_name.startswith("pre-"):
        return f"Before {hook_name[4:]}"
    elif hook_name.startswith("post-"):
        return f"After {hook_name[5:]}"
    elif hook_name.startswith("prepare-"):
        return f"Preparing {hook_name[8:]}"
    else:
        return "Unknown trigger"


# =============================================================================
# REGISTRY (collected by MCP loader)
# =============================================================================

CHECKS = [
    log_error_detection,
    hook_documentation,
]
