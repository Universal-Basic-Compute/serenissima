"""
Health Checks: maintain-links

Decorator-based health checks for code-doc link integrity.
Source: capabilities/maintain-links/runtime/checks.py
Installed to: .mind/capabilities/maintain-links/runtime/checks.py
"""

import re
from pathlib import Path

# Import from capability runtime infrastructure
# Located at: runtime/capability/ (MCP code, not copied to .mind/)
try:
    from runtime.capability import check, Signal, triggers
except ImportError:
    # Fallback: when running from .mind/capabilities after init
    # The runtime module should be available via PYTHONPATH
    from runtime.capability import check, Signal, triggers


# =============================================================================
# CONSTANTS
# =============================================================================

IMPL_PATTERNS = [
    r'IMPL:\s*([^\s\n`]+)',
    r'implements:\s*([^\s\n`]+)',
]

CODE_EXTENSIONS = {'.py', '.ts', '.js', '.go', '.rs', '.java', '.cpp', '.c', '.h'}


# =============================================================================
# HEALTH CHECKS
# =============================================================================

@check(
    id="impl_link_validity",
    triggers=[
        triggers.file.on_modify("docs/**/*.md"),
        triggers.file.on_move("**/*.py"),
        triggers.file.on_move("**/*.ts"),
        triggers.file.on_move("**/*.js"),
        triggers.cron.daily(),
    ],
    on_problem="BROKEN_IMPL_LINK",
    task="TASK_fix_impl_link",
)
def impl_link_validity(ctx) -> dict:
    """
    H1: Check if IMPL: markers point to existing files.

    Returns CRITICAL if 4+ broken links or critical doc affected.
    Returns DEGRADED if 1-3 broken links.
    Returns HEALTHY if all links resolve.
    """
    # Get docs to check
    if ctx.file_path and ctx.file_path.endswith('.md'):
        doc_paths = [Path(ctx.file_path)]
    else:
        doc_paths = list(Path("docs").rglob("*.md"))

    broken_links = []

    for doc_path in doc_paths:
        try:
            content = doc_path.read_text()
        except Exception:
            continue

        # Parse IMPL: markers
        for pattern in IMPL_PATTERNS:
            for match in re.finditer(pattern, content):
                impl_path = match.group(1)

                # Resolve path relative to project root
                target = Path(impl_path)

                if not target.exists():
                    broken_links.append({
                        "doc": str(doc_path),
                        "marker": impl_path,
                    })

    if not broken_links:
        return Signal.healthy()

    # Check severity
    is_critical = (
        len(broken_links) >= 4 or
        any("OBJECTIVES" in b["doc"] or "PATTERNS" in b["doc"] for b in broken_links)
    )

    if is_critical:
        return Signal.critical(
            broken_links=broken_links,
            count=len(broken_links)
        )

    return Signal.degraded(
        broken_links=broken_links,
        count=len(broken_links)
    )


@check(
    id="orphan_doc_detection",
    triggers=[
        triggers.file.on_delete("**/*.py"),
        triggers.file.on_delete("**/*.ts"),
        triggers.file.on_delete("**/*.js"),
        triggers.cron.daily(),
    ],
    on_problem="ORPHAN_DOCS",
    task="TASK_fix_orphan_docs",
)
def orphan_doc_detection(ctx) -> dict:
    """
    H2: Detect docs without code references.

    A doc is orphan if:
    - No IMPL: markers point to existing files, AND
    - No code file has DOCS: marker pointing to it

    Returns CRITICAL if 5+ orphans.
    Returns DEGRADED if 1-4 orphans.
    Returns HEALTHY if no orphans.
    """
    # Build map of code DOCS: references
    code_refs = set()
    for ext in CODE_EXTENSIONS:
        for code_path in Path(".").rglob(f"*{ext}"):
            try:
                content = code_path.read_text()
                # Check first 15 lines for DOCS: marker
                lines = content.split('\n')[:15]
                for line in lines:
                    if 'DOCS:' in line:
                        match = re.search(r'DOCS:\s*([^\s]+)', line)
                        if match:
                            code_refs.add(match.group(1))
            except Exception:
                continue

    # Check each doc
    orphans = []

    for doc_path in Path("docs").rglob("*.md"):
        # Skip archive
        if "archive" in str(doc_path):
            continue

        try:
            content = doc_path.read_text()
        except Exception:
            continue

        # Check for valid IMPL: links
        has_valid_impl = False
        for pattern in IMPL_PATTERNS:
            for match in re.finditer(pattern, content):
                impl_path = match.group(1)
                if Path(impl_path).exists():
                    has_valid_impl = True
                    break
            if has_valid_impl:
                break

        # Check for code DOCS: references
        doc_str = str(doc_path)
        has_code_ref = doc_str in code_refs or doc_str.lstrip("./") in code_refs

        # If neither, it's orphan
        if not has_valid_impl and not has_code_ref:
            orphans.append({
                "doc": doc_str,
                "reason": "no_valid_references"
            })

    if not orphans:
        return Signal.healthy()

    if len(orphans) >= 5:
        return Signal.critical(
            orphans=orphans,
            count=len(orphans)
        )

    return Signal.degraded(
        orphans=orphans,
        count=len(orphans)
    )


# =============================================================================
# REGISTRY (collected by MCP loader)
# =============================================================================

CHECKS = [
    impl_link_validity,
    orphan_doc_detection,
]
