# Investigate Runtime — Behaviors

```
STATUS: CANONICAL
CAPABILITY: investigate-runtime
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

Observable behaviors of the investigate-runtime capability.

---

## B1: Log Error Detection

**When:** Log stream or periodic scan triggers

```
GIVEN:  Log file contains ERROR or CRITICAL entry
WHEN:   Health check runs (log_stream, cron:hourly)
THEN:   Parse log entry for error details
AND:    If not yet investigated -> create task_run for LOG_ERROR
```

**Effect:** Runtime errors surface automatically for investigation.

---

## B2: Hook Discovery

**When:** Init scan or file watch triggers

```
GIVEN:  Hook file exists (.git/hooks/*, scripts/hooks/*)
WHEN:   Health check runs (init_scan, file_watch)
THEN:   Check for corresponding BEHAVIORS documentation
AND:    If missing -> create task_run for HOOK_UNDOC
```

**Effect:** Undocumented hooks flagged for documentation.

---

## B3: Task Creation (Error)

**When:** LOG_ERROR detected

```
GIVEN:  Error entry found in logs
WHEN:   Detection mechanism runs
THEN:   Create task_run node:
        - nature: "importantly concerns"
        - content: Error message + stack trace
AND:    Link task_run -[serves]-> TASK_investigate_error
AND:    Link task_run -[concerns]-> error location
AND:    Link task_run -[resolves]-> LOG_ERROR
```

**Effect:** Investigation work item created.

---

## B4: Task Creation (Hook)

**When:** HOOK_UNDOC detected

```
GIVEN:  Hook file exists without documentation
WHEN:   Detection mechanism runs
THEN:   Create task_run node:
        - nature: "concerns"
        - content: Hook path + trigger type
AND:    Link task_run -[serves]-> TASK_document_hook
AND:    Link task_run -[concerns]-> hook file
AND:    Link task_run -[resolves]-> HOOK_UNDOC
```

**Effect:** Documentation work item created.

---

## B5: Agent Investigation

**When:** Agent claims error task

```
GIVEN:  task_run exists for LOG_ERROR, status: pending
WHEN:   Agent claims task
THEN:   Link agent -[claims]-> task_run
AND:    Load SKILL_investigate
AND:    task_run status -> in_progress
```

**Effect:** Agent equipped to investigate.

---

## B6: Investigation Execution

**When:** Agent runs investigation procedure

```
GIVEN:  Agent has claimed task, skill loaded
WHEN:   Agent runs PROCEDURE_investigate
THEN:   Read error context (logs, code, state)
AND:    Form hypothesis about root cause
AND:    Verify hypothesis with evidence
AND:    Produce diagnosis or escalate
```

**Effect:** Diagnosis produced with evidence.

---

## B7: Hook Documentation

**When:** Agent claims hook task

```
GIVEN:  task_run exists for HOOK_UNDOC, status: pending
WHEN:   Agent claims task
THEN:   Link agent -[claims]-> task_run
AND:    Read hook code
AND:    Document in BEHAVIORS.md
AND:    task_run status -> completed
```

**Effect:** Hook behavior documented.

---

## B8: Resolution Confirmation

**When:** Task completed

```
GIVEN:  task_run status: completed
WHEN:   Next health check runs
THEN:   Error: check if diagnosis exists and follow-up created
AND:    Hook: check if BEHAVIORS doc exists
AND:    If resolved -> problem resolved
AND:    If still present -> investigate escalation
```

**Effect:** Closed loop verification.

---

## BEHAVIOR SUMMARY

| Trigger | Behavior | Output |
|---------|----------|--------|
| Error in logs | Detection | task_run created |
| Hook without docs | Detection | task_run created |
| Agent available | Pickup | Agent claims task |
| Procedure runs | Investigation | Diagnosis produced |
| Work done | Validation | Problem resolved |
