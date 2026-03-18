# Investigate Runtime — Algorithm

```
STATUS: CANONICAL
CAPABILITY: investigate-runtime
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

How investigate-runtime works — detection, investigation, documentation.

---

## LOG ERROR DETECTION ALGORITHM

```python
def check_log_errors(log_paths):
    """
    Scan log files for ERROR entries.
    Called by: log_stream, cron:hourly
    """

    # 1. Define error patterns
    ERROR_PATTERNS = [
        r'ERROR',
        r'CRITICAL',
        r'Exception',
        r'Traceback',
    ]

    # 2. Scan log files
    errors = []
    for log_path in log_paths:
        recent_entries = read_recent_entries(log_path, max_age="24h")

        for entry in recent_entries:
            if matches_any(entry, ERROR_PATTERNS):
                errors.append({
                    "log_path": log_path,
                    "line": entry.line_number,
                    "message": entry.message,
                    "stack_trace": entry.stack_trace,
                    "timestamp": entry.timestamp
                })

    # 3. Deduplicate by message signature
    unique_errors = dedupe_by_signature(errors)

    return unique_errors
```

---

## HOOK DETECTION ALGORITHM

```python
def check_undocumented_hooks(project_root):
    """
    Find hooks without documentation.
    Called by: init_scan, file_watch
    """

    # 1. Define hook locations
    HOOK_PATHS = [
        ".git/hooks",
        "scripts/hooks",
        ".husky",
    ]

    # 2. Find all hook files
    hooks = []
    for hook_dir in HOOK_PATHS:
        path = project_root / hook_dir
        if path.exists():
            for hook_file in path.iterdir():
                if hook_file.is_file() and is_executable(hook_file):
                    hooks.append(hook_file)

    # 3. Check for documentation
    undocumented = []
    for hook in hooks:
        hook_name = hook.stem

        # Check BEHAVIORS docs
        behaviors_docs = glob(f"docs/**/BEHAVIORS*.md")
        has_doc = any(
            mentions_hook(doc, hook_name)
            for doc in behaviors_docs
        )

        if not has_doc:
            undocumented.append({
                "hook_path": str(hook),
                "hook_name": hook_name,
                "trigger_type": infer_trigger_type(hook_name)
            })

    return undocumented
```

---

## TASK CREATION ALGORITHM

```python
def create_investigation_task(problem):
    """
    Create task_run from detected problem.
    Called when: problem detected by health check
    """

    # 1. Get appropriate template
    template_map = {
        "LOG_ERROR": "TASK_investigate_error",
        "HOOK_UNDOC": "TASK_document_hook"
    }
    template = load_task_template(template_map[problem["type"]])

    # 2. Determine nature based on severity
    nature_map = {
        "high": "importantly concerns",
        "medium": "concerns"
    }
    nature = nature_map[problem["severity"]]

    # 3. Create task_run node
    task_run = create_node(
        node_type="narrative",
        type="task_run",
        nature=nature,
        content=f"""
        # {problem['type']}: Investigation Required

        Target: {problem['target']}
        Details: {problem.get('details', 'See logs')}
        Evidence: {problem.get('evidence', [])}
        """,
        synthesis=f"Investigate {problem['type']} at {problem['target']}"
    )

    # 4. Create links
    create_link(task_run, template, nature="serves")
    create_link(task_run, problem["target"], nature="concerns")
    create_link(task_run, problem["type"], nature="resolves")

    return task_run
```

---

## INVESTIGATION ALGORITHM

```python
def execute_investigation(task_run, agent):
    """
    Agent executes investigation.
    Called when: agent claims error task and starts work
    """

    # 1. Load skill
    skill = load_skill("SKILL_investigate")

    # 2. Start procedure
    session = start_procedure("PROCEDURE_investigate", {
        "target": task_run.target,
        "error_details": task_run.content
    })

    # 3. Execute investigation steps

    # Step 1: Gather context
    context = gather_context(
        log_path=task_run.log_path,
        error_time=task_run.timestamp,
        window="5m"  # 5 minutes before/after error
    )

    # Step 2: Form hypothesis
    hypotheses = agent.analyze(context, prompt="""
        Based on this context, what are possible root causes?
        List each with:
        - Hypothesis
        - Supporting evidence
        - Counter-evidence
        - Confidence (low/medium/high)
    """)

    # Step 3: Verify hypothesis
    for hypothesis in sorted(hypotheses, key=lambda h: h.confidence, reverse=True):
        verification = agent.verify(hypothesis, context)

        if verification.confirmed:
            diagnosis = create_diagnosis(
                root_cause=hypothesis.description,
                evidence=verification.evidence,
                recommended_action=hypothesis.fix
            )
            break
    else:
        # No hypothesis confirmed — escalate
        diagnosis = create_escalation(
            hypotheses=hypotheses,
            context=context,
            reason="Could not confirm root cause"
        )

    # 4. Record output
    task_run.diagnosis = diagnosis
    session.complete()

    return diagnosis
```

---

## HOOK DOCUMENTATION ALGORITHM

```python
def document_hook(task_run, agent):
    """
    Agent documents an undocumented hook.
    Called when: agent claims hook task
    """

    # 1. Read hook code
    hook_path = task_run.hook_path
    hook_code = read_file(hook_path)

    # 2. Analyze hook
    analysis = agent.analyze(hook_code, prompt="""
        Analyze this hook and extract:
        - Trigger: What causes this hook to run?
        - Purpose: What does it do?
        - Side effects: What does it modify?
        - Dependencies: What does it require?
        - Failure mode: What happens if it fails?
    """)

    # 3. Create BEHAVIORS documentation
    doc_content = f"""
## Hook: {task_run.hook_name}

**Trigger:** {analysis.trigger}

**Purpose:** {analysis.purpose}

**Side Effects:**
{format_list(analysis.side_effects)}

**Dependencies:**
{format_list(analysis.dependencies)}

**Failure Mode:** {analysis.failure_mode}

**Location:** `{hook_path}`
    """

    # 4. Add to appropriate BEHAVIORS.md
    behaviors_path = find_or_create_behaviors_doc(hook_path)
    append_to_doc(behaviors_path, doc_content)

    # 5. Mark complete
    task_run.status = "completed"

    return behaviors_path
```

---

## DECISION TREE

```
Problem detected
|
+-- LOG_ERROR?
|   |
|   +-- Create task_run -[serves]-> TASK_investigate_error
|   +-- Agent claims
|   +-- Run PROCEDURE_investigate
|   |   +-- Gather context
|   |   +-- Form hypotheses
|   |   +-- Verify best hypothesis
|   |   +-- If confirmed -> diagnosis
|   |   +-- If not -> escalate
|   +-- Create follow-up task or mark resolved
|
+-- HOOK_UNDOC?
    |
    +-- Create task_run -[serves]-> TASK_document_hook
    +-- Agent claims
    +-- Read and analyze hook code
    +-- Write BEHAVIORS documentation
    +-- Mark complete
```
