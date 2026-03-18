# Task: derive_tasks

```
NODE: narrative:task
STATUS: active
```

---

## Purpose

Decompose a vision objective into concrete, actionable tasks.

---

## Resolves

| Problem | Severity |
|---------|----------|
| ORPHAN_OBJECTIVE | high |
| LOW_COVERAGE | medium |

---

## Inputs

```yaml
inputs:
  objective_id: string        # Which objective to decompose
  statement: string           # The objective statement
  source_file: path           # Where it came from
  existing_tasks: task_id[]   # Already linked tasks (if any)
```

---

## Outputs

```yaml
outputs:
  derived_tasks: task[]       # New tasks created
  coverage_after: float       # Coverage score after derivation
```

---

## Executor

```yaml
executor:
  type: agent
  agents: [architect, groundwork, voice]
```

---

## Uses

```yaml
uses:
  skill: SKILL_decompose_objective
```

---

## Validation

Complete when:
1. Objective decomposed into agent-executable tasks
2. Each task has clear completion criteria
3. Tasks linked back to objective
4. Coverage score > 0.8

---

## Process

1. Read and understand the objective
2. Assess current state (what exists already?)
3. Identify gaps (what's missing?)
4. Decompose gaps into concrete tasks
5. Ensure each task is:
   - Specific (not vague)
   - Actionable (an agent can do it)
   - Measurable (clear done criteria)
6. Create tasks with links to objective
7. Verify coverage increased
