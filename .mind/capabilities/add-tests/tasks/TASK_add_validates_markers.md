# Task: add_validates_markers

```
NODE: narrative:task
STATUS: active
```

---

## Purpose

Add VALIDATES markers to tests that lack them.

---

## Resolves

| Problem | Severity |
|---------|----------|
| TEST_NO_VALIDATES | medium |

---

## Inputs

```yaml
inputs:
  target: test_file         # Path to test file
  problem: problem_id       # TEST_NO_VALIDATES
```

---

## Outputs

```yaml
outputs:
  markers_added: int        # Number of markers added
  invariants_linked: list   # List of invariant IDs linked
  validated: boolean        # All markers reference valid invariants
```

---

## Executor

```yaml
executor:
  type: agent
  agents: [keeper, voice]
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
  procedure: PROCEDURE_add_validates_markers
```

---

## Validation

Complete when:
1. All test functions have VALIDATES markers
2. All markers reference valid invariants in VALIDATION.md
3. Tests still pass after modification
4. Health check no longer reports TEST_NO_VALIDATES

---

## Process

```yaml
process:
  1. Read test file
  2. Extract test function names
  3. For each test:
     a. Determine which invariant it validates
     b. Find invariant ID in VALIDATION.md
     c. Add VALIDATES: {id} comment
  4. Verify markers reference valid invariants
  5. Run tests to confirm no breakage
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
    to: TASK_add_validates_markers
  - nature: concerns
    to: "{target}"
  - nature: resolves
    to: TEST_NO_VALIDATES
```
