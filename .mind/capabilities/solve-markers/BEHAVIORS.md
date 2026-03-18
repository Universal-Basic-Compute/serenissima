# Solve Markers — Behaviors

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
THIS:            BEHAVIORS.md (you are here)
ALGORITHM:       ./ALGORITHM.md
```

---

## PURPOSE

Observable behaviors of the solve-markers capability.

---

## B1: Escalation Detection

**When:** Periodic scan or file change

```
GIVEN:  Files in project (code, docs)
WHEN:   Health check runs (cron, file_watch)
THEN:   Scan for "@mind:escalation" pattern
AND:    For each found → check age
AND:    If stale (> 48h) → create task_run for ESCALATION
```

**Effect:** Blocking escalations surface automatically.

---

## B2: Proposition Detection

**When:** Periodic scan

```
GIVEN:  Files in project (code, docs)
WHEN:   Health check runs (cron:weekly)
THEN:   Scan for "@mind:proposition" pattern
AND:    For each found → check age
AND:    If stale (> 7d) → create task_run for SUGGESTION
```

**Effect:** Improvement ideas don't get lost.

---

## B3: Legacy Marker Detection

**When:** Doctor check or file change

```
GIVEN:  Code files in project
WHEN:   Health check runs (cron:daily, file_watch)
THEN:   Scan for TODO, FIXME, HACK, XXX patterns
AND:    Filter out test files, vendored code
AND:    Check age via git blame
AND:    If stale (> 30d) → create task_run for LEGACY_MARKER
```

**Effect:** Technical debt becomes visible.

---

## B4: Question Detection

**When:** Periodic scan

```
GIVEN:  Files in project (code, docs)
WHEN:   Health check runs (cron:weekly)
THEN:   Scan for "@mind:question" pattern
AND:    Check for unanswered questions
AND:    If stale (> 14d) → create task_run for UNRESOLVED_QUESTION
```

**Effect:** Uncertainty gets addressed.

---

## B5: Task Creation

**When:** Problem detected

```
GIVEN:  ESCALATION, SUGGESTION, LEGACY_MARKER, or UNRESOLVED_QUESTION found
WHEN:   Detection mechanism runs
THEN:   Create task_run node:
        - nature: based on severity
        - content: marker context
AND:    Link task_run -[serves]-> appropriate TASK
AND:    Link task_run -[concerns]-> file containing marker
AND:    Link task_run -[resolves]-> problem type
```

**Effect:** Work items exist for agent pickup.

---

## B6: Agent Pickup

**When:** Agent queries for marker work

```
GIVEN:  task_run exists with status: pending
WHEN:   Agent claims task
THEN:   Link agent -[claims]-> task_run
AND:    Load SKILL_solve_markers
AND:    task_run status → in_progress
```

**Effect:** Agent equipped to resolve markers.

---

## B7: Resolution Execution

**When:** Agent works on marker

```
GIVEN:  Agent has claimed task, skill loaded
WHEN:   Agent runs appropriate procedure
THEN:   For ESCALATION: gather context, propose decision, await approval
AND:    For SUGGESTION: evaluate, accept/reject/defer, document
AND:    For LEGACY_MARKER: fix or convert to tracked task
AND:    For QUESTION: research, document answer
```

**Effect:** Markers resolved with documented decisions.

---

## B8: Marker Removal

**When:** Resolution complete

```
GIVEN:  Resolution documented
WHEN:   Agent marks task complete
THEN:   Remove marker from file
AND:    Add decision record if applicable
AND:    Update SYNC
AND:    task_run status → completed
```

**Effect:** Clean code, preserved decisions.

---

## B9: Verification

**When:** Next health check

```
GIVEN:  task_run status: completed
WHEN:   Next health check runs
THEN:   Check if marker still exists
AND:    If gone → problem resolved
AND:    If present → investigate
```

**Effect:** Closed loop verification.

---

## BEHAVIOR SUMMARY

| Trigger | Behavior | Output |
|---------|----------|--------|
| @mind:escalation stale | Detection | task_run created |
| @mind:proposition stale | Detection | task_run created |
| TODO/FIXME stale | Detection | task_run created |
| @mind:question stale | Detection | task_run created |
| Agent available | Pickup | Agent claims task |
| Resolution runs | Execution | Decision made |
| Task done | Removal | Marker gone, decision recorded |
| Check passes | Verification | Problem gone |
