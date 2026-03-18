# Maintain Links — Validation

```
STATUS: CANONICAL
CAPABILITY: maintain-links
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

Invariants for valid link maintenance. When is the work done correctly?

---

## INVARIANTS

### V1: All IMPL Links Resolve

```
INVARIANT: Every IMPL: marker points to existing file

REQUIRED:
  - Parse all IMPL: markers in all docs
  - Each marker resolves to existing path
  - No dangling references

CHECK: For each IMPL: marker, file exists at path
```

### V2: No Orphan Documentation

```
INVARIANT: Docs have code references

REQUIRED:
  - Doc has at least one valid IMPL: link
  - OR code file has DOCS: pointing to doc

CHECK: union(valid_impls, code_refs) is non-empty per doc
```

### V3: Bidirectional Consistency

```
INVARIANT: IMPL and DOCS markers are symmetric

REQUIRED:
  - If doc has IMPL: to code, code should have DOCS: to doc
  - If code has DOCS: to doc, doc should have IMPL: to code

CHECK: For each IMPL:/DOCS: pair, reverse link exists
```

### V4: Auto-Resolution Correctness

```
INVARIANT: Auto-resolved links point to correct code

REQUIRED:
  - Filename match is exact
  - Only single-match cases auto-resolved
  - Multi-match cases escalate to agent

CHECK: Auto-resolved path contains code related to doc topic
```

### V5: No Data Loss on Fix

```
INVARIANT: Link fixes don't lose doc content

REQUIRED:
  - Fixing IMPL: marker only changes path
  - Document content preserved
  - Removing orphan only after explicit confirmation

CHECK: Doc content hash unchanged (except IMPL: line)
```

---

## VALIDATION CHECKS

| Check | Pass Condition |
|-------|----------------|
| IMPL links valid | All IMPL: paths exist |
| No orphans | Every doc has code reference |
| Bidirectional | IMPL ↔ DOCS pairs match |
| Auto-resolve safe | Only single-match updates |
| Content preserved | Doc hash unchanged |

---

## ERROR MESSAGES

| Violation | Message |
|-----------|---------|
| Broken IMPL | `IMPL: {path} does not exist in {doc}` |
| Orphan doc | `{doc} has no code references (orphan)` |
| Missing reverse | `{doc} has IMPL: to {code} but code has no DOCS:` |
| Bad auto-resolve | `Auto-resolve matched {count} files, escalating` |
| Content lost | `Doc {doc} content changed unexpectedly during fix` |

---

## TASK COMPLETION CRITERIA

### TASK_fix_impl_link Complete When:

1. IMPL: marker updated to valid path
2. Target file exists
3. If new path, code file has DOCS: to doc
4. Health check no longer detects BROKEN_IMPL_LINK

### TASK_fix_orphan_docs Complete When:

One of:
- Doc now has valid IMPL: links (code found)
- Code file now has DOCS: to doc
- Doc archived/deleted (with justification)
- task_run created for code creation

Health check no longer detects ORPHAN_DOCS for this file.
