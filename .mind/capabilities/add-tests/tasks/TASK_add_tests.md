# Task: add_tests

```
NODE: narrative:task
STATUS: active
```

---

## Purpose

Create test files for a module that has no tests.

---

## Resolves

| Problem | Severity |
|---------|----------|
| MISSING_TESTS | critical |

---

## Inputs

```yaml
inputs:
  target: module_id         # Module needing tests
  problem: problem_id       # MISSING_TESTS
```

---

## Outputs

```yaml
outputs:
  test_file: path           # Path to created test file
  test_count: int           # Number of tests written
  validated: boolean        # Did tests pass
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
1. Test file exists in tests/{module}/
2. At least one test function exists
3. All tests pass (pytest exits 0)
4. Health check no longer reports MISSING_TESTS

---

## Instance (task_run)

Created by runtime when HEALTH.on_signal fires:

```yaml
node_type: narrative
type: task_run
nature: "urgently concerns"

links:
  - nature: serves
    to: TASK_add_tests
  - nature: concerns
    to: "{target}"
  - nature: resolves
    to: MISSING_TESTS
```
