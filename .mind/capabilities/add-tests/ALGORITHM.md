# Add Tests — Algorithm

```
STATUS: CANONICAL
CAPABILITY: add-tests
```

---

## CHAIN

```
OBJECTIVES:      ./OBJECTIVES.md
PATTERNS:        ./PATTERNS.md
VOCABULARY:      ./VOCABULARY.md
BEHAVIORS:       ./BEHAVIORS.md
THIS:            ALGORITHM.md (you are here)
VALIDATION:      ./VALIDATION.md
```

---

## PURPOSE

How add-tests works — detection, creation, validation.

---

## DETECTION ALGORITHM: MISSING_TESTS

```python
def check_test_coverage(project_root):
    """
    Scan project for modules without tests.
    Called by: init_scan, cron:daily, file_watch
    """

    # 1. Find all code modules
    code_modules = scan_code_modules(project_root)
    # Returns: ["auth", "utils", "api", ...]

    # 2. Find all test directories
    test_dirs = scan_test_dirs(project_root / "tests")
    # Returns: {"auth": ["test_login.py", ...], ...}

    problems = []

    for module in code_modules:
        if module not in test_dirs:
            # MISSING_TESTS
            problems.append({
                "type": "MISSING_TESTS",
                "target": module,
                "severity": "critical"
            })
        elif not test_dirs[module]:
            # Empty test directory
            problems.append({
                "type": "MISSING_TESTS",
                "target": module,
                "severity": "critical"
            })

    return problems
```

---

## DETECTION ALGORITHM: INVARIANT_UNTESTED

```python
def check_invariant_coverage(project_root):
    """
    Check if all invariants have linked tests.
    Called by: cron:daily, on_validation_change
    """

    # 1. Find all invariants in VALIDATION files
    invariants = []
    for validation_file in glob("docs/**/VALIDATION*.md"):
        invariants.extend(extract_invariant_ids(validation_file))
    # Returns: [{"id": "V1", "file": "docs/auth/VALIDATION.md"}, ...]

    # 2. Find all VALIDATES markers in tests
    validates_markers = []
    for test_file in glob("tests/**/*.py"):
        validates_markers.extend(extract_validates_markers(test_file))
    # Returns: [{"invariant": "V1", "test_file": "tests/test_auth.py"}, ...]

    validated_ids = {m["invariant"] for m in validates_markers}

    problems = []

    for inv in invariants:
        if inv["id"] not in validated_ids:
            problems.append({
                "type": "INVARIANT_UNTESTED",
                "target": inv["id"],
                "source": inv["file"],
                "severity": "high"
            })

    return problems
```

---

## DETECTION ALGORITHM: TEST_NO_VALIDATES

```python
def check_validates_markers(project_root):
    """
    Check if tests have VALIDATES markers.
    Called by: cron:weekly, on_test_change
    """

    problems = []

    for test_file in glob("tests/**/*.py"):
        content = read(test_file)
        test_functions = extract_test_functions(content)
        validates_markers = extract_validates_markers(content)

        if test_functions and not validates_markers:
            problems.append({
                "type": "TEST_NO_VALIDATES",
                "target": test_file,
                "test_count": len(test_functions),
                "severity": "medium"
            })

    return problems
```

---

## DETECTION ALGORITHM: HEALTH_FAILED

```python
def check_health_status(ctx):
    """
    Run health check and detect failures.
    Called by: cron:hourly, ci:pipeline, manual
    """

    # 1. Run the health check
    result = run_health_check(ctx.check_id, ctx.params)

    # 2. If failed, create problem
    if result.status == "critical":
        return {
            "type": "HEALTH_FAILED",
            "target": ctx.check_id,
            "error": result.error,
            "details": result.details,
            "severity": "critical"
        }

    if result.status == "degraded":
        return {
            "type": "HEALTH_FAILED",
            "target": ctx.check_id,
            "warning": result.warning,
            "details": result.details,
            "severity": "high"
        }

    return None  # Healthy, no problem
```

---

## TASK CREATION ALGORITHM

```python
def create_test_task(problem):
    """
    Create task_run from detected problem.
    Called when: problem detected by health check
    """

    # 1. Get task template based on problem type
    task_map = {
        "MISSING_TESTS": "TASK_add_tests",
        "INVARIANT_UNTESTED": "TASK_test_invariant",
        "TEST_NO_VALIDATES": "TASK_add_validates_markers",
        "HEALTH_FAILED": "TASK_fix_health",
    }
    template = load_task_template(task_map[problem["type"]])

    # 2. Determine nature based on severity
    nature_map = {
        "critical": "urgently concerns",
        "high": "importantly concerns",
        "medium": "concerns",
        "low": "optionally concerns"
    }
    nature = nature_map[problem["severity"]]

    # 3. Create task_run node
    task_run = create_node(
        node_type="narrative",
        type="task_run",
        nature=nature,
        content=f"""
        # {task_map[problem['type']]}: {problem['target']}

        Problem: {problem['type']}
        Target: {problem['target']}
        Details: {problem.get('details', 'N/A')}
        """,
        synthesis=f"Fix {problem['type']} for {problem['target']}"
    )

    # 4. Create links
    create_link(task_run, template, nature="serves")
    create_link(task_run, problem["target"], nature="concerns")
    create_link(task_run, problem["type"], nature="resolves")

    return task_run
```

---

## EXECUTION ALGORITHM

```python
def execute_add_tests(task_run, agent):
    """
    Agent executes test creation.
    Called when: agent claims task and starts work
    """

    # 1. Load skill
    skill = load_skill("SKILL_write_tests")

    # 2. Start procedure
    session = start_procedure("PROCEDURE_add_tests", {
        "target": task_run.target,
        "problem_type": task_run.problem_type
    })

    # 3. Execute steps
    for step in session.steps:
        if step.id == "read_invariants":
            invariants = read_validation_file(task_run.target)

        elif step.id == "create_test_file":
            test_path = f"tests/test_{task_run.target}.py"
            create_file(test_path, TEST_TEMPLATE)

        elif step.id == "write_tests":
            for inv in invariants:
                test_code = agent.write_test(inv)
                append_to_file(test_path, test_code)

        elif step.id == "add_markers":
            for inv in invariants:
                add_validates_marker(test_path, inv["id"])

        elif step.id == "run_tests":
            result = run_pytest(test_path)
            if not result.passed:
                session.escalate("Tests failed", result.errors)

        session.complete_step(step)

    # 4. End procedure
    end_procedure(session)

    return task_run
```

---

## VALIDATION ALGORITHM

```python
def validate_tests(module):
    """
    Validate created tests.
    Called when: agent marks task complete
    """

    checks = []

    # 1. Test file exists?
    test_path = f"tests/test_{module}.py"
    if not exists(test_path):
        checks.append(("EXISTS", test_path, False))
    else:
        checks.append(("EXISTS", test_path, True))

    # 2. Tests pass?
    result = run_pytest(test_path)
    checks.append(("PASSES", test_path, result.passed))

    # 3. VALIDATES markers present?
    content = read(test_path)
    markers = extract_validates_markers(content)
    if markers:
        checks.append(("MARKERS", test_path, True))
    else:
        checks.append(("MARKERS", test_path, False))

    # 4. Markers reference valid invariants?
    validation_file = f"docs/{module}/VALIDATION.md"
    if exists(validation_file):
        valid_ids = extract_invariant_ids(validation_file)
        for marker in markers:
            if marker["invariant"] in valid_ids:
                checks.append(("VALID_REF", marker["invariant"], True))
            else:
                checks.append(("VALID_REF", marker["invariant"], False))

    # 5. Result
    passed = all(check[2] for check in checks)

    return {
        "passed": passed,
        "checks": checks
    }
```

---

## DECISION TREE

```
Module detected
│
├── Has tests/?
│   ├── No → MISSING_TESTS → create task_run
│   └── Yes → Check VALIDATES markers
│       ├── Has markers → Check invariant coverage
│       │   ├── All covered → healthy
│       │   └── Gaps exist → INVARIANT_UNTESTED → create task_run
│       └── No markers → TEST_NO_VALIDATES → create task_run
│
Health check runs
│
├── Result?
│   ├── Healthy → done
│   ├── Degraded → HEALTH_FAILED (high) → create task_run
│   └── Critical → HEALTH_FAILED (critical) → create task_run
│
Task claimed by agent
│
├── Load skill
├── Start procedure
├── For each untested invariant:
│   ├── Read invariant definition
│   ├── Write test function
│   ├── Add VALIDATES marker
│   └── Run test
├── Validate
│   ├── Pass → complete
│   └── Fail → retry/escalate
```
