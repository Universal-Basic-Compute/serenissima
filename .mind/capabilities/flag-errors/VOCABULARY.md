# Flag Errors — Vocabulary

```
STATUS: CANONICAL
CAPABILITY: flag-errors
```

---

## CHAIN

```
OBJECTIVES:      ./OBJECTIVES.md
PATTERNS:        ./PATTERNS.md
THIS:            VOCABULARY.md (you are here)
BEHAVIORS:       ./BEHAVIORS.md
```

---

## TERMS

### error_fingerprint

Normalized hash of an error. Strips variable data (timestamps, IDs, paths with user data). Two errors with same fingerprint are "the same error."

```yaml
term: error_fingerprint
type: hash
computed_from: [error_type, normalized_message, stack_signature]
```

### error_record

Single parsed error from a log file.

```yaml
term: error_record
fields:
  timestamp: datetime
  level: ERROR | CRITICAL | FATAL
  message: string
  stack_trace: string | null
  source_file: string
  line_number: int | null
  fingerprint: error_fingerprint
```

### watch_config

Configuration for watching a log file.

```yaml
term: watch_config
fields:
  path: glob pattern
  format: regex | json | structured
  error_pattern: regex for extracting errors
  fingerprint_fields: which parts to hash
```

### occurrence

Single instance of an error happening.

```yaml
term: occurrence
fields:
  fingerprint: error_fingerprint
  timestamp: datetime
  count: int  # if batched
```

---

## PROBLEMS

### NEW_ERROR

A new error fingerprint detected that has no existing task.

```yaml
problem: NEW_ERROR
severity: high
inputs:
  fingerprint: error_fingerprint
  first_record: error_record
  log_path: string
resolves_with: TASK_investigate_error
```

### ERROR_SPIKE

Existing error suddenly increased in frequency (> 10x normal rate).

```yaml
problem: ERROR_SPIKE
severity: critical
inputs:
  fingerprint: error_fingerprint
  normal_rate: float  # per hour
  current_rate: float
  task_id: string  # existing task
resolves_with: escalate existing task
```

### UNMONITORED_LOGS

Log files exist that aren't being watched.

```yaml
problem: UNMONITORED_LOGS
severity: medium
inputs:
  paths: string[]
resolves_with: TASK_configure_watch
```

---

## STATES

### error_task_state

Lifecycle of an error task.

```yaml
states:
  - new: Error just detected, task created
  - investigating: Agent claimed, looking into cause
  - identified: Root cause known, fix planned
  - fixing: Fix in progress
  - monitoring: Fix deployed, watching for recurrence
  - resolved: No occurrences for threshold period
```
