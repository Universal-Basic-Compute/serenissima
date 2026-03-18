# Steer Project — Validation

```
STATUS: CANONICAL
CAPABILITY: steer-project
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

## INVARIANTS

### V1: Weekly Session Occurs

**Statement:** Steering session runs at least weekly.

**Check:** `max(session.timestamp) > now() - 7 days`

**Verified by:** Health check

### V2: Findings Produce Actions

**Statement:** Non-trivial findings result in actions.

**Check:** `findings.severity >= high → action exists`

**Verified by:** Session review

### V3: SYNC Freshness

**Statement:** No SYNC file older than threshold.

**Check:** `max(sync.age) < threshold`

**Verified by:** Health check

### V4: Escalation Processing

**Statement:** Escalations processed within time limit.

**Check:** `escalation.age < 7 days OR escalation.status != open`

**Verified by:** Health check

### V5: Report Generated

**Statement:** Every session produces a report.

**Check:** `session.report_written == true`

**Verified by:** Session completion

---

## ACCEPTANCE CRITERIA

### AC1: State Gathering

- Finds all SYNC files
- Finds all escalation markers
- Queries active tasks
- Retrieves recent commits

### AC2: Assessment Quality

- Correct staleness calculation
- Correct escalation age
- Identifies multi-task blockers
- Catches drift from vision

### AC3: Action Appropriateness

- Critical findings → immediate action
- High findings → scheduled action
- Medium findings → noted, queued
- Low findings → logged

### AC4: Reporting

- Report written to SYNC_Project_State.md
- Findings listed with severity
- Actions listed with status
- Readable by humans
