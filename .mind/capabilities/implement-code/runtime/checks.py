"""
Health Checks: implement-code

Decorator-based health checks for implementation completeness.
Source: capabilities/implement-code/runtime/checks.py
Installed to: .mind/capabilities/implement-code/runtime/checks.py
"""

import ast
import re
from datetime import datetime, timedelta
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

STUB_PATTERNS = [
    r"^\s*pass\s*$",
    r"^\s*\.\.\.\s*$",
    r"raise\s+NotImplementedError",
    r"raise\s+NotImplemented\b",
]

INCOMPLETE_MARKERS = [
    r"#\s*TODO\b",
    r"#\s*FIXME\b",
    r"#\s*XXX\b",
    r"#\s*HACK\b",
    r"//\s*TODO\b",
    r"//\s*FIXME\b",
]

CODE_EXTENSIONS = {".py", ".ts", ".js", ".tsx", ".jsx"}

STALENESS_THRESHOLD_DAYS = 7


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================


def is_stub_body(body_lines: list[str]) -> bool:
    """Check if function body represents a stub."""
    # Filter out docstrings and comments
    code_lines = []
    in_docstring = False
    docstring_char = None

    for line in body_lines:
        stripped = line.strip()

        # Skip empty lines
        if not stripped:
            continue

        # Handle docstrings
        if not in_docstring:
            if stripped.startswith('"""') or stripped.startswith("'''"):
                docstring_char = stripped[:3]
                if stripped.count(docstring_char) >= 2:
                    # Single-line docstring
                    continue
                in_docstring = True
                continue
        else:
            if docstring_char in stripped:
                in_docstring = False
            continue

        # Skip comments
        if stripped.startswith("#"):
            continue

        code_lines.append(stripped)

    # Empty body after filtering = stub
    if not code_lines:
        return True

    # Check against stub patterns
    body_text = "\n".join(code_lines)
    for pattern in STUB_PATTERNS:
        if re.search(pattern, body_text, re.MULTILINE):
            return True

    return False


def extract_functions_from_ast(tree: ast.AST) -> list[dict]:
    """Extract function definitions from AST."""
    functions = []

    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            functions.append(
                {
                    "name": node.name,
                    "lineno": node.lineno,
                    "end_lineno": getattr(node, "end_lineno", node.lineno + 1),
                    "body": node.body,
                }
            )

    return functions


def get_docs_marker(file_path: Path) -> str | None:
    """Extract DOCS: marker from file header."""
    try:
        content = file_path.read_text()
        lines = content.split("\n")[:10]

        for line in lines:
            match = re.search(r"DOCS:\s*(.+)", line)
            if match:
                return match.group(1).strip()
    except Exception:
        pass

    return None


def get_last_updated(doc_path: Path) -> datetime | None:
    """Extract LAST_UPDATED from doc file."""
    try:
        content = doc_path.read_text()
        match = re.search(r"LAST_UPDATED:\s*(\d{4}-\d{2}-\d{2})", content)
        if match:
            return datetime.strptime(match.group(1), "%Y-%m-%d")
    except Exception:
        pass

    return None


def get_git_mtime(file_path: Path) -> datetime | None:
    """Get last modification time from git."""
    import subprocess

    try:
        result = subprocess.run(
            ["git", "log", "-1", "--format=%ai", str(file_path)],
            capture_output=True,
            text=True,
            cwd=file_path.parent,
        )
        if result.returncode == 0 and result.stdout.strip():
            # Parse git date format: 2025-12-29 10:30:00 -0500
            date_str = result.stdout.strip().split()[0]
            return datetime.strptime(date_str, "%Y-%m-%d")
    except Exception:
        pass

    # Fallback to file mtime
    try:
        return datetime.fromtimestamp(file_path.stat().st_mtime)
    except Exception:
        return None


# =============================================================================
# HEALTH CHECKS
# =============================================================================


@check(
    id="stub_detection",
    triggers=[
        triggers.file.on_modify("**/*.py"),
        triggers.init.after_scan(),
        triggers.cron.daily(),
    ],
    on_problem="STUB_IMPL",
    task="TASK_implement_stub",
)
def stub_detection(ctx) -> dict:  # ctx: CheckContext
    """
    H1: Detect stub implementations in Python files.

    Returns CRITICAL if > 5 stubs found.
    Returns DEGRADED if any stubs found.
    Returns HEALTHY if no stubs.
    """
    if ctx.file_path:
        paths = [Path(ctx.file_path)]
    else:
        paths = list(Path(".").rglob("*.py"))

    stub_functions = []

    for path in paths:
        # Skip test files and migrations
        if "test" in str(path).lower() or "migration" in str(path).lower():
            continue

        try:
            content = path.read_text()
            tree = ast.parse(content)
            lines = content.split("\n")

            for func in extract_functions_from_ast(tree):
                # Get function body lines
                body_start = func["lineno"]
                body_end = func["end_lineno"]
                body_lines = lines[body_start:body_end]

                if is_stub_body(body_lines):
                    stub_functions.append(
                        {
                            "file": str(path),
                            "function": func["name"],
                            "line": func["lineno"],
                        }
                    )

        except SyntaxError:
            continue
        except Exception:
            continue

    if not stub_functions:
        return Signal.healthy()

    if len(stub_functions) > 5:
        return Signal.critical(stubs=stub_functions, count=len(stub_functions))

    return Signal.degraded(stubs=stub_functions, count=len(stub_functions))


@check(
    id="incomplete_detection",
    triggers=[
        triggers.file.on_modify("**/*.{py,ts,js,tsx,jsx}"),
        triggers.cron.daily(),
    ],
    on_problem="INCOMPLETE_IMPL",
    task="TASK_complete_impl",
)
def incomplete_detection(ctx) -> dict:
    """
    H2: Detect TODO/FIXME markers indicating incomplete code.

    Returns CRITICAL if > 10 untracked markers.
    Returns DEGRADED if any markers found.
    Returns HEALTHY if no markers.
    """
    if ctx.file_path:
        paths = [Path(ctx.file_path)]
    else:
        paths = []
        for ext in CODE_EXTENSIONS:
            paths.extend(Path(".").rglob(f"*{ext}"))

    markers = []

    for path in paths:
        try:
            content = path.read_text()
            lines = content.split("\n")

            for lineno, line in enumerate(lines, 1):
                for pattern in INCOMPLETE_MARKERS:
                    if re.search(pattern, line, re.IGNORECASE):
                        # Extract marker text
                        marker_match = re.search(
                            r"(?:#|//)\s*(TODO|FIXME|XXX|HACK)[:\s]*(.*)",
                            line,
                            re.IGNORECASE,
                        )
                        marker_text = marker_match.group(2).strip() if marker_match else ""

                        markers.append(
                            {
                                "file": str(path),
                                "line": lineno,
                                "type": marker_match.group(1).upper() if marker_match else "TODO",
                                "text": marker_text[:100],  # Truncate
                            }
                        )
                        break  # One marker per line

        except Exception:
            continue

    if not markers:
        return Signal.healthy()

    if len(markers) > 10:
        return Signal.critical(markers=markers, count=len(markers))

    return Signal.degraded(markers=markers, count=len(markers))


@check(
    id="undoc_impl_detection",
    triggers=[
        triggers.file.on_create("docs/**/IMPLEMENTATION*.md"),
        triggers.init.after_scan(),
        triggers.cron.daily(),
    ],
    on_problem="UNDOC_IMPL",
    task="TASK_document_impl",
)
def undoc_impl_detection(ctx) -> dict:
    """
    H3: Detect IMPLEMENTATION.md without ALGORITHM.md.

    Returns DEGRADED if any IMPLEMENTATION lacks ALGORITHM.
    Returns HEALTHY if all IMPLEMENTATION have ALGORITHM.
    """
    docs_root = Path("docs")
    if not docs_root.exists():
        return Signal.healthy()

    undoc_modules = []

    # Find all IMPLEMENTATION files
    impl_files = list(docs_root.rglob("IMPLEMENTATION*.md"))

    for impl_file in impl_files:
        module_dir = impl_file.parent
        module_id = module_dir.name

        # Check for ALGORITHM.md
        algo_files = list(module_dir.glob("ALGORITHM*.md"))

        if not algo_files:
            undoc_modules.append(
                {
                    "module": module_id,
                    "impl_path": str(impl_file),
                    "reason": "No ALGORITHM.md",
                }
            )
        else:
            # Check if ALGORITHM is a stub
            algo_file = algo_files[0]
            try:
                content = algo_file.read_text()
                if (
                    "STATUS: STUB" in content
                    or "{placeholder}" in content
                    or len(content) < 200
                ):
                    undoc_modules.append(
                        {
                            "module": module_id,
                            "impl_path": str(impl_file),
                            "algo_path": str(algo_file),
                            "reason": "ALGORITHM.md is a stub",
                        }
                    )
            except Exception:
                continue

    if not undoc_modules:
        return Signal.healthy()

    return Signal.degraded(modules=undoc_modules, count=len(undoc_modules))


@check(
    id="stale_impl_detection",
    triggers=[
        triggers.hook.post_commit(),
        triggers.cron.daily(),
    ],
    on_problem="STALE_IMPL",
    task="TASK_update_impl_docs",
)
def stale_impl_detection(ctx) -> dict:
    """
    H4: Detect docs that are stale relative to code changes.

    Returns CRITICAL if any doc is > 30 days behind code.
    Returns DEGRADED if any doc is > 7 days behind code.
    Returns HEALTHY if all docs are synced.
    """
    stale_pairs = []
    max_staleness = 0

    # Get modified files from context or scan all
    modified_files = getattr(ctx, 'modified_files', []) or []
    if modified_files:
        code_files = [Path(f) for f in modified_files if Path(f).suffix in CODE_EXTENSIONS]
    else:
        code_files = []
        for ext in CODE_EXTENSIONS:
            code_files.extend(Path(".").rglob(f"*{ext}"))

    for code_file in code_files:
        # Get linked doc
        doc_marker = get_docs_marker(code_file)
        if not doc_marker:
            continue

        doc_path = Path(doc_marker)
        if not doc_path.exists():
            continue

        # Compare dates
        code_mtime = get_git_mtime(code_file)
        doc_updated = get_last_updated(doc_path)

        if not code_mtime:
            continue

        if not doc_updated:
            doc_updated = get_git_mtime(doc_path) or datetime.now() - timedelta(days=365)

        days_behind = (code_mtime - doc_updated).days

        if days_behind > STALENESS_THRESHOLD_DAYS:
            stale_pairs.append(
                {
                    "code_file": str(code_file),
                    "doc_file": str(doc_path),
                    "days_behind": days_behind,
                }
            )
            max_staleness = max(max_staleness, days_behind)

    if not stale_pairs:
        return Signal.healthy()

    if max_staleness > 30:
        return Signal.critical(
            stale=stale_pairs, count=len(stale_pairs), max_staleness=max_staleness
        )

    return Signal.degraded(
        stale=stale_pairs, count=len(stale_pairs), max_staleness=max_staleness
    )


# =============================================================================
# REGISTRY (collected by MCP loader)
# =============================================================================

CHECKS = [
    stub_detection,
    incomplete_detection,
    undoc_impl_detection,
    stale_impl_detection,
]
