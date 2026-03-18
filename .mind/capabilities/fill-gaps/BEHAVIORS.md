# Fill Gaps — Behaviors

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
THIS:            BEHAVIORS.md (you are here)
ALGORITHM:       ./ALGORITHM.md
```

---

## PURPOSE

Observable behaviors of the fill-gaps capability.

---

## B1: Gap Detection

**When:** Health check scans documentation

```
GIVEN:  Doc file contains "@mind:gap" marker
WHEN:   Health check runs (init_scan, cron, doc_watch)
THEN:   Extract gap context (marker text, surrounding content)
AND:    Create task_run for DOC_GAPS
```

**Effect:** Gaps surface automatically for resolution.

---

## B2: Duplication Detection

**When:** Health check compares doc content

```
GIVEN:  Two doc files exist
WHEN:   Health check runs (cron:weekly, post_ingest)
THEN:   Compute content similarity (exclude headers, CHAIN sections)
AND:    If similarity > 30% → create task_run for DOC_DUPLICATION
```

**Effect:** Duplicate content flagged for consolidation.

---

## B3: Size Detection

**When:** Health check measures doc length

```
GIVEN:  Doc file exists
WHEN:   Health check runs (init_scan, cron:daily, doc_watch)
THEN:   Count lines in file
AND:    If lines > 200 → create task_run for LARGE_DOC_MODULE
```

**Effect:** Oversized docs flagged for splitting.

---

## B4: Task Creation

**When:** Problem detected

```
GIVEN:  DOC_GAPS, DOC_DUPLICATION, or LARGE_DOC_MODULE found
WHEN:   Detection mechanism runs
THEN:   Create task_run node:
        - nature: "importantly concerns" (DOC_GAPS)
        - nature: "concerns" (DOC_DUPLICATION)
        - nature: "optionally concerns" (LARGE_DOC_MODULE)
AND:    Link task_run -[serves]-> appropriate TASK
AND:    Link task_run -[concerns]-> target doc
AND:    Link task_run -[resolves]-> problem
```

**Effect:** Work items exist for agent pickup.

---

## B5: Gap Filling

**When:** Agent executes gap fill procedure

```
GIVEN:  Agent has claimed gap task, skill loaded
WHEN:   Agent runs PROCEDURE_fill_gaps
THEN:   Read gap marker context
AND:    Research content (code, related docs, external)
AND:    Write content to replace gap marker
AND:    Remove @mind:gap marker
AND:    Update SYNC with resolution note
```

**Effect:** Gap filled with actual content.

---

## B6: Content Deduplication

**When:** Agent executes dedupe procedure

```
GIVEN:  Agent has claimed dedupe task, skill loaded
WHEN:   Agent runs PROCEDURE_fill_gaps (dedupe mode)
THEN:   Read both duplicate docs
AND:    Determine canonical source (more complete, older, better location)
AND:    Move content to canonical if needed
AND:    Replace duplicate with reference/link
AND:    Verify all refs to duplicate still work
```

**Effect:** Content consolidated to one location.

---

## B7: Doc Splitting

**When:** Agent executes split procedure

```
GIVEN:  Agent has claimed split task, skill loaded
WHEN:   Agent runs PROCEDURE_fill_gaps (split mode)
THEN:   Analyze doc for natural split points
AND:    For SYNC: archive old entries to SYNC_archive.md
AND:    For others: split into focused sub-docs
AND:    Update references to new locations
AND:    Verify doc now under 200 lines
```

**Effect:** Large doc split into manageable pieces.

---

## B8: Validation

**When:** Agent completes procedure

```
GIVEN:  All steps complete
WHEN:   Validation runs
THEN:   Check: gap marker removed?
AND:    Check: no broken references?
AND:    Check: doc under 200 lines (if split)?
AND:    If pass → task_run status: completed
AND:    If fail → retry or escalate
```

**Effect:** Quality assured before completion.

---

## BEHAVIOR SUMMARY

| Trigger | Behavior | Output |
|---------|----------|--------|
| @mind:gap found | Gap detection | task_run created |
| Content overlap >30% | Duplicate detection | task_run created |
| Doc >200 lines | Size detection | task_run created |
| Agent available | Pickup | Agent claims task |
| Procedure runs | Fix | Gap filled / Dedupe / Split |
| Work done | Validation | Quality checked |
| Check passes | Resolution | Problem gone |
