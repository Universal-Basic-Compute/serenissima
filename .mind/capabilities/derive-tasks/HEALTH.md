# Derive Tasks — Health

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
ALGORITHM:       ./ALGORITHM.md
VALIDATION:      ./VALIDATION.md
IMPLEMENTATION:  ./IMPLEMENTATION.md
THIS:            HEALTH.md (you are here)
SYNC:            ./SYNC.md
```

---

## IMPLEMENTS

```yaml
implements:
  runtime: runtime/checks.py
  decorator: @check
```

---

## HEALTH INDICATORS

```yaml
health_indicators:
  - name: orphan_objectives
    purpose: Find objectives with no tasks
    priority: high
    rationale: Orphan objectives mean vision isn't being executed

  - name: low_coverage
    purpose: Find objectives with insufficient progress
    priority: medium
    rationale: Low coverage means work is incomplete

  - name: stale_objectives
    purpose: Find objectives with no recent activity
    priority: low
    rationale: Stale objectives may be blocked or forgotten

  - name: vision_sync
    purpose: Ensure vision docs are parsed into graph
    priority: medium
    rationale: Unparsed docs mean gaps aren't detected
```

---

## INDICATOR: orphan_objectives

### VALUE TO CLIENTS & VALIDATION MAPPING

```yaml
value_and_validation:
  indicator: orphan_objectives
  client_value: Vision objectives get translated into work
  validation:
    - validation_id: V1
      criteria: Every objective has graph node
```

### ALGORITHM / CHECK MECHANISM

```python
@check(
    id="orphan_objectives",
    triggers=[
        triggers.file.on_modify("**/OBJECTIVES*.md"),
        triggers.file.on_modify("**/vision*.md"),
        triggers.file.on_modify("**/roadmap*.md"),
        triggers.cron.daily(),
    ],
    on_problem="ORPHAN_OBJECTIVE",
    task="TASK_derive_tasks",
)
def orphan_objectives(ctx) -> dict:
    """
    Find vision objectives that have no linked tasks.

    Returns CRITICAL if orphans found.
    Returns HEALTHY if all objectives have tasks.
    """
    objectives = parse_all_vision_docs()
    orphans = []

    for obj in objectives:
        tasks = get_tasks_for_objective(obj.id)
        if len(tasks) == 0:
            orphans.append({
                "id": obj.id,
                "statement": obj.statement[:100],
                "source": str(obj.source_file),
            })

    if not orphans:
        return Signal.healthy()

    return Signal.critical(
        orphan_objectives=orphans,
        count=len(orphans),
    )
```

---

## INDICATOR: low_coverage

### ALGORITHM / CHECK MECHANISM

```python
@check(
    id="low_coverage",
    triggers=[
        triggers.cron.daily(),
    ],
    on_problem="LOW_COVERAGE",
    task="TASK_derive_tasks",
)
def low_coverage(ctx) -> dict:
    """
    Find objectives with coverage below threshold.

    Returns DEGRADED if low coverage found.
    Returns HEALTHY if coverage adequate.
    """
    threshold = 0.5
    low = []

    for obj in get_active_objectives():
        coverage = analyze_coverage(obj)
        if coverage.coverage_score < threshold:
            low.append({
                "id": obj.id,
                "statement": obj.statement[:100],
                "coverage": coverage.coverage_score,
                "tasks": coverage.total_tasks,
            })

    if not low:
        return Signal.healthy()

    return Signal.degraded(
        low_coverage_objectives=low,
        count=len(low),
    )
```

---

## INDICATOR: stale_objectives

### ALGORITHM / CHECK MECHANISM

```python
@check(
    id="stale_objectives",
    triggers=[
        triggers.cron.weekly(),
    ],
    on_problem="STALE_COVERAGE",
    task="TASK_assess_objective",
)
def stale_objectives(ctx) -> dict:
    """
    Find objectives with no recent task activity.

    Returns DEGRADED if stale objectives found.
    Returns HEALTHY if all have recent activity.
    """
    stale_days = 30
    stale = []

    for obj in get_active_objectives():
        last_activity = get_last_task_activity(obj.id)
        if last_activity is None:
            continue  # Orphan, handled by other check

        days_since = (now() - last_activity).days
        if days_since > stale_days:
            stale.append({
                "id": obj.id,
                "statement": obj.statement[:100],
                "days_since_activity": days_since,
            })

    if not stale:
        return Signal.healthy()

    return Signal.degraded(
        stale_objectives=stale,
        count=len(stale),
    )
```

---

## INDICATOR: vision_sync

### ALGORITHM / CHECK MECHANISM

```python
@check(
    id="vision_sync",
    triggers=[
        triggers.file.on_modify("**/OBJECTIVES*.md"),
        triggers.file.on_create("**/vision*.md"),
        triggers.init.after_scan(),
    ],
    on_problem="VISION_DESYNC",
    task=None,  # Auto-fix: rescan
)
def vision_sync(ctx) -> dict:
    """
    Ensure all vision docs are parsed into graph.

    Returns DEGRADED if docs not synced.
    Returns HEALTHY if all synced.
    """
    vision_docs = find_vision_docs()
    graph_objectives = get_all_graph_objectives()

    unsynced = []
    for doc in vision_docs:
        doc_objectives = parse_objectives_from_markdown(doc)
        for obj in doc_objectives:
            if obj.id not in graph_objectives:
                unsynced.append({
                    "objective": obj.statement[:100],
                    "source": str(doc),
                })

    if not unsynced:
        return Signal.healthy()

    # Auto-resync
    resync_vision_docs()

    return Signal.degraded(
        unsynced_objectives=unsynced,
        count=len(unsynced),
        action="resynced",
    )
```
