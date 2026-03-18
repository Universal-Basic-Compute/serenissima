# Add Tests — Validation

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
BEHAVIORS:       ./BEHAVIORS.md
ALGORITHM:       ./ALGORITHM.md
THIS:            VALIDATION.md (you are here)
IMPLEMENTATION:  ./IMPLEMENTATION.md
```

---

## PURPOSE

Invariants for valid test creation. When is the work done correctly?

---

## INVARIANTS

### V1: Test File Exists

```
INVARIANT: Every module has at least one test file

REQUIRED:
  - tests/{module}/ directory exists
  - Contains at least one test_*.py file
  - Or test_{module}.py exists in tests/

CHECK: ls tests/**/*{module}* returns files
```

### V2: Tests Pass

```
INVARIANT: All tests pass on creation

REQUIRED:
  - pytest tests/{module}/ exits 0
  - No test failures
  - No errors during collection

CHECK: pytest --tb=short tests/{module}/ passes
```

### V3: VALIDATES Markers Present

```
INVARIANT: Every test function has a VALIDATES marker

REQUIRED:
  - Each def test_* has corresponding # VALIDATES: Vn
  - Marker appears in function docstring or comment
  - At least one marker per test function

CHECK: grep -c "VALIDATES:" test_file > 0
```

### V4: Markers Reference Valid Invariants

```
INVARIANT: VALIDATES markers point to real invariants

REQUIRED:
  - Each VALIDATES: Vn references existing invariant
  - Invariant exists in corresponding VALIDATION.md
  - No dangling references

CHECK: All VALIDATES: Vn have matching Vn in VALIDATION.md
```

### V5: Coverage Complete

```
INVARIANT: All invariants have at least one test

REQUIRED:
  - For each Vn in VALIDATION.md
  - At least one test has VALIDATES: Vn
  - No invariant left untested

CHECK: Set(VALIDATION.Vn) == Set(VALIDATES.Vn)
```

### V6: Health Check Resolves

```
INVARIANT: HEALTH_FAILED tasks restore healthy state

REQUIRED:
  - After task completion, health check passes
  - Same check that triggered task now returns healthy
  - No new failures introduced

CHECK: Re-run health check returns Signal.healthy()
```

---

## VALIDATION CHECKS

| Check | Pass Condition |
|-------|----------------|
| File exists | Test file present |
| Tests pass | pytest exits 0 |
| Markers present | Each test has VALIDATES |
| Valid references | Markers match VALIDATION |
| Coverage complete | All invariants covered |
| Health restored | Check now passes |

---

## ERROR MESSAGES

| Violation | Message |
|-----------|---------|
| Missing file | `No test file found for module: {module}` |
| Test failure | `Tests failed: {count} failures in {test_file}` |
| Missing marker | `Test {test_name} has no VALIDATES marker` |
| Invalid reference | `VALIDATES: {id} not found in VALIDATION.md` |
| Coverage gap | `Invariant {id} has no test coverage` |
| Health still failing | `Health check {check_id} still failing after fix` |

---

## TASK COMPLETION CRITERIA

### TASK_add_tests

Complete when:
1. Test file exists in tests/{module}/
2. At least one test function exists
3. All tests pass
4. Health check no longer reports MISSING_TESTS

### TASK_test_invariant

Complete when:
1. Test function written for invariant
2. VALIDATES marker added
3. Test passes
4. Health check no longer reports INVARIANT_UNTESTED for that ID

### TASK_add_validates_markers

Complete when:
1. All test functions have VALIDATES markers
2. All markers reference valid invariants
3. Health check no longer reports TEST_NO_VALIDATES

### TASK_fix_health

Complete when:
1. Root cause identified
2. Fix implemented
3. Health check returns healthy
4. No regressions in other checks
