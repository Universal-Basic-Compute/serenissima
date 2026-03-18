# Implement Code — Behaviors

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
THIS:            BEHAVIORS.md (you are here)
ALGORITHM:       ./ALGORITHM.md
```

---

## PURPOSE

Observable behaviors of the implement-code capability.

---

## B1: Stub Detection

**When:** Code scan or file watch triggers

```
GIVEN:  Code file exists (.py, .ts, .js, etc.)
WHEN:   Health check runs (init_scan, cron, file_watch)
THEN:   Parse functions for stub patterns
AND:    If stub found -> create task_run for STUB_IMPL
```

**Effect:** Stub implementations surface automatically.

---

## B2: TODO Detection

**When:** Code file scanned

```
GIVEN:  Code file exists
WHEN:   Health check runs
THEN:   Search for TODO/FIXME/XXX/HACK markers
AND:    For each marker -> check if task exists
AND:    If no task -> create task_run for INCOMPLETE_IMPL
```

**Effect:** Incomplete code flagged for completion.

---

## B3: Missing Algorithm Detection

**When:** Doc chain incomplete

```
GIVEN:  docs/{module}/IMPLEMENTATION.md exists
WHEN:   Health check runs
THEN:   Check for docs/{module}/ALGORITHM.md
AND:    If missing or stub -> create task_run for UNDOC_IMPL
```

**Effect:** Implementation-without-algorithm detected.

---

## B4: Stale Doc Detection

**When:** Code changed recently

```
GIVEN:  Code file modified (git mtime)
WHEN:   Health check runs (post-commit hook, daily cron)
THEN:   Find linked docs (via DOCS: marker or IMPLEMENTATION.md)
AND:    Compare code mtime to doc LAST_UPDATED
AND:    If code newer by > 7 days -> create task_run for STALE_IMPL
```

**Effect:** Docs falling behind code detected.

---

## B5: Task Creation

**When:** Problem detected

```
GIVEN:  STUB_IMPL, INCOMPLETE_IMPL, UNDOC_IMPL, or STALE_IMPL found
WHEN:   Detection mechanism runs
THEN:   Create task_run node:
        - nature: "urgently concerns" (if STUB_IMPL)
        - nature: "importantly concerns" (if INCOMPLETE_IMPL, UNDOC_IMPL)
        - nature: "concerns" (if STALE_IMPL)
AND:    Link task_run -[serves]-> appropriate TASK
AND:    Link task_run -[concerns]-> target file/module
AND:    Link task_run -[resolves]-> problem
```

**Effect:** Work items exist for agent pickup.

---

## B6: Agent Pickup

**When:** Agent queries for implementation work

```
GIVEN:  task_run exists with status: pending
WHEN:   Agent claims task
THEN:   Link agent -[claims]-> task_run
AND:    Load SKILL_implement
AND:    task_run status -> in_progress
```

**Effect:** Agent equipped to implement.

---

## B7: Stub Implementation

**When:** Agent works on STUB_IMPL task

```
GIVEN:  Agent has claimed TASK_implement_stub
WHEN:   Agent runs PROCEDURE_implement
THEN:   Read ALGORITHM.md for spec
AND:    Read function signature and docstring
AND:    Implement function body
AND:    Run tests to verify
AND:    Remove stub markers
```

**Effect:** Stub becomes real implementation.

---

## B8: Incomplete Completion

**When:** Agent works on INCOMPLETE_IMPL task

```
GIVEN:  Agent has claimed TASK_complete_impl
WHEN:   Agent runs PROCEDURE_implement
THEN:   Read TODO/FIXME context
AND:    Understand what's missing
AND:    Implement missing functionality
AND:    Remove TODO/FIXME markers
AND:    Run tests
```

**Effect:** Partial code becomes complete.

---

## B9: Algorithm Documentation

**When:** Agent works on UNDOC_IMPL task

```
GIVEN:  Agent has claimed TASK_document_impl
WHEN:   Agent runs PROCEDURE_implement
THEN:   Read implementation code
AND:    Extract key algorithms and flows
AND:    Create ALGORITHM.md from template
AND:    Document with pseudocode
AND:    Link to IMPLEMENTATION.md
```

**Effect:** Code now has algorithm documentation.

---

## B10: Doc Sync

**When:** Agent works on STALE_IMPL task

```
GIVEN:  Agent has claimed TASK_update_impl_docs
WHEN:   Agent runs PROCEDURE_implement
THEN:   Get git diff for code changes
AND:    Identify what changed
AND:    Update ALGORITHM.md to reflect changes
AND:    Update LAST_VERIFIED in IMPLEMENTATION.md
AND:    Update SYNC with change note
```

**Effect:** Docs synchronized with code.

---

## B11: Validation

**When:** Agent completes procedure

```
GIVEN:  All steps complete
WHEN:   Validation runs
THEN:   Check: stub patterns removed?
AND:    Check: TODO/FIXME resolved?
AND:    Check: ALGORITHM.md present and complete?
AND:    Check: dates updated?
AND:    If pass -> task_run status: completed
AND:    If fail -> retry or escalate
```

**Effect:** Quality assured before completion.

---

## BEHAVIOR SUMMARY

| Trigger | Behavior | Output |
|---------|----------|--------|
| Stub found | Detection | task_run created |
| TODO found | Detection | task_run created |
| Missing ALGORITHM | Detection | task_run created |
| Stale docs | Detection | task_run created |
| Agent claims | Pickup | Skill loaded |
| Procedure runs | Implementation | Code/docs updated |
| Work done | Validation | Quality checked |
