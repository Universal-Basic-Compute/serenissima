# Investigate Runtime — Vocabulary

```
STATUS: CANONICAL
CAPABILITY: investigate-runtime
```

---

## CHAIN

```
OBJECTIVES:      ./OBJECTIVES.md
PATTERNS:        ./PATTERNS.md
THIS:            VOCABULARY.md (you are here)
BEHAVIORS:       ./BEHAVIORS.md
ALGORITHM:       ./ALGORITHM.md
```

---

## PURPOSE

Terms and problems owned by this capability.

---

## TERMS

### log error

An ERROR-level entry in log files indicating a runtime failure. Requires investigation to understand cause and determine fix.

### hook

A script triggered by external events (git hooks, system hooks, etc.). Must be documented so behavior is predictable.

### root cause

The underlying reason for an error, not the immediate symptom. Investigation seeks root cause, not surface effects.

### diagnosis

The output of investigation: what happened, why, and what should be done. Must include evidence.

### evidence

Concrete artifacts supporting a diagnosis: log excerpts, stack traces, state dumps, reproduction steps.

---

## PROBLEMS

### PROBLEM: LOG_ERROR

```yaml
id: LOG_ERROR
severity: high
category: runtime

definition: |
  An error was detected in recent log files. Something failed during
  runtime that should be investigated.

detection:
  - ERROR or CRITICAL level log entry exists
  - Entry is recent (within configured window)
  - Not yet marked investigated

resolves_with: TASK_investigate_error

examples:
  - "Exception thrown during graph traversal"
  - "External API returned 500 error"
  - "Validation failed at runtime"
```

### PROBLEM: HOOK_UNDOC

```yaml
id: HOOK_UNDOC
severity: medium
category: runtime

definition: |
  A hook (pre-commit, post-commit, etc.) exists but is not documented
  in BEHAVIORS.md or similar. Its trigger and behavior are unclear.

detection:
  - Hook file exists (.git/hooks/*, scripts/hooks/*, etc.)
  - No corresponding documentation in BEHAVIORS
  - Not in ignored list

resolves_with: TASK_document_hook

examples:
  - "pre-commit hook runs but no doc explains what it checks"
  - "post-deploy hook exists from previous team"
  - "Hook copied from another project without documentation"
```

---

## USAGE

```yaml
# In HEALTH.md
on_problem:
  problem_id: LOG_ERROR
  creates:
    node:
      node_type: narrative
      type: task_run
      nature: "importantly concerns"
    links:
      - nature: "serves"
        to: TASK_investigate_error
      - nature: "resolves"
        to: LOG_ERROR
```
