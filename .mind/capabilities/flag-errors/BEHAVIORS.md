# Flag Errors — Behaviors

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
THIS:            BEHAVIORS.md (you are here)
ALGORITHM:       ./ALGORITHM.md
```

---

## OBSERVABLE BEHAVIORS

### B1: New Error Creates Task

**When:** Log contains error with new fingerprint (no existing open task)
**Then:** Task created with:
- Full error message
- Stack trace (if present)
- First occurrence timestamp
- Log file path
- Occurrence count = 1

**Observable:** `task_run` node created, linked to `TASK_investigate_error`

### B2: Repeated Error Updates Task

**When:** Log contains error with existing fingerprint (open task exists)
**Then:** Existing task updated:
- Occurrence count incremented
- last_seen timestamp updated
- No new task created

**Observable:** Task node's `occurrence_count` increases

### B3: Error Spike Escalates

**When:** Error rate exceeds 10x normal rate for that fingerprint
**Then:** Task priority escalated to critical
**Observable:** Task severity changes, escalation marker added

### B4: Resolved After Quiet Period

**When:** No occurrences for 24 hours after fix deployed
**Then:** Task marked resolved
**Observable:** Task state → resolved

### B5: Log Watch Coverage Check

**When:** Health check runs (daily or on config change)
**Then:** Compares watched paths to existing log files
**Observable:** UNMONITORED_LOGS problem if gaps found

---

## INTERACTION PATTERNS

### Pattern: Watch Initialization

```
1. Load watch configs from .mind/config/error_watch.yaml
2. For each config:
   - Validate path exists (or will exist)
   - Store file position (for incremental reading)
3. Register file.on_modify trigger for each path
```

### Pattern: Error Processing Pipeline

```
1. File modified → trigger fires
2. Read new lines since last position
3. For each line:
   - Match against error_pattern
   - If match: parse to error_record
   - Compute fingerprint
   - Check existing tasks
   - Create or update accordingly
4. Update file position
```

### Pattern: Fingerprint Computation

```
1. Extract error type (class name or error code)
2. Normalize message:
   - Strip timestamps
   - Replace UUIDs with {UUID}
   - Replace numbers with {N}
   - Replace paths with user data with {PATH}
3. Extract stack signature (top 3 frames, normalized)
4. Hash: sha256(type + message + signature)
```
