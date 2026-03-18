# Task: evaluate_proposition

```
NODE: narrative:task
STATUS: active
```

---

## Purpose

Evaluate a @mind:proposition marker and determine disposition: accept, reject, or defer.

---

## Resolves

| Problem | Severity |
|---------|----------|
| SUGGESTION | medium |

---

## Inputs

```yaml
inputs:
  target: file_path:line     # Location of proposition
  context: string            # Proposition message/context
  age_days: number           # How long it's been stale
  problem: problem_id        # SUGGESTION
```

---

## Outputs

```yaml
outputs:
  disposition: enum          # accepted | rejected | deferred
  rationale: string          # Why this disposition
  task_created: task_id      # If accepted, new task ID
  marker_removed: boolean    # Was marker removed
```

---

## Executor

```yaml
executor:
  type: agent
  agents: [architect, voice]
```

---

## Uses

```yaml
uses:
  skill: SKILL_solve_markers
```

---

## Executes

```yaml
executes:
  procedure: PROCEDURE_solve_markers
  params:
    marker_type: SUGGESTION
```

---

## Validation

Complete when:
1. Disposition determined (accept/reject/defer)
2. Rationale documented
3. If accepted: implementation task created
4. Original marker removed from file
5. Health check passes (problem resolved)

---

## Process

```yaml
process:
  1. Read proposition context and surrounding code
  2. Evaluate:
     - Feasibility (easy/medium/hard)
     - Value (low/medium/high)
     - Effort estimate
     - Risk assessment
  3. Determine disposition:
     - Accept if value > effort and feasible
     - Reject if low value or high risk
     - Defer if needs more information
  4. If accepted: create implementation task
  5. Document disposition and rationale
  6. Remove original marker
  7. Update SYNC
```

---

## Instance (task_run)

Created by runtime when HEALTH.on_signal fires:

```yaml
node_type: narrative
type: task_run
nature: "concerns"

links:
  - nature: serves
    to: TASK_evaluate_proposition
  - nature: concerns
    to: "{target}"
  - nature: resolves
    to: SUGGESTION
```
