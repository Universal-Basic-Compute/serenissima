# Task: complete_impl

```
NODE: narrative:task
STATUS: active
```

---

## Purpose

Complete partial implementations marked with TODO/FIXME/XXX/HACK comments.

---

## Resolves

| Problem | Severity |
|---------|----------|
| INCOMPLETE_IMPL | high |

---

## Inputs

```yaml
inputs:
  target: file_path      # Code file with incomplete markers
  markers: marker[]      # List of {line, text, type}
  problem: problem_id    # INCOMPLETE_IMPL
```

---

## Outputs

```yaml
outputs:
  markers_resolved: int     # Count of markers removed
  code_completed: boolean   # Was the code actually completed
  tests_passed: boolean     # Did tests pass
  validated: boolean        # Did completion pass validation
```

---

## Executor

```yaml
executor:
  type: agent
  agents: [groundwork, fixer]
```

---

## Uses

```yaml
uses:
  skill: SKILL_implement
```

---

## Executes

```yaml
executes:
  procedure: PROCEDURE_implement
```

---

## Validation

Complete when:
1. TODO/FIXME/XXX/HACK markers removed at addressed locations
2. Code at those locations is functionally complete
3. No partial implementations remain
4. Tests pass
5. No regressions introduced
6. Health check no longer detects INCOMPLETE_IMPL for these markers

---

## Instance (task_run)

Created by runtime when HEALTH.on_signal fires:

```yaml
node_type: narrative
type: task_run
nature: "importantly concerns"

links:
  - nature: serves
    to: TASK_complete_impl
  - nature: concerns
    to: "{target}"
  - nature: resolves
    to: INCOMPLETE_IMPL
```
