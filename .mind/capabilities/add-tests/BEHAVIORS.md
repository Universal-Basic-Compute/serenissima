# Add Tests — Behaviors

```
STATUS: CANONICAL
CAPABILITY: add-tests
```

---

## CHAIN

```
OBJECTIVES:      ./OBJECTIVES.md
PATTERNS:        ./PATTERNS.md
VOCABULARY:      ./VOCABULARY.md
THIS:            BEHAVIORS.md (you are here)
ALGORITHM:       ./ALGORITHM.md
```

---

## PURPOSE

Observable behaviors of the add-tests capability.

---

## B1: Missing Tests Detection

**When:** Module exists without test files

```
GIVEN:  Code module exists (src/auth/, lib/utils.py, etc.)
WHEN:   Health check runs (init_scan, cron, file_watch)
THEN:   Check for corresponding tests/{module}/
AND:    If missing → create task_run for MISSING_TESTS
```

**Effect:** Untested modules surface automatically.

---

## B2: Untested Invariant Detection

**When:** Invariant defined but no linked test

```
GIVEN:  VALIDATION.md contains invariant with ID (V1, V2, etc.)
WHEN:   Health check runs
THEN:   Search tests/**/* for VALIDATES: {id}
AND:    If not found → create task_run for INVARIANT_UNTESTED
```

**Effect:** Every invariant has a verifiable test.

---

## B3: Missing Marker Detection

**When:** Tests exist without VALIDATES markers

```
GIVEN:  Test file exists with test functions
WHEN:   Health check runs
THEN:   Scan for VALIDATES: markers
AND:    If missing → create task_run for TEST_NO_VALIDATES
```

**Effect:** All tests are linked to what they prove.

---

## B4: Health Failure Response

**When:** Health check fails

```
GIVEN:  Health check runs
WHEN:   Returns Signal.critical or Signal.degraded
THEN:   Create task_run for HEALTH_FAILED
AND:    Include failure details, timestamp, check name
AND:    Link to relevant module and problem
```

**Effect:** Failures become work items, not ignored alerts.

---

## B5: Task Creation

**When:** Problem detected

```
GIVEN:  MISSING_TESTS, INVARIANT_UNTESTED, TEST_NO_VALIDATES, or HEALTH_FAILED
WHEN:   Detection mechanism runs
THEN:   Create task_run node:
        - nature: "urgently concerns" (if critical)
        - nature: "importantly concerns" (if high)
        - nature: "concerns" (if medium)
AND:    Link task_run -[serves]-> appropriate TASK
AND:    Link task_run -[concerns]-> target module/invariant
AND:    Link task_run -[resolves]-> problem
```

**Effect:** Work items exist for agent pickup.

---

## B6: Agent Pickup

**When:** Agent queries for test work

```
GIVEN:  task_run exists with status: pending
WHEN:   Agent claims task
THEN:   Link agent -[claims]-> task_run
AND:    Load SKILL_write_tests
AND:    task_run status → in_progress
```

**Effect:** Agent equipped to write tests.

---

## B7: Test Creation

**When:** Agent executes procedure

```
GIVEN:  Agent has claimed task, skill loaded
WHEN:   Agent runs PROCEDURE_add_tests
THEN:   Read VALIDATION.md for invariants
AND:    Create test file with test functions
AND:    Add VALIDATES marker to each test
AND:    Run tests to verify they pass
```

**Effect:** Tests created with proper linkage.

---

## B8: Validation

**When:** Agent completes procedure

```
GIVEN:  All steps complete
WHEN:   Validation runs
THEN:   Check: test file exists?
AND:    Check: tests pass?
AND:    Check: VALIDATES markers present?
AND:    Check: markers reference valid invariants?
AND:    If pass → task_run status: completed
AND:    If fail → retry or escalate
```

**Effect:** Quality assured before completion.

---

## B9: Resolution Confirmation

**When:** Task completed

```
GIVEN:  task_run status: completed
WHEN:   Next health check runs
THEN:   Same invariant/module checked
AND:    If tests now exist → problem resolved
AND:    If still missing → investigate
```

**Effect:** Closed loop verification.

---

## BEHAVIOR SUMMARY

| Trigger | Behavior | Output |
|---------|----------|--------|
| No tests for module | Detection | task_run created |
| Invariant untested | Detection | task_run created |
| Test lacks VALIDATES | Detection | task_run created |
| Health check fails | Detection | task_run created |
| Agent available | Pickup | Agent claims task |
| Procedure runs | Creation | Tests written |
| Work done | Validation | Quality checked |
| Check passes | Resolution | Problem gone |
