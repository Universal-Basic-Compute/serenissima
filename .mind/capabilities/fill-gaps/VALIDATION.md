# Fill Gaps — Validation

```
STATUS: CANONICAL
CAPABILITY: fill-gaps
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

Invariants for valid gap filling. When is the work done correctly?

---

## INVARIANTS

### V1: Gap Marker Removed

```
INVARIANT: After gap fill, no @mind:gap marker remains at that location

REQUIRED:
  - Original @mind:gap text no longer in doc
  - New content exists in its place
  - Content is substantive (> 50 chars)

CHECK: grep "@mind:gap {original_context}" returns no matches
```

### V2: No Broken References After Dedupe

```
INVARIANT: All references to deduplicated content still resolve

REQUIRED:
  - Links to old location redirect or are updated
  - No orphan references in other docs
  - Cross-references from other modules still work

CHECK: All [link](path) targets exist
```

### V3: Doc Under Size Threshold After Split

```
INVARIANT: Split doc is now under 200 lines

REQUIRED:
  - Original doc line count < 200
  - Split files each < 200 lines
  - Total content preserved (no loss)

CHECK: wc -l < 200 for all split files
```

### V4: Archive Integrity

```
INVARIANT: Archived content is not lost

REQUIRED:
  - SYNC_archive.md contains all archived entries
  - Entries have dates and content intact
  - Archive file properly formatted

CHECK: Archived entries recoverable from archive file
```

### V5: Content Quality After Gap Fill

```
INVARIANT: Filled content is meaningful, not placeholder

FORBIDDEN:
  - "TBD", "TODO", "FIXME" in filled content
  - Content < 50 characters
  - Copy of surrounding content verbatim

CHECK: Content passes quality heuristics
```

### V6: Canonical Source Preserved

```
INVARIANT: Deduplication doesn't lose information

REQUIRED:
  - Canonical source has all unique information
  - Secondary has reference to canonical
  - No content lost in consolidation

CHECK: Union of info in both >= info in canonical
```

---

## VALIDATION CHECKS

| Check | Pass Condition |
|-------|----------------|
| Gap removed | No @mind:gap at location |
| References valid | All links resolve |
| Size under limit | line_count < 200 |
| Archive exists | SYNC_archive.md created if entries archived |
| Content quality | Substantive, not placeholder |
| No info loss | Canonical has complete info |

---

## ERROR MESSAGES

| Violation | Message |
|-----------|---------|
| Gap remains | `Gap marker still present in {file}` |
| Broken ref | `Reference to {path} no longer exists` |
| Still large | `{file} still has {lines} lines (max 200)` |
| Missing archive | `Archived entries but no SYNC_archive.md` |
| Bad content | `Filled content appears to be placeholder` |
| Info lost | `Content from {secondary} not in canonical` |

---

## TASK COMPLETION CRITERIA

A task_run for fill-gaps is **complete** when:

### For DOC_GAPS:
1. `@mind:gap` marker removed
2. Substantive content in its place
3. Content passes quality check
4. SYNC updated with resolution note

### For DOC_DUPLICATION:
1. Canonical source identified
2. Secondary references canonical
3. All external refs still work
4. No information lost

### For LARGE_DOC_MODULE:
1. Doc under 200 lines
2. Split files properly linked
3. Archive created if applicable
4. No content lost

If any fail, task remains in_progress or escalates.
