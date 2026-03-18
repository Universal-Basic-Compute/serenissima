# Add Tests — Vocabulary

```
STATUS: CANONICAL
CAPABILITY: add-tests
```

---

## CHAIN

```
OBJECTIVES:      ./OBJECTIVES.md
PATTERNS:        ./PATTERNS.md
THIS:            VOCABULARY.md (you are here)
BEHAVIORS:       ./BEHAVIORS.md
ALGORITHM:       ./ALGORITHM.md
```

---

## PURPOSE

Terms and problems owned by this capability.

---

## TERMS

### invariant

A condition that must always be true. Defined in VALIDATION.md with an ID (V1, V2, etc.).

### VALIDATES marker

A code comment linking a test to an invariant: `# VALIDATES: V1` or `// VALIDATES: V2`.

### test coverage

Not line coverage. Invariant coverage — which VALIDATION invariants have linked tests.

### health check

Runtime verification that system meets expectations. Defined in HEALTH.md, executed by runtime.

---

## PROBLEMS

### PROBLEM: MISSING_TESTS

```yaml
id: MISSING_TESTS
severity: critical
category: tests

definition: |
  A module has no test files. Code exists without any verification.
  The tests/ directory is missing or empty.

detection:
  - Code files exist in module
  - No matching tests/{module}/ folder
  - Or folder exists but contains no test_*.py files

resolves_with: TASK_add_tests

examples:
  - "src/auth/ exists but tests/auth/ missing"
  - "lib/utils.py exists but no tests/test_utils.py"
```

### PROBLEM: INVARIANT_UNTESTED

```yaml
id: INVARIANT_UNTESTED
severity: high
category: tests

definition: |
  A VALIDATION.md file defines an invariant that has no corresponding
  test with a VALIDATES marker. The rule exists but isn't verified.

detection:
  - VALIDATION.md contains invariant ID (V1, V2, etc.)
  - No test file contains "VALIDATES: {invariant_id}"
  - Search tests/**/*.py for VALIDATES markers

resolves_with: TASK_test_invariant

examples:
  - "VALIDATION_Auth.md defines V1 but no test has VALIDATES: V1"
  - "Invariant V3 added but test not written yet"
```

### PROBLEM: TEST_NO_VALIDATES

```yaml
id: TEST_NO_VALIDATES
severity: medium
category: tests

definition: |
  Test files exist but tests don't have VALIDATES markers linking
  them to invariants. Tests run but coverage is untracked.

detection:
  - Test file exists (test_*.py)
  - Test functions exist (def test_*)
  - No VALIDATES: markers in file or function docstrings

resolves_with: TASK_add_validates_markers

examples:
  - "tests/test_auth.py has tests but no VALIDATES markers"
  - "Legacy tests written before marker convention"
```

### PROBLEM: HEALTH_FAILED

```yaml
id: HEALTH_FAILED
severity: critical
category: tests

definition: |
  A health check defined in HEALTH.md returned an error or failure.
  The system is not meeting its defined health criteria.

detection:
  - Health check runs (cron, event, manual)
  - Returns Signal.critical or Signal.degraded
  - Error details captured in result

resolves_with: TASK_fix_health

examples:
  - "Deployment broke a health check"
  - "External dependency became unavailable"
  - "Data corruption triggered health failure"
```

---

## USAGE

```yaml
# In HEALTH.md
on_problem:
  problem_id: MISSING_TESTS
  creates:
    node:
      node_type: narrative
      type: task_run
      nature: "urgently concerns"
    links:
      - nature: "serves"
        to: TASK_add_tests
      - nature: "resolves"
        to: MISSING_TESTS
```
