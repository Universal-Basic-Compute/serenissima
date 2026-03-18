# Create Doc Chain — Validation

```
STATUS: CANONICAL
CAPABILITY: create-doc-chain
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

Invariants for valid doc chain creation. When is the work done correctly?

---

## INVARIANTS

### V1: All Files Present

```
INVARIANT: Complete doc chain has all 9 files

REQUIRED:
  - OBJECTIVES.md
  - PATTERNS.md
  - VOCABULARY.md
  - BEHAVIORS.md
  - ALGORITHM.md
  - VALIDATION.md
  - IMPLEMENTATION.md
  - HEALTH.md
  - SYNC.md

CHECK: ls docs/{module}/*.md | wc -l == 9
```

### V2: No Placeholders

```
INVARIANT: Docs contain real content, not placeholders

FORBIDDEN:
  - "{placeholder}" markers
  - "{Module}" unfilled
  - "STATUS: STUB"
  - Content < 200 chars (excluding headers)

CHECK: grep -r "{" docs/{module}/ returns no template markers
```

### V3: Template Structure

```
INVARIANT: Each doc matches its template structure

REQUIRED:
  - STATUS block present
  - CHAIN section present
  - All required headers from template
  - Correct header order

CHECK: Compare doc structure to template
```

### V4: Chain Links Valid

```
INVARIANT: CHAIN section has valid relative paths

REQUIRED:
  - Each path in CHAIN exists
  - Paths are relative (./*)
  - No broken links

CHECK: For each path in CHAIN, file exists
```

### V5: Code References Accurate

```
INVARIANT: IMPLEMENTATION references real code

REQUIRED:
  - Paths in IMPLEMENTATION exist
  - Code files mentioned are real
  - No stale references

CHECK: All code paths in IMPLEMENTATION exist
```

---

## VALIDATION CHECKS

| Check | Pass Condition |
|-------|----------------|
| Files complete | All 9 present |
| No placeholders | No template markers |
| Structure valid | Matches template |
| Links valid | All CHAIN paths exist |
| Code refs valid | All IMPLEMENTATION paths exist |

---

## ERROR MESSAGES

| Violation | Message |
|-----------|---------|
| Missing file | `Doc chain missing: {file}` |
| Placeholder | `Unfilled placeholder in {file}: {marker}` |
| Bad structure | `{file} missing required section: {section}` |
| Broken link | `CHAIN references non-existent: {path}` |
| Stale code ref | `IMPLEMENTATION references missing: {path}` |

---

## TASK COMPLETION CRITERIA

A task_run for doc creation is **complete** when:

1. All 9 files exist in docs/{module}/
2. No placeholder markers remain
3. All docs pass structure validation
4. All CHAIN links resolve
5. All IMPLEMENTATION paths exist
6. Health check no longer detects problem

If any fail, task remains in_progress or escalates.
