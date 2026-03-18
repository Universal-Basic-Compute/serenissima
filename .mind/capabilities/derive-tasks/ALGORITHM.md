# Derive Tasks — Algorithm

```
STATUS: CANONICAL
CAPABILITY: derive-tasks
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

## CORE ALGORITHMS

### A1: Vision Document Parsing

```
FUNCTION parse_vision_docs() -> List[VisionObjective]:
    objectives = []

    # Find vision docs
    patterns = [
        "**/OBJECTIVES*.md",
        "**/vision*.md",
        "**/roadmap*.md",
        "**/goals*.md",
    ]

    FOR pattern IN patterns:
        FOR file IN glob(pattern):
            doc_objectives = parse_objectives_from_markdown(file)
            objectives.extend(doc_objectives)

    RETURN objectives


FUNCTION parse_objectives_from_markdown(file) -> List[VisionObjective]:
    content = read(file)
    objectives = []

    # Strategy 1: Ranked objectives sections
    # Look for "## O1:", "### O2:", etc.
    ranked_pattern = r"#+\s*O(\d+)[:\s]+(.+)"
    FOR match IN regex_findall(ranked_pattern, content):
        objectives.append(VisionObjective(
            id=f"{file.stem}_O{match[0]}",
            statement=match[1],
            source_file=file,
            priority=priority_from_rank(match[0]),
        ))

    # Strategy 2: Bullet points under "Objectives" header
    # Look for "## Objectives" followed by bullets
    IF "## Objectives" IN content OR "## Goals" IN content:
        bullets = extract_bullets_after_header(content, "Objectives|Goals")
        FOR i, bullet IN enumerate(bullets):
            objectives.append(VisionObjective(
                id=f"{file.stem}_goal_{i}",
                statement=bullet,
                source_file=file,
            ))

    RETURN objectives
```

### A2: Coverage Analysis

```
FUNCTION analyze_coverage(objective: VisionObjective) -> ObjectiveCoverage:
    # Find linked tasks
    tasks = graph_query(
        f"MATCH (t:task)-[:serves|derived_from]->(o:vision_objective {{id: '{objective.id}'}}) RETURN t"
    )

    total = len(tasks)
    completed = count(t for t in tasks if t.status == 'completed')
    in_progress = count(t for t in tasks if t.status == 'in_progress')

    IF total == 0:
        score = 0.0
    ELSE:
        # Weight completed fully, in_progress half
        score = (completed + 0.5 * in_progress) / total

    RETURN ObjectiveCoverage(
        objective_id=objective.id,
        total_tasks=total,
        completed_tasks=completed,
        in_progress_tasks=in_progress,
        coverage_score=score,
    )
```

### A3: Gap Detection

```
FUNCTION detect_gaps() -> List[Gap]:
    gaps = []

    FOR objective IN get_all_vision_objectives():
        coverage = analyze_coverage(objective)

        IF coverage.total_tasks == 0:
            gaps.append(Gap(
                objective_id=objective.id,
                gap_type="missing",
                description=f"No tasks exist for: {objective.statement}",
            ))
        ELIF coverage.coverage_score < 0.5:
            gaps.append(Gap(
                objective_id=objective.id,
                gap_type="incomplete",
                description=f"Low coverage ({coverage.coverage_score:.0%}): {objective.statement}",
            ))
        ELIF is_stale(coverage):
            gaps.append(Gap(
                objective_id=objective.id,
                gap_type="stale",
                description=f"No recent activity: {objective.statement}",
            ))

    RETURN gaps


FUNCTION is_stale(coverage: ObjectiveCoverage) -> bool:
    IF coverage.completed_tasks == coverage.total_tasks:
        RETURN FALSE  # Fully complete, not stale

    # Check last activity
    last_update = get_last_task_update(coverage.objective_id)
    RETURN (now() - last_update) > timedelta(days=30)
```

### A4: Task Derivation

```
FUNCTION derive_tasks(objective: VisionObjective) -> List[DerivedTask]:
    """
    Agent-executed: Decompose objective into concrete tasks.
    """
    tasks = []

    # Analyze current state
    current_state = assess_current_state(objective)

    # Identify what's missing
    missing = identify_missing_work(objective, current_state)

    FOR work_item IN missing:
        # Ensure actionable scope
        IF is_too_broad(work_item):
            sub_items = decompose_further(work_item)
            FOR sub IN sub_items:
                tasks.append(create_derived_task(sub, objective))
        ELSE:
            tasks.append(create_derived_task(work_item, objective))

    RETURN tasks


FUNCTION create_derived_task(work_item, objective) -> DerivedTask:
    RETURN DerivedTask(
        task_id=generate_id(),
        source_objective=objective,
        scope=work_item.description,
        inputs=work_item.required_inputs,
        outputs=work_item.expected_outputs,
        completion_criteria=work_item.done_when,
        links=[
            Link(nature="serves", to=objective.id),
            Link(nature="derived_from", to=objective.id),
        ],
    )
```

---

## DATA STRUCTURES

### Vision Objective Node

```yaml
node_type: narrative
type: vision_objective

content:
  id: "auth_O1"
  statement: "Users can log in securely"
  priority: critical
  status: active

links:
  - nature: extracted_from
    to: "docs/auth/OBJECTIVES.md"
```

### Derived Task Node

```yaml
node_type: narrative
type: task_run

content:
  scope: "Implement password hashing using bcrypt"
  completion_criteria:
    - "bcrypt installed"
    - "hash_password() function exists"
    - "Unit tests pass"

links:
  - nature: serves
    to: TASK_implement_feature
  - nature: derived_from
    to: "auth_O1"
```
