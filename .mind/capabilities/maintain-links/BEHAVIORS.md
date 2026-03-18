# Maintain Links — Behaviors

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
THIS:            BEHAVIORS.md (you are here)
ALGORITHM:       ./ALGORITHM.md
```

---

## PURPOSE

Observable behaviors of the maintain-links capability.

---

## B1: Broken IMPL Link Detection

**When:** Doc scan or file watch triggers

```
GIVEN:  Doc file exists with IMPL: markers
WHEN:   Health check runs (init_scan, cron, file_watch)
THEN:   Parse all IMPL: markers in doc
AND:    For each marker, check if target path exists
AND:    If target missing -> create task_run for BROKEN_IMPL_LINK
```

**Effect:** Broken implementation links surface automatically.

---

## B2: Orphan Doc Detection

**When:** Comprehensive link scan runs

```
GIVEN:  Doc file exists in docs/
WHEN:   Health check runs (cron:daily, post_refactor)
THEN:   Check: Does doc have valid IMPL: links to existing code?
AND:    Check: Does any code file have DOCS: pointing to this doc?
AND:    If both false -> create task_run for ORPHAN_DOCS
```

**Effect:** Documentation without code references flagged for review.

---

## B3: Automatic Path Resolution

**When:** Broken link detected

```
GIVEN:  IMPL: marker points to non-existent path
WHEN:   Detection finds broken link
THEN:   Extract filename from path
AND:    Search codebase for file with same name
AND:    If found -> update IMPL: marker automatically
AND:    If not found -> create task_run for manual fix
```

**Effect:** Simple renames/moves fixed automatically.

---

## B4: Task Creation

**When:** Problem detected and not auto-resolved

```
GIVEN:  BROKEN_IMPL_LINK or ORPHAN_DOCS found
WHEN:   Auto-resolution fails
THEN:   Create task_run node:
        - nature: "importantly concerns" (if BROKEN_IMPL_LINK)
        - nature: "concerns" (if ORPHAN_DOCS)
AND:    Link task_run -[serves]-> appropriate TASK
AND:    Link task_run -[concerns]-> target doc
AND:    Link task_run -[resolves]-> problem
```

**Effect:** Work items exist for agent pickup.

---

## B5: Agent Pickup

**When:** Agent queries for link work

```
GIVEN:  task_run exists with status: pending
WHEN:   Agent claims task
THEN:   Link agent -[claims]-> task_run
AND:    Load SKILL_fix_links
AND:    task_run status -> in_progress
```

**Effect:** Agent equipped to fix links.

---

## B6: Link Repair (BROKEN_IMPL_LINK)

**When:** Agent executes repair for broken link

```
GIVEN:  Agent has claimed task for BROKEN_IMPL_LINK
WHEN:   Agent runs PROCEDURE_fix_links
THEN:   If code moved: update IMPL: to new path
OR:     If code renamed: update IMPL: to new name
OR:     If code deleted: remove IMPL: marker, flag doc for review
```

**Effect:** Link integrity restored.

---

## B7: Orphan Resolution (ORPHAN_DOCS)

**When:** Agent handles orphan doc

```
GIVEN:  Agent has claimed task for ORPHAN_DOCS
WHEN:   Agent analyzes doc
THEN:   If code exists elsewhere: create IMPL: link
OR:     If code should exist: create task_run for code creation
OR:     If doc obsolete: archive or delete doc
```

**Effect:** Orphan docs either linked, flagged, or removed.

---

## B8: Validation

**When:** Agent completes repair

```
GIVEN:  Agent marks repair complete
WHEN:   Validation runs
THEN:   Re-scan affected doc(s)
AND:    Check: All IMPL: links resolve?
AND:    Check: No new broken links created?
AND:    If pass -> task_run status: completed
AND:    If fail -> retry or escalate
```

**Effect:** Quality assured before completion.

---

## BEHAVIOR SUMMARY

| Trigger | Behavior | Output |
|---------|----------|--------|
| Doc with broken IMPL: | Detection | task_run created |
| Doc with no code refs | Detection | task_run created |
| Simple path mismatch | Auto-resolve | Link updated |
| Agent available | Pickup | Agent claims task |
| Repair complete | Validation | Quality checked |
| Check passes | Resolution | Problem gone |
