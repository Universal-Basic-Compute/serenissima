# Create Doc Chain — Algorithm

```
STATUS: CANONICAL
CAPABILITY: create-doc-chain
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

How create-doc-chain works — detection, creation, validation.

---

## DETECTION ALGORITHM

```python
def check_doc_coverage(project_root):
    """
    Scan project for code without documentation.
    Called by: init_scan, cron:daily, file_watch
    """

    # 1. Find all code modules
    code_modules = scan_code_modules(project_root)
    # Returns: ["auth", "utils", "api", ...]

    # 2. Find all doc chains
    doc_chains = scan_doc_chains(project_root / "docs")
    # Returns: {"auth": ["OBJECTIVES", "PATTERNS", ...], ...}

    # 3. Expected chain
    EXPECTED = [
        "OBJECTIVES", "PATTERNS", "VOCABULARY", "BEHAVIORS",
        "ALGORITHM", "VALIDATION", "IMPLEMENTATION", "HEALTH", "SYNC"
    ]

    problems = []

    for module in code_modules:
        if module not in doc_chains:
            # UNDOCUMENTED
            problems.append({
                "type": "UNDOCUMENTED",
                "target": module,
                "severity": "critical"
            })
        else:
            # Check completeness
            found = set(doc_chains[module])
            missing = set(EXPECTED) - found

            if missing:
                # INCOMPLETE_CHAIN
                problems.append({
                    "type": "INCOMPLETE_CHAIN",
                    "target": module,
                    "missing": list(missing),
                    "severity": "high"
                })

    return problems
```

---

## TASK CREATION ALGORITHM

```python
def create_doc_task(problem):
    """
    Create task_run from detected problem.
    Called when: problem detected by health check
    """

    # 1. Get task template
    template = load_task_template("TASK_create_doc")

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
        # Create Documentation: {problem['target']}

        Problem: {problem['type']}
        Target: {problem['target']}
        Missing: {problem.get('missing', 'all')}
        """,
        synthesis=f"Create docs for {problem['target']}"
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
def execute_create_doc(task_run, agent):
    """
    Agent executes doc creation.
    Called when: agent claims task and starts work
    """

    # 1. Load skill
    skill = load_skill("SKILL_write_doc")

    # 2. Start procedure
    session = start_procedure("PROCEDURE_create_doc", {
        "target": task_run.target,
        "missing": task_run.missing or ALL_DOCS
    })

    # 3. Execute steps
    for step in session.steps:
        # Each step = one doc file
        doc_type = step.params["doc_type"]
        template = load_template(f"{doc_type}_TEMPLATE.md")

        # Agent fills template
        content = agent.fill_template(template, context={
            "module": task_run.target,
            "code": read_code(task_run.target)
        })

        # Write doc
        write_doc(task_run.target, doc_type, content)

        # Mark step complete
        session.complete_step(step)

    # 4. End procedure
    end_procedure(session)

    return task_run
```

---

## VALIDATION ALGORITHM

```python
def validate_doc_chain(module):
    """
    Validate created documentation.
    Called when: agent marks task complete
    """

    checks = []

    # 1. All files present?
    EXPECTED = [
        "OBJECTIVES", "PATTERNS", "VOCABULARY", "BEHAVIORS",
        "ALGORITHM", "VALIDATION", "IMPLEMENTATION", "HEALTH", "SYNC"
    ]

    for doc in EXPECTED:
        path = f"docs/{module}/{doc}.md"
        if not exists(path):
            checks.append(("MISSING", doc, False))
        else:
            checks.append(("EXISTS", doc, True))

    # 2. No placeholders?
    for path in glob(f"docs/{module}/*.md"):
        content = read(path)
        if "{placeholder}" in content or "STATUS: STUB" in content:
            checks.append(("PLACEHOLDER", path, False))

    # 3. Structure matches template?
    for path in glob(f"docs/{module}/*.md"):
        doc_type = extract_type(path)
        template = load_template(f"{doc_type}_TEMPLATE.md")

        if not structure_matches(path, template):
            checks.append(("DRIFT", path, False))

    # 4. Result
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
├── Has docs/?
│   ├── No → UNDOCUMENTED → create task_run
│   └── Yes → Check completeness
│       ├── Complete → healthy
│       └── Incomplete → INCOMPLETE_CHAIN → create task_run
│
Task claimed by agent
│
├── Load skill
├── Start procedure
├── For each missing doc:
│   ├── Load template
│   ├── Fill with code context
│   └── Write file
├── Validate
│   ├── Pass → complete
│   └── Fail → retry/escalate
```
