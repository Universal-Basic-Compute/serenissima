# Task: unblock_module

```
NODE: narrative:task
STATUS: active
```

---

## Purpose

Resolve or escalate blocked module to restore work flow.

---

## Resolves

| Problem | Severity |
|---------|----------|
| MODULE_BLOCKED | high |

---

## Inputs

```yaml
inputs:
  module_id: string            # Blocked module identifier
  sync_path: path              # Path to module's SYNC file
  blocker_reason: string       # Why module is blocked
  days_blocked: number         # How long blocked
```

---

## Outputs

```yaml
outputs:
  resolved: boolean            # Was blocker resolved
  resolution_type: string      # "unblocked" | "escalated" | "delegated"
  new_status: string           # New module status
  escalation_id: string?       # If escalated, escalation ID
```

---

## Executor

```yaml
executor:
  type: agent
  agents: [architect, fixer]
  reason: Requires understanding context, making decisions, possibly escalating
```

---

## Uses

```yaml
uses:
  skill: null  # Uses general investigation and decision-making
  procedures:
    - resolve_blocker
    - raise_escalation
```

---

## Executes

```yaml
executes:
  procedure: |
    1. Read SYNC file for blocker context
    2. Investigate blocker cause:
       - Is it a dependency? Check dependent module status.
       - Is it a decision needed? Who can make it?
       - Is it external? What's the external status?
    3. Attempt resolution:
       - If resolvable: take action, update SYNC
       - If not resolvable: escalate with context
    4. Update SYNC status:
       - BLOCKED -> DESIGNING (if resolved)
       - BLOCKED -> BLOCKED with escalation link (if escalated)
```

---

## Validation

Complete when:
1. Module STATUS no longer BLOCKED, OR
2. Escalation raised with:
   - Clear owner
   - Context for decision
   - Proposed options
3. SYNC updated to reflect current state
4. Next health check acknowledges status change

---

## Instance (task_run)

Created by runtime when HEALTH.on_signal fires:

```yaml
node_type: narrative
type: task_run
nature: "{severity} concerns"  # importantly/urgently

links:
  - nature: serves
    to: TASK_unblock_module
  - nature: concerns
    to: "{module_id}"
  - nature: resolves
    to: MODULE_BLOCKED
```

---

## Escalation Criteria

Escalate (rather than resolve directly) when:
- Blocker requires decision from human stakeholder
- Blocker involves external dependency out of agent control
- Resolution requires permissions agent doesn't have
- Module blocked > 7 days with no clear resolution path
