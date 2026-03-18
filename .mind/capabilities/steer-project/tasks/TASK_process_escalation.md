# Task: process_escalation

```
NODE: narrative:task
STATUS: active
```

---

## Purpose

Process an escalation marker and determine resolution.

---

## Resolves

| Problem | Severity |
|---------|----------|
| UNPROCESSED_ESCALATION | high |

---

## Inputs

```yaml
inputs:
  location: path:line     # Where the marker is
  content: string         # What it says
  age_days: int           # How long it's been open
```

---

## Outputs

```yaml
outputs:
  resolution: resolved|deferred|needs_human
  action_taken: string
  task_created: task_id | null
```

---

## Executor

```yaml
executor:
  type: agent
  agents: [architect, fixer]
```

---

## Validation

Complete when:
1. Escalation understood
2. Resolution determined
3. Either:
   - Resolved: marker removed or marked resolved
   - Deferred: task created with deadline
   - Needs human: escalated with clear question

---

## Process

1. Read the escalation marker and surrounding context
2. Understand what's blocked
3. Determine if agent can resolve:
   - Yes → take action, mark resolved
   - Needs more work → create task
   - Needs human decision → escalate clearly
4. Document resolution
