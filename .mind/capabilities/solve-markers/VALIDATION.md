# Solve Markers — Validation

```
STATUS: CANONICAL
CAPABILITY: solve-markers
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

Invariants for valid marker resolution. When is the work done correctly?

---

## INVARIANTS

### V1: Marker Removed

```
INVARIANT: Resolved markers no longer exist in source

REQUIRED:
  - Original marker pattern not found at original location
  - No duplicate markers created

CHECK: grep -n "{marker_pattern}" {file} returns empty
```

### V2: Decision Documented

```
INVARIANT: Escalation resolutions have documented decisions

REQUIRED:
  - Decision record exists (in code comment, doc, or graph)
  - Rationale captured
  - Decision linked to original escalation

CHECK: Decision record exists and references original marker
```

### V3: Proposition Disposition

```
INVARIANT: Every evaluated proposition has a disposition

REQUIRED:
  - Status: accepted, rejected, or deferred
  - If accepted: task created
  - If rejected/deferred: rationale documented

CHECK: Disposition record exists for proposition
```

### V4: Legacy Marker Converted

```
INVARIANT: Fixed or tracked legacy markers have proper records

REQUIRED:
  - If fixed: code changed, marker removed
  - If converted: task exists with description
  - If deleted: confirmed obsolete

CHECK: Action recorded, marker gone or converted
```

### V5: Question Answered

```
INVARIANT: Resolved questions have documented answers

REQUIRED:
  - Answer exists near original question
  - Answer is substantive (not placeholder)
  - Marker removed after answering

CHECK: Answer present, marker absent
```

### V6: No Stale Markers

```
INVARIANT: System maintains freshness thresholds

REQUIRED:
  - No ESCALATION older than 48h
  - No SUGGESTION older than 7d without evaluation
  - No LEGACY_MARKER older than 30d
  - No UNRESOLVED_QUESTION older than 14d

CHECK: mind doctor reports no stale markers
```

---

## VALIDATION CHECKS

| Check | Pass Condition |
|-------|----------------|
| Marker removed | Pattern not found at location |
| Decision documented | Decision record exists |
| Disposition recorded | Accept/reject/defer with rationale |
| Action completed | Fix applied or task created |
| Answer documented | Substantive answer present |
| Freshness maintained | No markers exceed age thresholds |

---

## ERROR MESSAGES

| Violation | Message |
|-----------|---------|
| Marker still exists | `Marker not removed: {file}:{line}` |
| No decision record | `Escalation resolved without decision: {marker}` |
| Missing disposition | `Proposition evaluated without disposition: {marker}` |
| Orphan marker | `Legacy marker neither fixed nor tracked: {marker}` |
| Unanswered question | `Question marked resolved but no answer: {marker}` |
| Stale marker | `{type} stale ({age}): {file}:{line}` |

---

## TASK COMPLETION CRITERIA

A task_run for marker resolution is **complete** when:

1. Original marker no longer exists at source location
2. Appropriate record exists (decision, disposition, answer)
3. If action created work, task exists for that work
4. Health check no longer detects problem
5. SYNC updated with resolution note

If any fail, task remains in_progress or escalates.
