# Implement Code — Validation

```
STATUS: CANONICAL
CAPABILITY: implement-code
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

Invariants for valid implementation work. When is the work done correctly?

---

## INVARIANTS

### V1: No Stubs Remain

```
INVARIANT: After STUB_IMPL task, function has real implementation

FORBIDDEN:
  - `pass` as only statement
  - `...` as only statement
  - `raise NotImplementedError`
  - Empty function body

CHECK: AST parse shows function body with statements
```

### V2: No TODOs Remain

```
INVARIANT: After INCOMPLETE_IMPL task, no incomplete markers

FORBIDDEN:
  - TODO comments at addressed location
  - FIXME comments at addressed location
  - Partial implementations

CHECK: grep for markers at task.line returns empty
```

### V3: ALGORITHM Exists and Complete

```
INVARIANT: After UNDOC_IMPL task, ALGORITHM.md is real

REQUIRED:
  - docs/{module}/ALGORITHM.md exists
  - No placeholder markers
  - STATUS is not STUB
  - Contains at least one algorithm section
  - Links to IMPLEMENTATION.md

CHECK: File exists, > 500 chars, has ## headers
```

### V4: Docs Match Code

```
INVARIANT: After STALE_IMPL task, docs are synchronized

REQUIRED:
  - LAST_UPDATED within 7 days of code mtime
  - ALGORITHM describes current behavior
  - No contradictions with implementation

CHECK: Date comparison passes, manual or automated diff
```

### V5: Tests Pass

```
INVARIANT: Implemented code passes existing tests

REQUIRED:
  - No test failures after implementation
  - No new test failures introduced
  - Coverage maintained or improved

CHECK: pytest/jest returns exit 0
```

### V6: Code Follows ALGORITHM

```
INVARIANT: Implementation matches ALGORITHM spec

REQUIRED:
  - Pseudocode in ALGORITHM matches real code logic
  - Decision points align
  - Data flows match

CHECK: Manual review or agent verification
```

---

## VALIDATION CHECKS

| Check | Pass Condition |
|-------|----------------|
| No stubs | AST shows real body |
| No TODOs | No markers at location |
| ALGORITHM exists | File present, not stub |
| Docs synced | Dates within threshold |
| Tests pass | Exit code 0 |
| Spec match | Logic aligns with ALGORITHM |

---

## ERROR MESSAGES

| Violation | Message |
|-----------|---------|
| Stub remains | `Function {name} still has stub body` |
| TODO remains | `TODO marker still at line {line}` |
| No ALGORITHM | `Missing ALGORITHM.md for {module}` |
| ALGORITHM stub | `ALGORITHM.md is still a placeholder` |
| Stale docs | `Docs {days} days behind code` |
| Tests fail | `{count} tests failed after implementation` |

---

## TASK COMPLETION CRITERIA

### TASK_implement_stub Complete When:

1. Function body has real statements (not stub)
2. Related tests pass
3. Implementation follows ALGORITHM spec (if exists)

### TASK_complete_impl Complete When:

1. TODO/FIXME marker removed
2. Code at that location is complete
3. Tests pass
4. No new issues introduced

### TASK_document_impl Complete When:

1. ALGORITHM.md exists
2. No placeholder markers
3. Contains at least one algorithm description
4. Links to IMPLEMENTATION.md properly
5. STATUS is CANONICAL or DESIGNING

### TASK_update_impl_docs Complete When:

1. LAST_UPDATED is today
2. Content reflects recent code changes
3. No stale descriptions remain
4. SYNC updated with change note

If any fail, task remains in_progress or escalates.
