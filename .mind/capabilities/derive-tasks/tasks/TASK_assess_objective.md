# Task: assess_objective

```
NODE: narrative:task
STATUS: active
```

---

## Purpose

Review a stale objective and determine next steps.

---

## Resolves

| Problem | Severity |
|---------|----------|
| STALE_COVERAGE | medium |

---

## Inputs

```yaml
inputs:
  objective_id: string
  statement: string
  days_since_activity: int
  existing_tasks: task_id[]
```

---

## Outputs

```yaml
outputs:
  assessment: blocked|completed|needs_work|deprecated
  reason: string
  next_action: string
```

---

## Executor

```yaml
executor:
  type: agent
  agents: [witness, architect]
```

---

## Validation

Complete when:
1. Objective status determined
2. If blocked: blocker identified
3. If completed: evidence provided
4. If needs_work: new tasks created
5. If deprecated: marked as such

---

## Process

1. Review objective and its tasks
2. Check task statuses
3. Determine why stale:
   - Blocked on external dependency?
   - Actually complete but not marked?
   - Forgotten/deprioritized?
   - No longer relevant?
4. Take appropriate action
5. Update objective status
