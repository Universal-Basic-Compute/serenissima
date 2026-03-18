# Task: investigate_error

```
NODE: narrative:task
STATUS: active
```

---

## Purpose

Investigate a new error that appeared in logs and determine root cause.

---

## Resolves

| Problem | Severity |
|---------|----------|
| NEW_ERROR | high |
| ERROR_SPIKE | critical |

---

## Inputs

```yaml
inputs:
  fingerprint: string        # Unique error fingerprint
  message: string            # Error message (may be truncated)
  level: ERROR|CRITICAL|FATAL
  log_path: string           # Where error was found
  first_occurrence: datetime # When first seen
  occurrence_count: int      # How many times seen
```

---

## Outputs

```yaml
outputs:
  root_cause: string         # What caused the error
  affected_module: string    # Which module is affected
  fix_approach: string       # How to fix
  severity_assessment: string # How bad is it
  related_code: path[]       # Files that need changes
```

---

## Executor

```yaml
executor:
  type: agent
  agents: [fixer, groundwork, scout]
```

---

## Uses

```yaml
uses:
  skill: SKILL_triage_error
```

---

## Executes

```yaml
executes:
  procedure: PROCEDURE_investigate_error
```

---

## Validation

Complete when:
1. Root cause identified
2. Fix approach documented
3. Either: fix implemented, or fix task created
4. Error stops recurring (24h quiet after fix)

---

## Instance (task_run)

Created by runtime when HEALTH.on_signal fires:

```yaml
node_type: narrative
type: task_run
nature: "urgently concerns"

content:
  fingerprint: "{fingerprint}"
  message: "{message}"
  log_path: "{log_path}"
  occurrence_count: 1
  state: new

links:
  - nature: serves
    to: TASK_investigate_error
  - nature: concerns
    to: "{detected_module}"
  - nature: resolves
    to: "{problem}"
```

---

## Lifecycle

```
new → investigating → identified → fixing → monitoring → resolved
```

- **new**: Error just detected, awaiting agent
- **investigating**: Agent claimed, looking at code/logs
- **identified**: Root cause known
- **fixing**: Fix in progress or fix task created
- **monitoring**: Fix deployed, watching for recurrence
- **resolved**: 24h quiet period passed
