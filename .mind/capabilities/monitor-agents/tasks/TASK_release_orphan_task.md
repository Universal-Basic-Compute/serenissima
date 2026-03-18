# Task: release_orphan_task

```
NODE: narrative:task
STATUS: active
PROBLEM: TASK_ORPHAN
EXECUTOR: automated
```

---

## Purpose

Release a task that was claimed by a now-dead agent.

---

## Trigger

- Problem: TASK_ORPHAN
- Signal: critical

---

## Steps

```yaml
steps:
  - id: set_pending
    action: set_property
    params:
      node: "{target}"
      property: status
      value: pending

  - id: clear_claimed_by
    action: set_property
    params:
      node: "{target}"
      property: claimed_by
      value: null

  - id: remove_claim_link
    action: execute
    params:
      cypher: |
        MATCH (t:Narrative {id: $task_id})-[r:CLAIMED_BY]->()
        DELETE r
      params:
        task_id: "{target}"

  - id: complete
    action: complete
    params:
      status: released
      reason: agent_dead
```

---

## Context Required

| Field | Type | Description |
|-------|------|-------------|
| target | string | Orphaned task ID |
| dead_agent | string | ID of the dead agent |

---

## Invariants After

- Task status = pending
- Task claimed_by = null
- No CLAIMED_BY link exists
