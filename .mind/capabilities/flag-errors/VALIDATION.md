# Flag Errors — Validation

```
STATUS: CANONICAL
CAPABILITY: flag-errors
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

### V1: One Task Per Fingerprint

**Statement:** At most one open task exists for any given error fingerprint.

**Check:** `count(open_tasks WHERE fingerprint = X) <= 1`

**Verified by:** Unit test + health check

### V2: No Silent Errors

**Statement:** Every error matching watch config creates or updates a task.

**Check:** Process log with known errors, verify task count matches.

**Verified by:** Integration test

### V3: Fingerprint Stability

**Statement:** Same error produces same fingerprint across runs.

**Check:** Process identical error twice, fingerprints equal.

**Verified by:** Unit test

### V4: Counter Accuracy

**Statement:** Task occurrence_count equals actual occurrences.

**Check:** `task.occurrence_count == count(log_entries WITH fingerprint)`

**Verified by:** Health check (sampling)

### V5: Spike Detection Threshold

**Statement:** Spike triggers only when rate exceeds 10x baseline.

**Check:** Generate controlled spike, verify escalation timing.

**Verified by:** Unit test

### V6: Resolution Correctness

**Statement:** Task resolves only after 24h quiet period post-fix.

**Check:** Early resolution attempt fails; 24h quiet succeeds.

**Verified by:** Integration test

---

## ACCEPTANCE CRITERIA

### AC1: Watch Configuration

- Config file loads without error
- Invalid patterns rejected with clear message
- Missing paths logged as warning, not error
- Paths support glob patterns

### AC2: Error Detection

- Errors detected within 5 minutes of logging
- Multi-line errors (stack traces) captured completely
- Partial lines at file end handled correctly
- Binary/corrupt data doesn't crash parser

### AC3: Task Creation

- Task contains full error context
- Task linked to appropriate module (if detectable)
- Task severity set based on error level
- Duplicate detection prevents task spam

### AC4: Task Updates

- Counter increments atomically
- last_seen updates on each occurrence
- Spike escalation happens exactly once per spike
- No race conditions on concurrent updates

### AC5: Lifecycle

- New → investigating (agent claims)
- investigating → identified (root cause found)
- identified → fixing (work in progress)
- fixing → monitoring (fix deployed)
- monitoring → resolved (24h quiet)
