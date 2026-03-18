# Solve Markers — Algorithm

```
STATUS: CANONICAL
CAPABILITY: solve-markers
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

How solve-markers works — detection, classification, resolution.

---

## DETECTION ALGORITHM

```python
def scan_markers(project_root):
    """
    Scan project for all marker types.
    Called by: cron:daily, file_watch, mind doctor
    """

    markers = []

    # 1. Scan for @mind:escalation
    for file_path in glob(project_root, "**/*"):
        content = read(file_path)
        for match in regex_find(content, r"@mind:escalation\s+(.+?)(?:\n|$)"):
            age = get_marker_age(file_path, match.line)
            markers.append({
                "type": "ESCALATION",
                "file": file_path,
                "line": match.line,
                "context": match.group(1),
                "age_hours": age,
                "stale": age > 48
            })

    # 2. Scan for @mind:proposition
    for file_path in glob(project_root, "**/*"):
        content = read(file_path)
        for match in regex_find(content, r"@mind:proposition\s+(.+?)(?:\n|$)"):
            age = get_marker_age(file_path, match.line)
            markers.append({
                "type": "SUGGESTION",
                "file": file_path,
                "line": match.line,
                "context": match.group(1),
                "age_days": age / 24,
                "stale": age > 168  # 7 days
            })

    # 3. Scan for legacy markers
    code_extensions = [".py", ".ts", ".js", ".go", ".rs", ".java"]
    for file_path in glob(project_root, "**/*", extensions=code_extensions):
        if is_test_file(file_path) or is_vendored(file_path):
            continue
        content = read(file_path)
        for match in regex_find(content, r"(TODO|FIXME|HACK|XXX)[:\s]+(.+?)(?:\n|$)"):
            age = get_line_age_git(file_path, match.line)
            markers.append({
                "type": "LEGACY_MARKER",
                "file": file_path,
                "line": match.line,
                "marker_type": match.group(1),
                "context": match.group(2),
                "age_days": age,
                "stale": age > 30
            })

    # 4. Scan for unresolved questions
    for file_path in glob(project_root, "**/*"):
        content = read(file_path)
        for match in regex_find(content, r"@mind:question\s+(.+?)(?:\n|$)"):
            age = get_marker_age(file_path, match.line)
            markers.append({
                "type": "UNRESOLVED_QUESTION",
                "file": file_path,
                "line": match.line,
                "context": match.group(1),
                "age_days": age / 24,
                "stale": age > 336  # 14 days
            })

    return markers
```

---

## CLASSIFICATION ALGORITHM

```python
def classify_and_route(marker):
    """
    Determine task and agent for a marker.
    Called when: stale marker detected
    """

    routes = {
        "ESCALATION": {
            "task": "TASK_resolve_escalation",
            "agent": "architect",
            "nature": "urgently concerns",
            "priority": "critical"
        },
        "SUGGESTION": {
            "task": "TASK_evaluate_proposition",
            "agent": "architect",
            "nature": "concerns",
            "priority": "medium"
        },
        "LEGACY_MARKER": {
            "task": "TASK_fix_legacy_marker",
            "agent": "fixer",
            "nature": "concerns",
            "priority": "low"
        },
        "UNRESOLVED_QUESTION": {
            "task": "TASK_answer_question",
            "agent": "witness",
            "nature": "concerns",
            "priority": "medium"
        }
    }

    return routes[marker["type"]]
```

---

## TASK CREATION ALGORITHM

```python
def create_marker_task(marker):
    """
    Create task_run from detected marker.
    Called when: stale marker detected by health check
    """

    route = classify_and_route(marker)

    # Create task_run node
    task_run = create_node(
        node_type="narrative",
        type="task_run",
        nature=route["nature"],
        content=f"""
        # Resolve {marker['type']}: {marker['file']}:{marker['line']}

        Type: {marker['type']}
        File: {marker['file']}
        Line: {marker['line']}
        Context: {marker['context']}
        Age: {marker.get('age_hours') or marker.get('age_days')}

        ## Required Action
        {get_action_description(marker['type'])}
        """,
        synthesis=f"Resolve {marker['type']} in {marker['file']}"
    )

    # Create links
    create_link(task_run, route["task"], nature="serves")
    create_link(task_run, marker["file"], nature="concerns")
    create_link(task_run, marker["type"], nature="resolves")

    return task_run


def get_action_description(marker_type):
    descriptions = {
        "ESCALATION": "Review context, make decision or escalate to human, document rationale.",
        "SUGGESTION": "Evaluate feasibility and value, accept/reject/defer, create task if accepted.",
        "LEGACY_MARKER": "Fix the issue or convert to tracked task with proper description.",
        "UNRESOLVED_QUESTION": "Research the answer, document it, update code/docs."
    }
    return descriptions[marker_type]
```

---

## RESOLUTION ALGORITHMS

### Resolve Escalation

```python
def resolve_escalation(task_run, agent):
    """
    Agent resolves an escalation.
    Requires: decision authority or human escalation
    """

    # 1. Read context
    file_content = read_context(task_run.file, task_run.line, context_lines=20)

    # 2. Analyze options
    analysis = agent.analyze(f"""
    Escalation: {task_run.context}
    File context: {file_content}

    Identify:
    - What decision is needed
    - What options exist
    - Tradeoffs of each option
    - Recommended option with rationale
    """)

    # 3. If agent can decide
    if analysis.confidence > 0.8 and not analysis.requires_human:
        decision = analysis.recommendation
        rationale = analysis.rationale
    else:
        # Escalate to human
        return escalate_to_human(task_run, analysis)

    # 4. Document decision
    add_decision_record(task_run.file, decision, rationale)

    # 5. Remove marker
    remove_marker(task_run.file, task_run.line)

    return complete(task_run)
```

### Evaluate Proposition

```python
def evaluate_proposition(task_run, agent):
    """
    Agent evaluates a proposition.
    Determines: accept, reject, or defer
    """

    # 1. Read context
    file_content = read_context(task_run.file, task_run.line, context_lines=20)

    # 2. Evaluate
    evaluation = agent.evaluate(f"""
    Proposition: {task_run.context}
    File context: {file_content}

    Evaluate:
    - Feasibility (easy/medium/hard)
    - Value (low/medium/high)
    - Effort (hours/days/weeks)
    - Risk (breaking changes, complexity)

    Recommend: accept, reject, or defer
    """)

    # 3. Disposition
    if evaluation.recommendation == "accept":
        # Create implementation task
        create_task("implement_improvement", {
            "description": task_run.context,
            "file": task_run.file,
            "effort": evaluation.effort
        })
        disposition = "ACCEPTED: Task created"

    elif evaluation.recommendation == "reject":
        disposition = f"REJECTED: {evaluation.rationale}"

    else:
        disposition = f"DEFERRED: {evaluation.rationale}"

    # 4. Document
    add_disposition_comment(task_run.file, task_run.line, disposition)

    # 5. Remove marker
    remove_marker(task_run.file, task_run.line)

    return complete(task_run)
```

### Fix Legacy Marker

```python
def fix_legacy_marker(task_run, agent):
    """
    Agent fixes or converts a legacy marker.
    Options: fix now, convert to task, or delete if obsolete
    """

    # 1. Read context
    file_content = read_context(task_run.file, task_run.line, context_lines=20)

    # 2. Analyze
    analysis = agent.analyze(f"""
    Marker: {task_run.marker_type}: {task_run.context}
    File context: {file_content}

    Determine:
    - Is this still relevant?
    - Can it be fixed quickly (< 30 min)?
    - If not fixable, what task description captures it?
    """)

    # 3. Action
    if not analysis.is_relevant:
        # Delete obsolete marker
        remove_marker(task_run.file, task_run.line)
        return complete(task_run, action="deleted_obsolete")

    if analysis.quick_fix:
        # Fix it now
        agent.apply_fix(analysis.fix)
        remove_marker(task_run.file, task_run.line)
        return complete(task_run, action="fixed")

    else:
        # Convert to tracked task
        create_task("fix_technical_debt", {
            "description": analysis.task_description,
            "file": task_run.file,
            "line": task_run.line,
            "effort": analysis.effort
        })
        # Replace with task reference
        replace_marker_with_reference(task_run.file, task_run.line)
        return complete(task_run, action="converted_to_task")
```

### Answer Question

```python
def answer_question(task_run, agent):
    """
    Agent researches and answers a question.
    """

    # 1. Read context
    file_content = read_context(task_run.file, task_run.line, context_lines=20)

    # 2. Research
    research = agent.research(f"""
    Question: {task_run.context}
    File context: {file_content}

    Research:
    - What is the answer?
    - What evidence supports this?
    - Are there caveats or edge cases?
    """)

    # 3. Document answer
    if research.confidence > 0.7:
        answer = research.answer
        # Add answer as comment or doc update
        add_answer(task_run.file, task_run.line, answer)
        remove_marker(task_run.file, task_run.line)
        return complete(task_run)
    else:
        # Need human input
        return escalate_to_human(task_run, research)
```

---

## DECISION TREE

```
Marker detected
|
+-- What type?
    |
    +-- ESCALATION (stale > 48h)
    |   +-- Create urgent task_run
    |   +-- Route to architect
    |   +-- Decide or escalate to human
    |
    +-- SUGGESTION (stale > 7d)
    |   +-- Create medium task_run
    |   +-- Route to architect
    |   +-- Evaluate → accept/reject/defer
    |
    +-- LEGACY_MARKER (stale > 30d)
    |   +-- Create low task_run
    |   +-- Route to fixer
    |   +-- Fix or convert to task
    |
    +-- UNRESOLVED_QUESTION (stale > 14d)
        +-- Create medium task_run
        +-- Route to witness
        +-- Research and document
```
