# Task: test_invariant

```
NODE: narrative:task
STATUS: active
```

---

## Purpose

Write test for a specific invariant that lacks coverage.

---

## Resolves

| Problem | Severity |
|---------|----------|
| INVARIANT_UNTESTED | high |

---

## Inputs

```yaml
inputs:
  target: invariant_id      # Invariant ID (V1, V2, etc.)
  source: validation_file   # Path to VALIDATION.md
  problem: problem_id       # INVARIANT_UNTESTED
```

---

## Outputs

```yaml
outputs:
  test_file: path           # Path to test file (new or existing)
  test_function: string     # Name of test function
  validated: boolean        # Did test pass
```

---

## Executor

```yaml
executor:
  type: agent
  agents: [keeper, groundwork]
```

---

## Uses

```yaml
uses:
  skill: SKILL_write_tests
```

---

## Executes

```yaml
executes:
  procedure: PROCEDURE_add_tests
```

---

## Validation

Complete when:
1. Test function exists for invariant
2. Test has VALIDATES: {invariant_id} marker
3. Test passes
4. Health check no longer reports INVARIANT_UNTESTED for this ID

---

## Instance (task_run)

Created by runtime when HEALTH.on_signal fires:

```yaml
node_type: narrative
type: task_run
nature: "importantly concerns"

links:
  - nature: serves
    to: TASK_test_invariant
  - nature: concerns
    to: "{target}"
  - nature: resolves
    to: INVARIANT_UNTESTED
```
