# Create Doc Chain — Behaviors

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
THIS:            BEHAVIORS.md (you are here)
ALGORITHM:       ./ALGORITHM.md
```

---

## PURPOSE

Observable behaviors of the create-doc-chain capability.

---

## B1: Missing Doc Detection

**When:** Init scan or file watch triggers

```
GIVEN:  Code module exists (src/auth/, lib/utils.py, etc.)
WHEN:   Health check runs (init_scan, cron, file_watch)
THEN:   Check for corresponding docs/{module}/
AND:    If missing → create task_run for UNDOCUMENTED
```

**Effect:** Missing documentation surfaces automatically.

---

## B2: Incomplete Chain Detection

**When:** Doc folder exists but incomplete

```
GIVEN:  docs/{module}/ exists
WHEN:   Health check runs
THEN:   Compare existing files to expected chain
AND:    For each missing → create task_run for INCOMPLETE_CHAIN
```

**Effect:** Partial documentation flagged for completion.

---

## B3: Task Creation

**When:** Problem detected

```
GIVEN:  UNDOCUMENTED or INCOMPLETE_CHAIN found
WHEN:   Detection mechanism runs
THEN:   Create task_run node:
        - nature: "urgently concerns" (if UNDOCUMENTED)
        - nature: "importantly concerns" (if INCOMPLETE_CHAIN)
AND:    Link task_run -[serves]-> TASK_create_doc
AND:    Link task_run -[concerns]-> target module
AND:    Link task_run -[resolves]-> problem
```

**Effect:** Work items exist for agent pickup.

---

## B4: Agent Pickup

**When:** Agent queries for doc work

```
GIVEN:  task_run exists with status: pending
WHEN:   Agent claims task
THEN:   Link agent -[claims]-> task_run
AND:    Load SKILL_write_doc
AND:    task_run status → in_progress
```

**Effect:** Agent equipped to create docs.

---

## B5: Doc Creation

**When:** Agent executes procedure

```
GIVEN:  Agent has claimed task, skill loaded
WHEN:   Agent runs PROCEDURE_create_doc
THEN:   Template copied to target location
AND:    Agent fills in content
AND:    Each step produces one doc file
```

**Effect:** Documentation created from templates.

---

## B6: Validation

**When:** Agent completes procedure

```
GIVEN:  All steps complete
WHEN:   Validation runs
THEN:   Check: all files present?
AND:    Check: no placeholders remain?
AND:    Check: structure matches template?
AND:    If pass → task_run status: completed
AND:    If fail → retry or escalate
```

**Effect:** Quality assured before completion.

---

## B7: Resolution Confirmation

**When:** Task completed

```
GIVEN:  task_run status: completed
WHEN:   Next health check runs
THEN:   Same module checked
AND:    If docs now exist → problem resolved
AND:    If still missing → investigate
```

**Effect:** Closed loop verification.

---

## BEHAVIOR SUMMARY

| Trigger | Behavior | Output |
|---------|----------|--------|
| Code exists, no docs | Detection | task_run created |
| Docs incomplete | Detection | task_run created |
| Agent available | Pickup | Agent claims task |
| Procedure runs | Creation | Docs written |
| Work done | Validation | Quality checked |
| Check passes | Resolution | Problem gone |
