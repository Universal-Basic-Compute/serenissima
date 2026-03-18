# Task: investigate_error

```
NODE: narrative:task
STATUS: active
```

---

## Purpose

Investigate a runtime error to find root cause and recommend action.

---

## Resolves

| Problem | Severity |
|---------|----------|
| LOG_ERROR | high |

---

## Inputs

```yaml
inputs:
  log_path: string         # Path to log file containing error
  error_message: string    # Error text
  stack_trace: string      # Stack trace if available
  timestamp: datetime      # When error occurred
  problem: problem_id      # LOG_ERROR
```

---

## Outputs

```yaml
outputs:
  diagnosis: object        # Root cause analysis
    root_cause: string     # Why error occurred
    evidence: artifact[]   # Supporting artifacts
    confidence: string     # low/medium/high
  recommended_action: string  # What to do
  follow_up_task: task_id  # If fix needed
```

---

## Executor

```yaml
executor:
  type: agent
  agents: [witness, fixer]
```

---

## Uses

```yaml
uses:
  skill: SKILL_investigate
```

---

## Executes

```yaml
executes:
  procedure: PROCEDURE_investigate
```

---

## Validation

Complete when:
1. Diagnosis exists with evidence
2. Root cause identified (not just symptom)
3. Recommended action provided OR escalation raised
4. Health check passes (no unresolved error)

---

## Instance (task_run)

Created by runtime when HEALTH.on_signal fires:

```yaml
node_type: narrative
type: task_run
nature: "{severity} concerns"  # importantly/urgently

links:
  - nature: serves
    to: TASK_investigate_error
  - nature: concerns
    to: "{log_path}:{line}"
  - nature: resolves
    to: LOG_ERROR
```
