# Task: unstick_task

```
NODE: narrative:task
STATUS: active
PROBLEM: TASK_STUCK
EXECUTOR: automated
```

---

## Purpose

Handle a stuck task - warn at 1h, release at 2h.

---

## Trigger

- Problem: TASK_STUCK
- Signal: warning (1h) or critical (2h)

---

## Steps

```yaml
steps:
  - id: check_action
    action: branch
    params:
      condition: "{context.action} == 'release'"
      true_branch: release_task
      false_branch: log_warning

  - id: log_warning
    action: log
    params:
      level: warning
      message: "Task {target} stuck on step {context.current_step} for {context.elapsed_seconds}s"

  - id: release_task
    action: sequence
    steps:
      - action: set_property
        params:
          node: "{target}"
          property: status
          value: pending

      - action: set_property
        params:
          node: "{target}"
          property: claimed_by
          value: null

      - action: execute
        params:
          cypher: |
            MATCH (t:Narrative {id: $task_id})-[r:CLAIMED_BY]->(a:Actor)
            WITH t, a
            DELETE r
            RETURN a.id
          params:
            task_id: "{target}"
        outputs:
          agent_id: string

      - action: log
        params:
          level: info
          message: "Released stuck task {target}, notifying agent {agent_id}"

  - id: complete
    action: complete
    params:
      status: "{context.action == 'release' ? 'released' : 'warned'}"
```

---

## Context Required

| Field | Type | Description |
|-------|------|-------------|
| target | string | Stuck task ID |
| elapsed_seconds | int | Seconds on current step |
| current_step | string | Current procedure step |
| action | string | "warn" or "release" |

---

## Behavior

| Elapsed | Action |
|---------|--------|
| 1-2 hours | Log warning only |
| >2 hours | Release task, notify agent |
