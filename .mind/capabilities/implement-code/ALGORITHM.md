# Implement Code — Algorithm

```
STATUS: CANONICAL
CAPABILITY: implement-code
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

How implement-code works — detection, implementation, documentation, validation.

---

## STUB DETECTION ALGORITHM

```python
def detect_stubs(project_root):
    """
    Scan project for stub implementations.
    Called by: init_scan, cron:daily, file_watch
    """

    STUB_PATTERNS = [
        r'^\s*pass\s*$',                          # pass only
        r'^\s*\.\.\.\s*$',                        # ... only
        r'raise NotImplementedError',             # NotImplementedError
        r'raise NotImplemented\b',                # NotImplemented (common mistake)
    ]

    problems = []

    for code_file in glob(project_root, "**/*.py"):
        tree = parse_ast(code_file)

        for func in extract_functions(tree):
            body = get_function_body(func)

            # Check if body matches stub patterns
            if is_stub(body, STUB_PATTERNS):
                problems.append({
                    "type": "STUB_IMPL",
                    "file": code_file,
                    "function": func.name,
                    "line": func.lineno,
                    "severity": "critical"
                })

    return problems


def is_stub(body, patterns):
    """Check if function body is a stub."""
    # Normalize body (remove docstrings, comments)
    normalized = strip_docstring(body)
    normalized = strip_comments(normalized)
    normalized = normalized.strip()

    # Empty body after stripping
    if not normalized:
        return True

    # Check against stub patterns
    for pattern in patterns:
        if re.match(pattern, normalized, re.MULTILINE):
            return True

    return False
```

---

## TODO DETECTION ALGORITHM

```python
def detect_incomplete(project_root):
    """
    Scan for TODO/FIXME markers indicating incomplete code.
    Called by: init_scan, cron:daily, file_watch
    """

    INCOMPLETE_MARKERS = [
        r'#\s*TODO\b',
        r'#\s*FIXME\b',
        r'#\s*XXX\b',
        r'#\s*HACK\b',
        r'//\s*TODO\b',   # JS/TS
        r'//\s*FIXME\b',
    ]

    problems = []

    for code_file in glob(project_root, "**/*.{py,ts,js}"):
        content = read_file(code_file)
        lines = content.split('\n')

        for lineno, line in enumerate(lines, 1):
            for pattern in INCOMPLETE_MARKERS:
                if re.search(pattern, line, re.IGNORECASE):
                    # Extract marker context
                    marker_text = extract_marker_text(line)

                    problems.append({
                        "type": "INCOMPLETE_IMPL",
                        "file": code_file,
                        "line": lineno,
                        "marker": marker_text,
                        "severity": "high"
                    })
                    break  # One issue per line

    return problems
```

---

## UNDOC IMPL DETECTION ALGORITHM

```python
def detect_undoc_impl(project_root):
    """
    Find IMPLEMENTATION.md files without ALGORITHM.md.
    Called by: init_scan, cron:daily
    """

    problems = []
    docs_root = project_root / "docs"

    # Find all IMPLEMENTATION files
    impl_files = list(docs_root.rglob("IMPLEMENTATION*.md"))

    for impl_file in impl_files:
        module_dir = impl_file.parent

        # Check for ALGORITHM.md
        algo_files = list(module_dir.glob("ALGORITHM*.md"))

        if not algo_files:
            problems.append({
                "type": "UNDOC_IMPL",
                "file": str(impl_file),
                "module": module_dir.name,
                "severity": "high"
            })
        else:
            # Check if ALGORITHM is a stub
            algo_file = algo_files[0]
            content = read_file(algo_file)

            if is_stub_doc(content):
                problems.append({
                    "type": "UNDOC_IMPL",
                    "file": str(algo_file),
                    "module": module_dir.name,
                    "reason": "ALGORITHM.md is a stub",
                    "severity": "high"
                })

    return problems


def is_stub_doc(content):
    """Check if doc file is a stub."""
    return (
        "STATUS: STUB" in content or
        "{placeholder}" in content or
        len(content) < 200
    )
```

---

## STALE IMPL DETECTION ALGORITHM

```python
def detect_stale_impl(project_root):
    """
    Find code that changed more recently than its docs.
    Called by: post-commit hook, cron:daily
    """

    STALENESS_THRESHOLD_DAYS = 7
    problems = []

    # Get all code files with DOCS: markers
    for code_file in glob(project_root, "**/*.py"):
        doc_path = extract_docs_marker(code_file)

        if not doc_path:
            continue  # No doc link, handled by UNDOCUMENTED

        if not Path(doc_path).exists():
            continue  # Broken link, different problem

        # Compare modification times
        code_mtime = get_git_mtime(code_file)
        doc_mtime = get_doc_last_updated(doc_path)

        if not doc_mtime:
            doc_mtime = get_file_mtime(doc_path)

        days_behind = (code_mtime - doc_mtime).days

        if days_behind > STALENESS_THRESHOLD_DAYS:
            problems.append({
                "type": "STALE_IMPL",
                "code_file": str(code_file),
                "doc_file": str(doc_path),
                "days_behind": days_behind,
                "severity": "medium"
            })

    return problems


def extract_docs_marker(code_file):
    """Extract DOCS: marker from file header."""
    content = read_file(code_file)
    lines = content.split('\n')[:10]  # First 10 lines

    for line in lines:
        match = re.search(r'DOCS:\s*(.+)', line)
        if match:
            return match.group(1).strip()

    return None


def get_doc_last_updated(doc_path):
    """Extract LAST_UPDATED from doc file."""
    content = read_file(doc_path)
    match = re.search(r'LAST_UPDATED:\s*(\d{4}-\d{2}-\d{2})', content)

    if match:
        return datetime.strptime(match.group(1), '%Y-%m-%d')

    return None
```

---

## TASK CREATION ALGORITHM

```python
def create_impl_task(problem):
    """
    Create task_run from detected problem.
    Called when: problem detected by health check
    """

    # Map problem types to tasks
    TASK_MAP = {
        "STUB_IMPL": "TASK_implement_stub",
        "INCOMPLETE_IMPL": "TASK_complete_impl",
        "UNDOC_IMPL": "TASK_document_impl",
        "STALE_IMPL": "TASK_update_impl_docs",
    }

    # Map severity to nature
    NATURE_MAP = {
        "critical": "urgently concerns",
        "high": "importantly concerns",
        "medium": "concerns",
    }

    template = load_task_template(TASK_MAP[problem["type"]])
    nature = NATURE_MAP[problem["severity"]]

    task_run = create_node(
        node_type="narrative",
        type="task_run",
        nature=nature,
        content=f"""
        # {TASK_MAP[problem['type']]}: {problem.get('file', problem.get('module'))}

        Problem: {problem['type']}
        File: {problem.get('file')}
        Details: {problem}
        """,
        synthesis=f"Fix {problem['type']} in {problem.get('file', problem.get('module'))}"
    )

    create_link(task_run, template, nature="serves")
    create_link(task_run, problem.get('file'), nature="concerns")
    create_link(task_run, problem["type"], nature="resolves")

    return task_run
```

---

## EXECUTION ALGORITHM

```python
def execute_implement(task_run, agent):
    """
    Agent executes implementation task.
    Called when: agent claims task and starts work
    """

    skill = load_skill("SKILL_implement")
    problem_type = task_run.problem_type

    if problem_type == "STUB_IMPL":
        return implement_stub(task_run, agent)
    elif problem_type == "INCOMPLETE_IMPL":
        return complete_impl(task_run, agent)
    elif problem_type == "UNDOC_IMPL":
        return document_impl(task_run, agent)
    elif problem_type == "STALE_IMPL":
        return update_impl_docs(task_run, agent)


def implement_stub(task_run, agent):
    """Implement a stub function."""

    # 1. Read ALGORITHM.md for spec
    module = extract_module(task_run.file)
    algo_doc = read_doc(f"docs/{module}/ALGORITHM.md")

    # 2. Find function spec in ALGORITHM
    func_name = task_run.function
    spec = find_function_spec(algo_doc, func_name)

    if not spec:
        # No spec — escalate or use docstring
        spec = extract_docstring_spec(task_run.file, func_name)

    # 3. Implement
    code = agent.implement_from_spec(
        file=task_run.file,
        function=func_name,
        spec=spec
    )

    # 4. Write and test
    write_code(task_run.file, func_name, code)
    test_result = run_tests(task_run.file)

    if not test_result.passed:
        # Retry or escalate
        return retry_or_escalate(task_run, test_result)

    return task_run


def complete_impl(task_run, agent):
    """Complete partial implementation."""

    # 1. Read TODO context
    context = read_todo_context(task_run.file, task_run.line)

    # 2. Understand what's missing
    analysis = agent.analyze_incomplete(
        file=task_run.file,
        marker=task_run.marker,
        context=context
    )

    # 3. Implement
    code = agent.complete_code(analysis)

    # 4. Replace TODO section with implementation
    replace_code_section(task_run.file, task_run.line, code)

    # 5. Remove TODO marker
    remove_marker(task_run.file, task_run.line)

    # 6. Test
    test_result = run_tests(task_run.file)

    return task_run


def document_impl(task_run, agent):
    """Create ALGORITHM.md from implementation."""

    # 1. Read implementation code
    module = task_run.module
    impl_files = get_impl_files(module)

    # 2. Analyze code for algorithms
    analysis = agent.analyze_algorithms(impl_files)

    # 3. Load template
    template = load_template("ALGORITHM_TEMPLATE.md")

    # 4. Create ALGORITHM.md
    content = agent.fill_template(template, {
        "module": module,
        "algorithms": analysis.algorithms,
        "flows": analysis.flows,
        "decisions": analysis.decisions
    })

    # 5. Write
    write_doc(f"docs/{module}/ALGORITHM.md", content)

    return task_run


def update_impl_docs(task_run, agent):
    """Update docs to match code changes."""

    # 1. Get code diff
    diff = get_git_diff(task_run.code_file)

    # 2. Analyze what changed
    changes = agent.analyze_changes(diff)

    # 3. Read current docs
    doc_content = read_doc(task_run.doc_file)

    # 4. Update docs
    updated = agent.update_doc_for_changes(doc_content, changes)

    # 5. Write
    write_doc(task_run.doc_file, updated)

    # 6. Update LAST_UPDATED
    update_last_updated(task_run.doc_file)

    return task_run
```

---

## DECISION TREE

```
Code file scanned
|
+-- Has stub functions?
|   +-- Yes -> STUB_IMPL -> create task_run
|   +-- No -> continue
|
+-- Has TODO/FIXME?
|   +-- Yes -> INCOMPLETE_IMPL -> create task_run
|   +-- No -> continue
|
+-- Has IMPLEMENTATION.md?
    +-- No -> handled by create-doc-chain
    +-- Yes -> Has ALGORITHM.md?
        +-- No -> UNDOC_IMPL -> create task_run
        +-- Yes (stub) -> UNDOC_IMPL -> create task_run
        +-- Yes (real) -> Check staleness
            +-- Stale -> STALE_IMPL -> create task_run
            +-- Fresh -> healthy

Task claimed by agent
|
+-- Load skill
+-- Determine problem type
+-- Execute appropriate flow:
    +-- STUB_IMPL -> implement from spec
    +-- INCOMPLETE_IMPL -> complete partial code
    +-- UNDOC_IMPL -> write ALGORITHM.md
    +-- STALE_IMPL -> update docs
+-- Validate
    +-- Pass -> complete
    +-- Fail -> retry/escalate
```
