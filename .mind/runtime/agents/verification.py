"""
Completion verification for work agents.

Verifies agent work before marking complete:
- File-level checks (patterns, existence)
- Command checks (tests, health)
- Membrane checks (graph queries)

On failure: restarts agent with --continue and detailed feedback.

LOOP PROTECTION:
- Max retries per task (default: 3)
- Max total retries per session (default: 10)
- Automatic escalation on max retries
- Session state tracking to detect oscillation

DOCS: docs/agents/PATTERNS_Agent_System.md
"""

import re
import subprocess
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Callable, Set


# Loop protection constants
MAX_RETRIES_PER_TASK = 3
MAX_TOTAL_SESSION_RETRIES = 10
OSCILLATION_DETECTION_WINDOW = 5  # Check last N results for oscillation


@dataclass
class VerificationSession:
    """Tracks verification session state to prevent infinite loops."""
    task_path: str
    task_type: str
    start_time: float = field(default_factory=time.time)
    retry_count: int = 0
    total_session_retries: int = 0
    failed_checks_history: List[Set[str]] = field(default_factory=list)
    escalated: bool = False
    todos_created: List[str] = field(default_factory=list)

    def record_attempt(self, failed_checks: List[str]) -> None:
        """Record a verification attempt."""
        self.retry_count += 1
        self.total_session_retries += 1
        self.failed_checks_history.append(set(failed_checks))

    def should_escalate(self) -> bool:
        """Check if we should escalate instead of retry."""
        if self.escalated:
            return False  # Already escalated

        # Hit per-problem retry limit
        if self.retry_count >= MAX_RETRIES_PER_TASK:
            return True

        # Hit session retry limit
        if self.total_session_retries >= MAX_TOTAL_SESSION_RETRIES:
            return True

        # Detect oscillation (same failures repeating)
        if len(self.failed_checks_history) >= OSCILLATION_DETECTION_WINDOW:
            recent = self.failed_checks_history[-OSCILLATION_DETECTION_WINDOW:]
            # If all recent failures are identical, we're stuck
            if all(r == recent[0] for r in recent):
                return True

        return False

    def get_escalation_reason(self) -> str:
        """Get reason for escalation."""
        if self.retry_count >= MAX_RETRIES_PER_TASK:
            return f"Max retries ({MAX_RETRIES_PER_TASK}) exceeded for this task"
        if self.total_session_retries >= MAX_TOTAL_SESSION_RETRIES:
            return f"Max session retries ({MAX_TOTAL_SESSION_RETRIES}) exceeded"
        if len(self.failed_checks_history) >= OSCILLATION_DETECTION_WINDOW:
            return "Oscillation detected - same checks failing repeatedly"
        return "Unknown escalation trigger"

    def mark_escalated(self) -> None:
        """Mark this session as escalated."""
        self.escalated = True

    def add_deferred_todo(self, description: str) -> None:
        """Track a todo created to defer work."""
        self.todos_created.append(description)


@dataclass
class VerificationCheck:
    """Definition of a single verification check."""
    name: str
    check_type: str  # file, command, membrane
    description: str
    action_on_fail: str
    membrane_protocol: Optional[str] = None
    # For file checks
    file_pattern: Optional[str] = None
    patterns_present: Optional[List[str]] = None
    patterns_absent: Optional[List[str]] = None
    # For command checks
    command: Optional[str] = None
    expect_exit_code: int = 0


@dataclass
class VerificationResult:
    """Result of running a verification check."""
    check_name: str
    check_type: str
    passed: bool
    message: str
    required_action: Optional[str] = None
    membrane_protocol: Optional[str] = None
    details: Dict[str, Any] = field(default_factory=dict)


# Verification checks by problem type
VERIFICATION_CHECKS: Dict[str, List[VerificationCheck]] = {
    "UNDOCUMENTED": [
        VerificationCheck(
            name="modules_yaml_entry",
            check_type="file",
            description="Module has entry in modules.yaml",
            action_on_fail="Add module to modules.yaml with docs: path",
        ),
        VerificationCheck(
            name="docs_ref_in_code",
            check_type="file",
            description="Code has DOCS: comment",
            patterns_present=["# DOCS:", "// DOCS:"],
            action_on_fail="Add '# DOCS:' comment to main source file",
        ),
        VerificationCheck(
            name="space_in_graph",
            check_type="membrane",
            description="Space node exists in graph",
            action_on_fail="Run procedure_start('define_space')",
            membrane_protocol="define_space",
        ),
        VerificationCheck(
            name="sync_narrative",
            check_type="membrane",
            description="SYNC narrative exists in graph",
            action_on_fail="Run procedure_start('update_sync')",
            membrane_protocol="update_sync",
        ),
    ],

    "STALE_SYNC": [
        VerificationCheck(
            name="last_updated_today",
            check_type="file",
            description="SYNC file has today's date in LAST_UPDATED",
            action_on_fail="Update LAST_UPDATED header to today",
        ),
        VerificationCheck(
            name="sync_narrative_updated",
            check_type="membrane",
            description="SYNC narrative updated in graph",
            action_on_fail="Run procedure_start('update_sync')",
            membrane_protocol="update_sync",
        ),
    ],

    "INCOMPLETE_CHAIN": [
        VerificationCheck(
            name="all_chain_files_exist",
            check_type="file",
            description="All doc chain files exist (OBJECTIVES, PATTERNS, etc.)",
            action_on_fail="Create missing doc files",
        ),
        VerificationCheck(
            name="chain_sections_valid",
            check_type="file",
            description="Each doc has CHAIN section with valid links",
            action_on_fail="Add/fix CHAIN sections",
        ),
        VerificationCheck(
            name="narratives_linked",
            check_type="membrane",
            description="Narrative nodes linked in graph",
            action_on_fail="Run procedure_start('create_doc_chain')",
            membrane_protocol="create_doc_chain",
        ),
    ],

    "NO_DOCS_REF": [
        VerificationCheck(
            name="docs_comment_present",
            check_type="file",
            description="File has DOCS: comment",
            patterns_present=["# DOCS:", "// DOCS:"],
            action_on_fail="Add DOCS: comment to file header",
        ),
        VerificationCheck(
            name="docs_path_valid",
            check_type="file",
            description="DOCS: path points to existing file",
            action_on_fail="Fix DOCS: path",
        ),
        VerificationCheck(
            name="thing_node_exists",
            check_type="membrane",
            description="Thing node exists for this file",
            action_on_fail="Run procedure_start('add_implementation')",
            membrane_protocol="add_implementation",
        ),
    ],

    "STUB_IMPL": [
        VerificationCheck(
            name="no_stub_markers",
            check_type="file",
            description="No stub markers in code",
            patterns_absent=[
                "raise NotImplementedError",
                "NotImplementedError()",
                "# TODO",
                "# FIXME",
                "pass  # stub",
            ],
            action_on_fail="Implement all stubs",
        ),
        VerificationCheck(
            name="tests_exist",
            check_type="file",
            description="Test file exists for module",
            action_on_fail="Create tests",
        ),
        VerificationCheck(
            name="tests_pass",
            check_type="command",
            description="Tests pass",
            command="pytest {test_path} -v --tb=short",
            action_on_fail="Fix failing tests",
        ),
        VerificationCheck(
            name="implementation_narrative",
            check_type="membrane",
            description="Implementation narrative in graph",
            action_on_fail="Run procedure_start('add_implementation')",
            membrane_protocol="add_implementation",
        ),
    ],

    "INCOMPLETE_IMPL": [
        VerificationCheck(
            name="no_empty_functions",
            check_type="file",
            description="No empty function bodies",
            action_on_fail="Implement empty functions",
        ),
        VerificationCheck(
            name="tests_pass",
            check_type="command",
            description="Tests pass",
            command="pytest {test_path} -v --tb=short",
            action_on_fail="Fix failing tests",
        ),
    ],

    "MONOLITH": [
        VerificationCheck(
            name="file_size_reduced",
            check_type="file",
            description="File under 500 lines or largest function under 200",
            action_on_fail="Extract more code to new files",
        ),
        VerificationCheck(
            name="imports_valid",
            check_type="command",
            description="Module imports successfully",
            command="python -c 'import {module}'",
            action_on_fail="Fix import paths",
        ),
        VerificationCheck(
            name="tests_pass",
            check_type="command",
            description="Tests pass after refactoring",
            command="pytest {test_path} -v --tb=short",
            action_on_fail="Update tests for new structure",
        ),
        VerificationCheck(
            name="cluster_in_graph",
            check_type="membrane",
            description="New module(s) in graph",
            action_on_fail="Run procedure_start('add_cluster')",
            membrane_protocol="add_cluster",
        ),
    ],

    "MISSING_TESTS": [
        VerificationCheck(
            name="test_file_exists",
            check_type="file",
            description="Test file exists",
            action_on_fail="Create test file",
        ),
        VerificationCheck(
            name="tests_pass",
            check_type="command",
            description="Tests pass",
            command="pytest {test_path} -v --tb=short",
            action_on_fail="Fix tests",
        ),
        VerificationCheck(
            name="health_indicators",
            check_type="membrane",
            description="Health indicators in graph",
            action_on_fail="Run procedure_start('add_health_coverage')",
            membrane_protocol="add_health_coverage",
        ),
    ],

    "ESCALATION": [
        VerificationCheck(
            name="decision_in_sync",
            check_type="file",
            description="SYNC shows DECISION not ESCALATION",
            patterns_absent=["### ESCALATION:"],
            action_on_fail="Change ESCALATION to DECISION in SYNC",
        ),
        VerificationCheck(
            name="decision_recorded",
            check_type="membrane",
            description="Decision moment recorded in graph",
            action_on_fail="Run procedure_start('capture_decision')",
            membrane_protocol="capture_decision",
        ),
    ],

    "YAML_DRIFT": [
        VerificationCheck(
            name="all_paths_exist",
            check_type="file",
            description="All paths in modules.yaml exist",
            action_on_fail="Fix or remove invalid paths",
        ),
    ],

    "PLACEHOLDER": [
        VerificationCheck(
            name="no_placeholders",
            check_type="file",
            description="No placeholder markers remain",
            patterns_absent=["[placeholder]", "TODO: fill in", "TBD", "XXX"],
            action_on_fail="Fill in all placeholders",
        ),
    ],

    "HARDCODED_SECRET": [
        VerificationCheck(
            name="no_secrets_in_code",
            check_type="file",
            description="No secrets in source code",
            action_on_fail="Move secrets to environment variables",
        ),
        VerificationCheck(
            name="env_var_used",
            check_type="file",
            description="Environment variable lookup used",
            patterns_present=["os.environ", "os.getenv", "process.env"],
            action_on_fail="Use os.environ.get('SECRET_NAME')",
        ),
    ],

    "NEW_UNDOC_CODE": [
        VerificationCheck(
            name="implementation_updated",
            check_type="file",
            description="IMPLEMENTATION doc updated for new code",
            action_on_fail="Update CODE STRUCTURE section",
        ),
        VerificationCheck(
            name="thing_nodes_updated",
            check_type="membrane",
            description="Thing nodes updated in graph",
            action_on_fail="Run procedure_start('add_implementation')",
            membrane_protocol="add_implementation",
        ),
    ],
}

# Global checks that apply to ALL problem types
GLOBAL_CHECKS = [
    VerificationCheck(
        name="git_commit_exists",
        check_type="command",
        description="Changes were committed",
        command="git log -1 --format=%H",
        action_on_fail="Commit your changes",
    ),
    VerificationCheck(
        name="sync_updated",
        check_type="file",
        description="SYNC file updated with today's date",
        action_on_fail="Update SYNC with what changed",
    ),
]


def _run_file_check(
    check: VerificationCheck,
    problem: Any,  # DoctorIssue - detected task
    target_dir: Path,
) -> VerificationResult:
    """Run a file-based verification check."""
    target_path = target_dir / task.path
    passed = True
    message = ""
    details = {}

    # Check patterns_present
    if check.patterns_present and target_path.exists():
        content = target_path.read_text()
        found = any(p in content for p in check.patterns_present)
        if not found:
            passed = False
            message = f"Missing required pattern in {task.path}"
            details["missing_patterns"] = check.patterns_present

    # Check patterns_absent
    if check.patterns_absent and target_path.exists():
        content = target_path.read_text()
        found_patterns = [p for p in check.patterns_absent if p in content]
        if found_patterns:
            passed = False
            message = f"Found forbidden patterns in {task.path}"
            details["found_patterns"] = found_patterns

    # Default file existence check
    if not check.patterns_present and not check.patterns_absent:
        if not target_path.exists():
            passed = False
            message = f"File does not exist: {task.path}"

    if passed:
        message = f"PASS: {check.description}"

    return VerificationResult(
        check_name=check.name,
        check_type="file",
        passed=passed,
        message=message,
        required_action=check.action_on_fail if not passed else None,
        membrane_protocol=check.membrane_protocol if not passed else None,
        details=details,
    )


def _run_command_check(
    check: VerificationCheck,
    problem: Any,  # DoctorIssue - detected task
    target_dir: Path,
) -> VerificationResult:
    """Run a command-based verification check."""
    if not check.command:
        return VerificationResult(
            check_name=check.name,
            check_type="command",
            passed=False,
            message="No command specified",
        )

    # Substitute variables in command
    command = check.command.format(
        path=task.path,
        test_path=_find_test_path(task.path, target_dir),
        module=_path_to_module(task.path),
    )

    try:
        result = subprocess.run(
            command,
            shell=True,
            cwd=target_dir,
            capture_output=True,
            text=True,
            timeout=120,
        )
        passed = result.returncode == check.expect_exit_code

        if passed:
            message = f"PASS: {check.description}"
        else:
            message = f"FAIL: {check.description} (exit code {result.returncode})"

        return VerificationResult(
            check_name=check.name,
            check_type="command",
            passed=passed,
            message=message,
            required_action=check.action_on_fail if not passed else None,
            details={
                "stdout": result.stdout[:500] if result.stdout else "",
                "stderr": result.stderr[:500] if result.stderr else "",
            },
        )

    except subprocess.TimeoutExpired:
        return VerificationResult(
            check_name=check.name,
            check_type="command",
            passed=False,
            message=f"Command timed out: {command}",
            required_action=check.action_on_fail,
        )
    except Exception as e:
        return VerificationResult(
            check_name=check.name,
            check_type="command",
            passed=False,
            message=f"Command error: {e}",
            required_action=check.action_on_fail,
        )


def _run_membrane_check(
    check: VerificationCheck,
    problem: Any,  # DoctorIssue - detected task
    target_dir: Path,
    membrane_query: Optional[Callable] = None,
) -> VerificationResult:
    """
    Run a membrane/graph verification check.

    The membrane_query callable should accept:
        - query_type: str (e.g., "node_exists", "link_exists", "query")
        - params: dict with query parameters

    Returns a dict with:
        - exists: bool (for existence checks)
        - results: list (for query results)
        - error: str (if query failed)
    """
    # If no membrane query function provided, skip but note it
    if membrane_query is None:
        return VerificationResult(
            check_name=check.name,
            check_type="membrane",
            passed=False,
            message=f"PENDING: {check.description} (membrane query not available)",
            required_action=check.action_on_fail,
            membrane_protocol=check.membrane_protocol,
        )

    try:
        # Build query based on check name
        query_result = _execute_membrane_query(check, problem, membrane_query)

        if query_result.get("error"):
            return VerificationResult(
                check_name=check.name,
                check_type="membrane",
                passed=False,
                message=f"Query error: {query_result['error']}",
                required_action=check.action_on_fail,
                membrane_protocol=check.membrane_protocol,
            )

        passed = query_result.get("exists", False) or bool(query_result.get("results"))

        if passed:
            message = f"PASS: {check.description}"
        else:
            message = f"FAIL: {check.description} (not found in graph)"

        return VerificationResult(
            check_name=check.name,
            check_type="membrane",
            passed=passed,
            message=message,
            required_action=check.action_on_fail if not passed else None,
            membrane_protocol=check.membrane_protocol if not passed else None,
            details=query_result,
        )

    except Exception as e:
        return VerificationResult(
            check_name=check.name,
            check_type="membrane",
            passed=False,
            message=f"Membrane check error: {e}",
            required_action=check.action_on_fail,
            membrane_protocol=check.membrane_protocol,
        )


def _execute_membrane_query(
    check: VerificationCheck,
    problem: Any,  # DoctorIssue - detected task
    membrane_query: Callable,
) -> Dict[str, Any]:
    """
    Execute the appropriate membrane query for a check.

    Maps check names to specific graph queries.
    """
    # Extract module/space ID from problem path
    path = Path(task.path)
    module_name = path.stem
    area_name = path.parent.name if path.parent.name not in [".", ""] else None

    # Build space ID pattern
    if area_name:
        space_id = f"space_{area_name}_{module_name}"
    else:
        space_id = f"space_{module_name}"

    # Map check names to queries
    if check.name == "space_in_graph":
        return membrane_query(
            query_type="node_exists",
            params={"node_id": space_id, "node_type": "space"}
        )

    elif check.name == "sync_narrative":
        return membrane_query(
            query_type="node_exists",
            params={"node_type": "narrative", "type": "sync", "about": space_id}
        )

    elif check.name == "sync_narrative_updated":
        return membrane_query(
            query_type="node_exists",
            params={"node_type": "narrative", "type": "sync", "about": space_id}
        )

    elif check.name == "narratives_linked":
        return membrane_query(
            query_type="query",
            params={
                "cypher": f"""
                    MATCH (s:Space {{id: '{space_id}'}})-[:CONTAINS]->(n:Narrative)
                    RETURN count(n) > 0 as exists
                """
            }
        )

    elif check.name == "thing_node_exists":
        # Check for thing node representing this file
        thing_id = f"thing_{path.stem}"
        return membrane_query(
            query_type="node_exists",
            params={"node_id": thing_id, "node_type": "thing"}
        )

    elif check.name == "implementation_narrative":
        return membrane_query(
            query_type="node_exists",
            params={"node_type": "narrative", "type": "implementation", "about": space_id}
        )

    elif check.name == "cluster_in_graph":
        return membrane_query(
            query_type="node_exists",
            params={"node_id": space_id, "node_type": "space"}
        )

    elif check.name == "health_indicators":
        return membrane_query(
            query_type="query",
            params={
                "cypher": f"""
                    MATCH (s:Space {{id: '{space_id}'}})-[:CONTAINS]->(n:Narrative)
                    WHERE n.type = 'health'
                    RETURN count(n) > 0 as exists
                """
            }
        )

    elif check.name == "decision_recorded":
        return membrane_query(
            query_type="query",
            params={
                "cypher": f"""
                    MATCH (m:Moment)-[:ABOUT]->(s:Space {{id: '{space_id}'}})
                    WHERE m.type = 'decision'
                    RETURN count(m) > 0 as exists
                """
            }
        )

    elif check.name == "thing_nodes_updated":
        return membrane_query(
            query_type="query",
            params={
                "cypher": f"""
                    MATCH (s:Space {{id: '{space_id}'}})-[:CONTAINS]->(t:Thing)
                    RETURN count(t) > 0 as exists
                """
            }
        )

    # Default: check if any node exists with similar ID
    return membrane_query(
        query_type="query",
        params={
            "cypher": f"""
                MATCH (n)
                WHERE n.id CONTAINS '{module_name}'
                RETURN count(n) > 0 as exists
            """
        }
    )


def create_membrane_query_function(graph_queries=None):
    """
    Create a membrane query function from graph queries interface.

    Args:
        graph_queries: GraphQueries instance (or None for testing)

    Returns:
        Callable that executes membrane queries
    """
    def membrane_query(query_type: str, params: Dict[str, Any]) -> Dict[str, Any]:
        """Execute a membrane query."""
        if graph_queries is None:
            return {"error": "No graph connection available"}

        try:
            if query_type == "node_exists":
                node_id = params.get("node_id")
                node_type = params.get("node_type")

                if node_id:
                    cypher = f"MATCH (n:{node_type.capitalize()} {{id: $node_id}}) RETURN n"
                    results = graph_queries.query(cypher, {"node_id": node_id})
                else:
                    # Query by properties
                    where_clauses = []
                    query_params = {}
                    for key, value in params.items():
                        if key not in ("node_type", "about"):
                            where_clauses.append(f"n.{key} = ${key}")
                            query_params[key] = value

                    if params.get("about"):
                        # Check for ABOUT link
                        about_id = params["about"]
                        cypher = f"""
                            MATCH (n:{node_type.capitalize()})-[:ABOUT]->(target {{id: $about_id}})
                            WHERE {' AND '.join(where_clauses) if where_clauses else '1=1'}
                            RETURN n
                        """
                        query_params["about_id"] = about_id
                    else:
                        cypher = f"""
                            MATCH (n:{node_type.capitalize()})
                            WHERE {' AND '.join(where_clauses) if where_clauses else '1=1'}
                            RETURN n
                        """

                    results = graph_queries.query(cypher, query_params)

                return {"exists": len(results) > 0, "results": results}

            elif query_type == "link_exists":
                from_id = params.get("from_id")
                to_id = params.get("to_id")
                link_type = params.get("link_type", "").upper()

                cypher = f"""
                    MATCH (a {{id: $from_id}})-[r:{link_type}]->(b {{id: $to_id}})
                    RETURN r
                """
                results = graph_queries.query(cypher, {
                    "from_id": from_id,
                    "to_id": to_id,
                })
                return {"exists": len(results) > 0, "results": results}

            elif query_type == "query":
                cypher = params.get("cypher", "RETURN 1")
                query_params = params.get("params", {})
                results = graph_queries.query(cypher, query_params)

                # Check if query returned exists=true
                if results and isinstance(results[0], dict):
                    exists = results[0].get("exists", False)
                    return {"exists": exists, "results": results}

                return {"exists": len(results) > 0, "results": results}

            else:
                return {"error": f"Unknown query type: {query_type}"}

        except Exception as e:
            return {"error": str(e)}

    return membrane_query


def _find_test_path(source_path: str, target_dir: Path) -> str:
    """Find test path for a source file."""
    # Common patterns
    path = Path(source_path)

    # Try tests/{module}/test_{name}.py
    test_candidates = [
        target_dir / "tests" / path.parent.name / f"test_{path.stem}.py",
        target_dir / "tests" / f"test_{path.stem}.py",
        target_dir / path.parent / f"test_{path.stem}.py",
    ]

    for candidate in test_candidates:
        if candidate.exists():
            return str(candidate.relative_to(target_dir))

    # Default guess
    return f"tests/test_{path.stem}.py"


def _path_to_module(path: str) -> str:
    """Convert file path to Python module name."""
    # Remove extension and convert slashes to dots
    module = Path(path).with_suffix("").as_posix().replace("/", ".")
    # Remove leading src. or similar
    for prefix in ["src.", "lib.", "mind."]:
        if module.startswith(prefix):
            module = module[len(prefix):]
    return module


def verify_completion(
    problem: Any,  # DoctorIssue - detected task
    target_dir: Path,
    head_before: Optional[str] = None,
    head_after: Optional[str] = None,
    membrane_query: Optional[Callable] = None,
) -> List[VerificationResult]:
    """
    Run all verification checks for a task type.

    Args:
        problem: The detected task being verified
        target_dir: Project root directory
        head_before: Git HEAD before work
        head_after: Git HEAD after work
        membrane_query: Optional function to query membrane/graph

    Returns:
        List of verification results
    """
    results = []

    # Get problem-specific checks
    checks = VERIFICATION_CHECKS.get(task.task_type, [])

    # Add global checks
    all_checks = checks + GLOBAL_CHECKS

    for check in all_checks:
        if check.check_type == "file":
            result = _run_file_check(check, problem, target_dir)
        elif check.check_type == "command":
            result = _run_command_check(check, problem, target_dir)
        elif check.check_type == "membrane":
            result = _run_membrane_check(check, problem, target_dir, membrane_query)
        else:
            result = VerificationResult(
                check_name=check.name,
                check_type=check.check_type,
                passed=False,
                message=f"Unknown check type: {check.check_type}",
            )
        results.append(result)

    # Special check: git commit
    if head_before and head_after:
        commit_exists = head_before != head_after
        results.append(VerificationResult(
            check_name="git_commit_new",
            check_type="git",
            passed=commit_exists,
            message="PASS: New commit created" if commit_exists else "FAIL: No new commit",
            required_action="Commit your changes" if not commit_exists else None,
        ))

    return results


def format_verification_feedback(
    results: List[VerificationResult],
    problem: Any,  # DoctorIssue - detected task
    attempt: int = 1,
    max_attempts: int = 3,
) -> str:
    """
    Format failed checks into agent-readable feedback for --continue.

    Args:
        results: List of verification results
        problem: The task being worked
        attempt: Current attempt number
        max_attempts: Maximum retry attempts

    Returns:
        Formatted feedback string for agent
    """
    failed = [r for r in results if not r.passed]
    passed = [r for r in results if r.passed]

    if not failed:
        return ""

    lines = [
        "=" * 60,
        f"## VERIFICATION FAILED (Attempt {attempt}/{max_attempts})",
        "",
        f"**Problem:** {task.task_type} in {task.path}",
        "",
        f"**Passed:** {len(passed)}/{len(results)} checks",
        "",
        "### Failed Checks:",
    ]

    for r in failed:
        status = "[ ]"
        lines.append(f"- {status} **{r.check_name}**: {r.message}")
        if r.details:
            for k, v in r.details.items():
                if v:
                    lines.append(f"      {k}: {str(v)[:100]}")

    lines.append("")
    lines.append("### Required Actions:")
    actions_seen = set()
    for r in failed:
        if r.required_action and r.required_action not in actions_seen:
            lines.append(f"- {r.required_action}")
            actions_seen.add(r.required_action)

    # Collect membrane protocols
    protocols = set(r.membrane_protocol for r in failed if r.membrane_protocol)
    if protocols:
        lines.append("")
        lines.append("### Membrane Protocols to Run:")
        for p in sorted(protocols):
            lines.append(f"- procedure_start(\"{p}\")")

    lines.append("")
    lines.append("### Instructions:")
    lines.append("Complete the required actions above. Verification will run again.")
    lines.append("=" * 60)

    return "\n".join(lines)


def all_passed(results: List[VerificationResult]) -> bool:
    """Check if all verification checks passed."""
    return all(r.passed for r in results)


def get_failed_membrane_protocols(results: List[VerificationResult]) -> List[str]:
    """Get list of membrane protocols that need to be run."""
    return list(set(
        r.membrane_protocol
        for r in results
        if not r.passed and r.membrane_protocol
    ))


def format_escalation_feedback(
    session: VerificationSession,
    results: List[VerificationResult],
    problem: Any,  # DoctorIssue - detected task
) -> str:
    """
    Format feedback for escalation when max retries exceeded.

    Instead of asking agent to retry, instructs them to:
    1. Create an escalation via raise_escalation protocol
    2. Create TODOs for deferred work
    3. Update SYNC with current state

    Args:
        session: Verification session state
        results: Final verification results
        problem: The task that couldn't be resolved

    Returns:
        Formatted escalation instructions for agent
    """
    failed = [r for r in results if not r.passed]
    protocols = get_failed_membrane_protocols(results)

    lines = [
        "=" * 60,
        "## ESCALATION REQUIRED - MAX RETRIES EXCEEDED",
        "",
        f"**Reason:** {session.get_escalation_reason()}",
        f"**Problem:** {task.task_type} in {task.path}",
        f"**Attempts:** {session.retry_count}",
        "",
        "You have exhausted retry attempts. DO NOT RETRY.",
        "Instead, take these actions:",
        "",
        "### 1. Raise Escalation",
        "```",
        "procedure_start('raise_escalation')",
        "```",
        "",
        "Include in escalation:",
        f"- Problem: {task.task_type} in {task.path}",
        f"- Failed checks: {', '.join(r.check_name for r in failed)}",
        "- What you tried and why it didn't work",
        "- Options for resolution",
        "",
        "### 2. Create TODOs for Deferred Work",
        "For each failed check that represents work you could do later:",
        "```",
        "procedure_start('add_todo')",
        "```",
        "",
    ]

    if protocols:
        lines.append("### 3. Membrane Protocols Needed")
        lines.append("These protocols should be run when unblocked:")
        for p in sorted(protocols):
            lines.append(f"- {p}")
        lines.append("")

    lines.extend([
        "### 4. Update SYNC",
        "Record current state and blockers in SYNC file:",
        "- What was accomplished",
        "- What is blocked and why",
        "- What the next agent should do",
        "",
        "### Failed Checks Summary:",
    ])

    for r in failed:
        lines.append(f"- [ ] {r.check_name}: {r.message}")

    lines.extend([
        "",
        "Do NOT attempt to fix these checks again.",
        "Create escalation and move on.",
        "=" * 60,
    ])

    return "\n".join(lines)


def format_todo_suggestion(
    results: List[VerificationResult],
    problem: Any,  # DoctorIssue - detected task
) -> str:
    """
    Format suggestion to create TODOs for deferred work.

    When verification fails but agent should continue with other work,
    suggest creating TODOs to track what's incomplete.

    Args:
        results: Verification results
        problem: Current problem

    Returns:
        Formatted TODO suggestion
    """
    failed = [r for r in results if not r.passed]

    if not failed:
        return ""

    lines = [
        "",
        "### Consider Deferring Work",
        "",
        "If you're blocked on some checks but can make progress on others,",
        "create TODOs to track incomplete work:",
        "",
    ]

    for r in failed:
        todo_text = f"Complete {r.check_name} for {task.path}"
        lines.append(f"- TODO: {todo_text}")

    lines.extend([
        "",
        "Use `procedure_start('add_todo')` to create tracked TODOs.",
        "This keeps you focused on what you CAN complete now.",
    ])

    return "\n".join(lines)


def should_suggest_todos(results: List[VerificationResult], attempt: int) -> bool:
    """
    Determine if we should suggest creating TODOs.

    Suggest TODOs when:
    - Some checks passed (partial progress)
    - This is attempt 2+ (first failure, try again; second failure, consider deferring)
    - There are membrane checks failing (these often need separate work)

    Args:
        results: Verification results
        attempt: Current attempt number

    Returns:
        True if TODO suggestion is appropriate
    """
    passed = [r for r in results if r.passed]
    failed = [r for r in results if not r.passed]

    # Some progress made
    has_progress = len(passed) > 0

    # Not first attempt
    past_first_attempt = attempt >= 2

    # Membrane checks failing (often need separate protocol runs)
    membrane_failing = any(r.check_type == "membrane" for r in failed)

    return has_progress and (past_first_attempt or membrane_failing)
