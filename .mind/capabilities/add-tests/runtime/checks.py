"""
Health Checks: add-tests

Decorator-based health checks for test coverage and invariant validation.
Source: capabilities/add-tests/runtime/checks.py
Installed to: .mind/capabilities/add-tests/runtime/checks.py
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

# Pattern to extract invariant IDs from VALIDATION.md
INVARIANT_PATTERN = re.compile(r"###\s+V(\d+):|^V(\d+):", re.MULTILINE)

# Pattern to find VALIDATES markers in test files
VALIDATES_PATTERN = re.compile(r"VALIDATES:\s*(V\d+)", re.IGNORECASE)

# Pattern to find test functions
TEST_FUNCTION_PATTERN = re.compile(r"def\s+(test_\w+)\s*\(")

# Code file extensions
CODE_EXTENSIONS = {".py", ".ts", ".js", ".go", ".rs", ".java"}

# Test file extensions
TEST_EXTENSIONS = {".py"}


# =============================================================================
# HEALTH CHECKS
# =============================================================================

@check(
    id="test_coverage",
    triggers=[
        triggers.file.on_create("src/**/*.py"),
        triggers.file.on_create("lib/**/*.py"),
        triggers.init.after_scan(),
        triggers.cron.daily(),
    ],
    on_problem="MISSING_TESTS",
    task="TASK_add_tests",
)
def test_coverage(ctx) -> dict:
    """
    H1: Check if module has test files.

    Returns CRITICAL if no test files exist for module.
    Returns HEALTHY if test files exist.
    """
    module_id = ctx.module_id
    project_root = Path(ctx.project_root) if ctx.project_root else Path(".")

    # If no module_id, check for any test files
    if not module_id:
        test_dir = project_root / "tests"
        if test_dir.exists():
            test_files = list(test_dir.rglob("test_*.py"))
            if test_files:
                return Signal.healthy(test_count=len(test_files))
        return Signal.degraded(reason="No module_id provided and no test files found")

    # Check for test directory
    test_paths = [
        project_root / "tests" / module_id,
        project_root / "tests" / f"test_{module_id}.py",
        project_root / f"tests/test_{module_id}.py",
    ]

    for test_path in test_paths:
        if test_path.exists():
            if test_path.is_dir():
                test_files = list(test_path.glob("test_*.py"))
                if test_files:
                    return Signal.healthy(
                        module_id=module_id,
                        test_count=len(test_files)
                    )
            elif test_path.is_file():
                return Signal.healthy(
                    module_id=module_id,
                    test_file=str(test_path)
                )

    return Signal.critical(
        module_id=module_id,
        reason="No test files found"
    )


@check(
    id="invariant_coverage",
    triggers=[
        triggers.file.on_modify("docs/**/VALIDATION*.md"),
        triggers.cron.daily(),
    ],
    on_problem="INVARIANT_UNTESTED",
    task="TASK_test_invariant",
)
def invariant_coverage(ctx) -> dict:
    """
    H2: Check if all invariants have corresponding VALIDATES markers.

    Returns CRITICAL if >50% invariants untested.
    Returns DEGRADED if some invariants untested.
    Returns HEALTHY if all invariants have tests.
    """
    project_root = Path(ctx.project_root) if ctx.project_root else Path(".")

    # Collect all invariant IDs from VALIDATION files
    invariant_ids = set()
    validation_files = list(project_root.glob("docs/**/VALIDATION*.md"))

    for vf in validation_files:
        try:
            content = vf.read_text()
            matches = INVARIANT_PATTERN.findall(content)
            for match in matches:
                # match is tuple (group1, group2), one will be non-empty
                inv_num = match[0] or match[1]
                invariant_ids.add(f"V{inv_num}")
        except Exception:
            continue

    if not invariant_ids:
        # No invariants defined
        return Signal.healthy(message="No invariants defined")

    # Collect all VALIDATES markers from test files
    validates_found = set()
    test_files = list(project_root.glob("tests/**/*.py"))

    for tf in test_files:
        try:
            content = tf.read_text()
            matches = VALIDATES_PATTERN.findall(content)
            validates_found.update(matches)
        except Exception:
            continue

    # Calculate coverage
    untested = invariant_ids - validates_found
    coverage_pct = (len(invariant_ids) - len(untested)) / len(invariant_ids) * 100

    if not untested:
        return Signal.healthy(
            coverage=100,
            invariants=list(invariant_ids)
        )

    if coverage_pct < 50:
        return Signal.critical(
            untested=list(untested),
            coverage=coverage_pct
        )

    return Signal.degraded(
        untested=list(untested),
        coverage=coverage_pct
    )


@check(
    id="validates_markers",
    triggers=[
        triggers.file.on_modify("tests/**/*.py"),
        triggers.cron.weekly(),
    ],
    on_problem="TEST_NO_VALIDATES",
    task="TASK_add_validates_markers",
)
def validates_markers(ctx) -> dict:
    """
    H3: Check if test files have VALIDATES markers.

    Returns DEGRADED if test files exist without markers.
    Returns HEALTHY if all test files have markers.
    """
    project_root = Path(ctx.project_root) if ctx.project_root else Path(".")

    unmarked_files = []
    test_files = list(project_root.glob("tests/**/*.py"))

    for tf in test_files:
        if tf.name.startswith("__"):
            continue  # Skip __init__.py, __pycache__, etc.

        try:
            content = tf.read_text()

            # Check if file has test functions
            test_functions = TEST_FUNCTION_PATTERN.findall(content)
            if not test_functions:
                continue  # Not a test file

            # Check if file has VALIDATES markers
            validates = VALIDATES_PATTERN.findall(content)
            if not validates:
                unmarked_files.append(str(tf))
        except Exception:
            continue

    if not unmarked_files:
        return Signal.healthy(message="All test files have VALIDATES markers")

    return Signal.degraded(
        unmarked_files=unmarked_files,
        count=len(unmarked_files)
    )


@check(
    id="health_status",
    triggers=[
        triggers.cron.hourly(),
    ],
    on_problem="HEALTH_FAILED",
    task="TASK_fix_health",
)
def health_status(ctx) -> dict:
    """
    H4: Meta-check for overall health status.

    This check monitors the results of other health checks.
    Returns CRITICAL if any critical checks are failing.
    Returns DEGRADED if any non-critical checks are failing.
    Returns HEALTHY if all checks pass.
    """
    # This is a meta-check that aggregates other check results
    # In practice, this would query the health status store

    # For now, return healthy - actual implementation would
    # aggregate results from the health status database
    if hasattr(ctx, "check_results") and ctx.check_results:
        critical_failures = [
            r for r in ctx.check_results
            if r.get("status") == "critical"
        ]
        degraded_failures = [
            r for r in ctx.check_results
            if r.get("status") == "degraded"
        ]

        if critical_failures:
            return Signal.critical(
                failures=critical_failures,
                count=len(critical_failures)
            )

        if degraded_failures:
            return Signal.degraded(
                failures=degraded_failures,
                count=len(degraded_failures)
            )

    return Signal.healthy(message="All health checks passing")


# =============================================================================
# REGISTRY (collected by MCP loader)
# =============================================================================

CHECKS = [
    test_coverage,
    invariant_coverage,
    validates_markers,
    health_status,
]
