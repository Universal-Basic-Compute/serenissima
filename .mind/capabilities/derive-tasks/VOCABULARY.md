# Derive Tasks — Vocabulary

```
STATUS: CANONICAL
CAPABILITY: derive-tasks
```

---

## CHAIN

```
OBJECTIVES:      ./OBJECTIVES.md
PATTERNS:        ./PATTERNS.md
THIS:            VOCABULARY.md (you are here)
BEHAVIORS:       ./BEHAVIORS.md
```

---

## TERMS

### vision_objective

A stated goal from a vision/objectives document. Abstract, aspirational.

```yaml
term: vision_objective
fields:
  id: string
  statement: string           # The objective text
  source_file: path           # Where it came from
  priority: critical|high|medium|low
  status: active|achieved|deprecated
```

### objective_coverage

Measure of how well an objective is addressed by tasks.

```yaml
term: objective_coverage
fields:
  objective_id: string
  total_tasks: int
  completed_tasks: int
  in_progress_tasks: int
  coverage_score: float       # 0.0 to 1.0
```

### gap

Missing work between vision and reality.

```yaml
term: gap
fields:
  objective_id: string
  gap_type: missing|incomplete|stale
  description: string
  suggested_tasks: task[]
```

### derived_task

Task created from vision decomposition.

```yaml
term: derived_task
fields:
  task_id: string
  source_objective: vision_objective
  scope: string               # Concrete, actionable description
  inputs: dict
  outputs: dict
  completion_criteria: string[]
```

---

## PROBLEMS

### ORPHAN_OBJECTIVE

Vision objective exists with no linked tasks.

```yaml
problem: ORPHAN_OBJECTIVE
severity: high
inputs:
  objective: vision_objective
resolves_with: TASK_derive_tasks
```

### STALE_COVERAGE

Objective has tasks but all are old/completed, yet objective not marked achieved.

```yaml
problem: STALE_COVERAGE
severity: medium
inputs:
  objective: vision_objective
  last_task_completed: datetime
resolves_with: TASK_assess_objective
```

### LOW_COVERAGE

Objective partially addressed but significant gaps remain.

```yaml
problem: LOW_COVERAGE
severity: medium
inputs:
  objective: vision_objective
  coverage_score: float
resolves_with: TASK_derive_tasks
```

---

## STATES

### objective_lifecycle

```yaml
states:
  - parsed: Extracted from doc, not yet analyzed
  - analyzed: Checked against current state
  - covered: Has sufficient tasks
  - achieved: Objective met, evidence confirmed
  - deprecated: No longer a goal
```
