# Derive Tasks — Implementation

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
THIS:            IMPLEMENTATION.md (you are here)
HEALTH:          ./HEALTH.md
SYNC:            ./SYNC.md
```

---

## FILE STRUCTURE

```
capabilities/derive-tasks/
├── OBJECTIVES.md
├── PATTERNS.md
├── VOCABULARY.md
├── BEHAVIORS.md
├── ALGORITHM.md
├── VALIDATION.md
├── IMPLEMENTATION.md      (this file)
├── HEALTH.md
├── SYNC.md
├── tasks/
│   ├── TASK_derive_tasks.md
│   └── TASK_assess_objective.md
├── skills/
│   └── SKILL_decompose_objective.md
├── procedures/
│   └── PROCEDURE_derive_tasks.yaml
└── runtime/
    ├── __init__.py
    └── checks.py
```

---

## RUNTIME COMPONENTS

### Vision Scanner

```python
@check(
    id="orphan_objectives",
    triggers=[
        triggers.file.on_modify("**/OBJECTIVES*.md"),
        triggers.file.on_modify("**/vision*.md"),
        triggers.cron.daily(),
    ],
    on_problem="ORPHAN_OBJECTIVE",
    task="TASK_derive_tasks",
)
def orphan_objectives(ctx) -> dict:
    """Find vision objectives with no linked tasks."""
    ...
```

### Coverage Monitor

```python
@check(
    id="low_coverage",
    triggers=[
        triggers.cron.daily(),
        triggers.event.on_task_complete(),
    ],
    on_problem="LOW_COVERAGE",
    task="TASK_derive_tasks",
)
def low_coverage(ctx) -> dict:
    """Find objectives with insufficient task coverage."""
    ...
```

---

## INTEGRATION POINTS

### Graph Storage

```yaml
stores:
  vision_objective:
    node_type: narrative
    type: vision_objective
    indexed: [id, source_file, status]

  objective_coverage:
    node_type: narrative
    type: coverage_metric
    indexed: [objective_id]
```

### Task System

```yaml
creates:
  - TASK_derive_tasks (on orphan or low coverage)
  - TASK_assess_objective (on stale coverage)
  - derived tasks (from decomposition)
```

---

## CLI COMMANDS

```bash
# Scan vision docs and show objectives
mind vision scan

# Show coverage for all objectives
mind vision coverage

# Show gaps (orphan/low/stale)
mind vision gaps

# Derive tasks for specific objective
mind vision derive <objective_id>

# Mark objective achieved
mind vision achieve <objective_id>
```

---

## MCP TOOLS

```yaml
vision_scan:
  params: {}
  returns: list of vision_objective

vision_coverage:
  params:
    objective_id: string (optional)
  returns: coverage metrics

vision_gaps:
  params: {}
  returns: list of gaps

vision_derive:
  params:
    objective_id: string
  returns: list of created tasks
```
