# Task: steering_session

```
NODE: narrative:task
STATUS: active
```

---

## Purpose

Run a strategic review of the project and determine next steps.

---

## Resolves

| Problem | Severity |
|---------|----------|
| STEERING_DUE | high |
| PROJECT_STALLED | medium |

---

## Inputs

```yaml
inputs:
  scope: project|module    # What to review
  focus: string | null     # Optional focus area
```

---

## Outputs

```yaml
outputs:
  findings: finding[]      # What was observed
  actions: action[]        # What was done
  tasks_created: task_id[] # New tasks created
  report: string           # Summary for humans
```

---

## Executor

```yaml
executor:
  type: agent
  agents: [witness, architect, herald]
```

---

## Validation

Complete when:
1. All SYNC files reviewed
2. All escalations checked
3. Findings documented
4. Actions taken for high-severity findings
5. Report written to SYNC_Project_State.md

---

## Process

1. **Gather State**
   - Read all SYNC files
   - Find all escalation markers
   - Get active tasks
   - Get recent commits

2. **Assess**
   - What progressed since last session?
   - What's blocked?
   - What's stale?
   - What's missing?

3. **Act**
   - Update stale SYNC files (or create tasks)
   - Process escalations (or create tasks)
   - Create strategic tasks for gaps
   - Prioritize existing backlog

4. **Report**
   - Summarize findings
   - List actions taken
   - Note open questions
   - Update SYNC_Project_State.md
