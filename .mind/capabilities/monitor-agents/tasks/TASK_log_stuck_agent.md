# Task: log_stuck_agent

```
NODE: narrative:task
STATUS: active
PROBLEM: AGENT_STUCK
EXECUTOR: automated
```

---

## Purpose

Log warning when an agent appears stuck (no heartbeat for 5min).
No action taken - agent may recover.

---

## Trigger

- Problem: AGENT_STUCK
- Signal: warning

---

## Steps

```yaml
steps:
  - id: log
    action: log
    params:
      level: warning
      message: "Agent {target} stuck - no heartbeat for {elapsed}s"

  - id: complete
    action: complete
    params:
      status: logged
```

---

## Context Required

| Field | Type | Description |
|-------|------|-------------|
| target | string | Agent ID |
| elapsed_seconds | int | Seconds since last heartbeat |

---

## Notes

- This is a warning only - no cleanup
- If agent recovers, no further action needed
- If agent dies (15min), TASK_cleanup_dead_agent handles it
