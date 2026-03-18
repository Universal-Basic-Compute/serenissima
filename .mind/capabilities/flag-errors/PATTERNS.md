# Flag Errors — Patterns

```
STATUS: CANONICAL
CAPABILITY: flag-errors
```

---

## CHAIN

```
OBJECTIVES:      ./OBJECTIVES.md
THIS:            PATTERNS.md (you are here)
VOCABULARY:      ./VOCABULARY.md
BEHAVIORS:       ./BEHAVIORS.md
ALGORITHM:       ./ALGORITHM.md
```

---

## THE PROBLEM

Errors happen. They get logged. Nobody notices until users complain. By then the log is full of the same error repeated thousands of times. The signal is there but invisible.

---

## THE PATTERN

**Fingerprint-based error deduplication with task creation.**

1. Watch log files for changes
2. Parse new lines, extract error records
3. Compute fingerprint (error type + message normalized)
4. Check if fingerprint already has open task
5. If new: create task with full context
6. If existing: increment counter, update last_seen

---

## PRINCIPLES

### Principle 1: Fingerprint, Not Exact Match

Normalize error messages before comparison. Strip timestamps, IDs, variable data. Same error with different user ID = same fingerprint.

### Principle 2: Task Per Unique Error

One task per fingerprint. Multiple occurrences update the same task. Prevents task flood.

### Principle 3: Context Over Volume

First occurrence: capture full stack trace, context, surrounding logs. Subsequent: just increment counter. Don't store 10,000 identical traces.

### Principle 4: Configurable Watch

Different projects have different log formats and locations. Configuration per project, not hardcoded patterns.

---

## DESIGN DECISIONS

### Why fingerprinting?

Exact match fails. Errors contain timestamps, request IDs, user data. Two "identical" errors never match exactly. Fingerprinting extracts the stable parts.

### Why tasks not alerts?

Alerts demand immediate attention. Most errors don't need immediate response. Tasks queue work for investigation. Severity can inform priority.

### Why file watching?

Simple. Works everywhere. Log files exist in every system. Don't require log aggregation infrastructure.

### Why deduplicate?

A loop that errors 10,000 times should create one task saying "10,000 occurrences" not 10,000 tasks.

---

## SCOPE

### In Scope

- Watching configured log files
- Parsing error patterns (configurable)
- Computing stable fingerprints
- Creating/updating error tasks
- Tracking occurrence counts

### Out of Scope

- Fixing errors (investigate-runtime, implement-code)
- Real-time alerting (external systems)
- Log rotation management
- Log shipping/aggregation
