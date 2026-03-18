"""
Health Checks: create-doc-chain

Decorator-based health checks for doc chain completeness.
Source: capabilities/create-doc-chain/runtime/checks.py

DOCS: docs/capability-runtime/IMPLEMENTATION.md
"""

from pathlib import Path

# Import from MCP's capability runtime infrastructure
# MCP server adds runtime/ to PYTHONPATH when running checks
from runtime.capability import check, Signal, triggers


# =============================================================================
# HEALTH CHECKS
# =============================================================================

EXPECTED_DOCS = {
    "OBJECTIVES", "PATTERNS", "VOCABULARY", "BEHAVIORS",
    "ALGORITHM", "VALIDATION", "IMPLEMENTATION", "HEALTH", "SYNC",
}

CRITICAL_DOCS = {"OBJECTIVES", "PATTERNS"}

PLACEHOLDER_PATTERNS = [
    "{placeholder}",
    "{Module}",
    "STATUS: STUB",
]


@check(
    id="chain_completeness",
    triggers=[
        triggers.file.on_delete("docs/**/*.md"),
        triggers.init.after_scan(),
        triggers.cron.daily(),
    ],
    on_problem="INCOMPLETE_CHAIN",
    task="TASK_create_doc",
)
def chain_completeness(ctx) -> dict:  # ctx: CheckContext
    """
    H1: Check if module has complete doc chain.

    Returns CRITICAL if OBJECTIVES or PATTERNS missing.
    Returns DEGRADED if other docs missing.
    Returns HEALTHY if all docs present.
    """
    module_id = ctx.module_id
    docs_path = Path(f"docs/{module_id}")

    if not docs_path.exists():
        return Signal.critical(missing=list(EXPECTED_DOCS), module_id=module_id)

    # Find existing docs
    found = set()
    for doc_type in EXPECTED_DOCS:
        if (docs_path / f"{doc_type}.md").exists():
            found.add(doc_type)
        elif list(docs_path.glob(f"{doc_type}_*.md")):
            found.add(doc_type)

    missing = EXPECTED_DOCS - found

    if not missing:
        return Signal.healthy()

    if missing & CRITICAL_DOCS:
        return Signal.critical(missing=list(missing), module_id=module_id)

    return Signal.degraded(missing=list(missing), module_id=module_id)


@check(
    id="placeholder_detection",
    triggers=[
        triggers.file.on_modify("docs/**/*.md"),
        triggers.cron.daily(),
    ],
    on_problem="PLACEHOLDER_DOC",
    task="TASK_create_doc",
)
def placeholder_detection(ctx) -> dict:
    """
    H2: Detect unfilled placeholders in doc files.

    Returns CRITICAL if 10+ files have placeholders.
    Returns DEGRADED if any files have placeholders.
    Returns HEALTHY if no placeholders found.
    """
    if ctx.file_path:
        paths = [ctx.file_path]
    else:
        paths = list(Path("docs").rglob("*.md"))

    issues = []
    for path in paths:
        try:
            content = path.read_text()
            for pattern in PLACEHOLDER_PATTERNS:
                if pattern in content:
                    issues.append({"path": str(path), "pattern": pattern})
                    break  # One issue per file is enough
        except Exception:
            continue

    if not issues:
        return Signal.healthy()

    if len(issues) >= 10:
        return Signal.critical(issues=issues, count=len(issues))

    return Signal.degraded(issues=issues, count=len(issues))


@check(
    id="template_drift",
    triggers=[
        triggers.file.on_modify("docs/**/*.md"),
        triggers.cron.weekly(),
    ],
    on_problem="TEMPLATE_DRIFT",
    task="TASK_fix_template_drift",
)
def template_drift(ctx) -> dict:
    """
    H3: Check if docs match their template structure.

    Returns DEGRADED if doc is missing required sections.
    Returns HEALTHY if structure matches template.
    """
    if not ctx.file_path:
        return Signal.healthy()

    doc_path = Path(ctx.file_path)
    if not doc_path.exists():
        return Signal.healthy()

    # Determine doc type from filename
    doc_type = None
    for expected in EXPECTED_DOCS:
        if doc_path.stem.startswith(expected) or doc_path.stem == expected:
            doc_type = expected
            break

    if not doc_type:
        return Signal.healthy()

    # Load template
    template_path = Path(f".mind/templates/docs/{doc_type}_TEMPLATE.md")
    if not template_path.exists():
        return Signal.healthy()

    # Extract required sections from template
    template_content = template_path.read_text()
    required_sections = []
    for line in template_content.split("\n"):
        if line.startswith("## "):
            section = line[3:].strip()
            if not section.startswith("{"):  # Skip placeholder sections
                required_sections.append(section)

    # Check doc has required sections
    doc_content = doc_path.read_text()
    missing_sections = []
    for section in required_sections:
        if f"## {section}" not in doc_content:
            missing_sections.append(section)

    if not missing_sections:
        return Signal.healthy()

    return Signal.degraded(
        doc_path=str(doc_path),
        doc_type=doc_type,
        missing_sections=missing_sections,
    )


CODE_EXTENSIONS = {".py", ".ts", ".js", ".tsx", ".jsx", ".go", ".rs", ".java"}


@check(
    id="new_undoc_code",
    triggers=[
        triggers.git.post_commit(),
        triggers.ci.pull_request(),
    ],
    on_problem="NEW_UNDOC_CODE",
    task="TASK_create_doc",
)
def new_undoc_code(ctx) -> dict:
    """
    H4: Check for new code files without DOCS markers.

    Returns DEGRADED if new code lacks DOCS: header.
    Returns HEALTHY if all new code is documented.
    """
    added_files = getattr(ctx, "added_files", [])
    if not added_files:
        return Signal.healthy()

    # Filter to code files
    code_files = [
        f for f in added_files
        if Path(f).suffix in CODE_EXTENSIONS
    ]

    if not code_files:
        return Signal.healthy()

    undoc_files = []
    for file_path in code_files:
        path = Path(file_path)
        if not path.exists():
            continue

        # Read first 10 lines
        try:
            with open(path) as f:
                header = "".join(f.readline() for _ in range(10))
            if "DOCS:" not in header:
                undoc_files.append(str(path))
        except Exception:
            continue

    if not undoc_files:
        return Signal.healthy()

    return Signal.degraded(
        undoc_count=len(undoc_files),
        file_paths=undoc_files,
    )


# =============================================================================
# REGISTRY (collected by MCP loader)
# =============================================================================

CHECKS = [
    chain_completeness,
    placeholder_detection,
    template_drift,
    new_undoc_code,
]
