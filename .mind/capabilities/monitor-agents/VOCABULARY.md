# Vocabulary: monitor-agents

```
NODE: narrative:vocabulary
STATUS: active
```

---

## Problems

| Problem | Description | Severity |
|---------|-------------|----------|
| AGENT_STUCK | Agent without heartbeat for 5min | warning |
| AGENT_DEAD | Agent without heartbeat for 15min | critical |
| TASK_ORPHAN | Task claimed but agent dead | critical |
| TASK_STUCK | Task on same step for >1h | warning |
| HEALTH_CHECK_FAILED | check.py crashed during execution | critical |

---

## Problem Details

### AGENT_STUCK

```yaml
id: AGENT_STUCK
severity: warning
trigger: cron_60s
executor: automated
action: log_only
threshold: 5min without heartbeat
escalates_to: AGENT_DEAD at 15min
```

### AGENT_DEAD

```yaml
id: AGENT_DEAD
severity: critical
trigger: cron_60s
executor: automated
action:
  - set actor.status = dead
  - release claimed tasks
  - remove WORKS_ON links
threshold: 15min without heartbeat
```

### TASK_ORPHAN

```yaml
id: TASK_ORPHAN
severity: critical
trigger: cron_60s
executor: automated
action:
  - set task.status = pending
  - clear task.claimed_by
  - remove CLAIMED_BY link
condition: task.status == claimed AND agent.status == dead
```

### TASK_STUCK

```yaml
id: TASK_STUCK
severity: warning
trigger: cron_60s
executor: automated
action:
  - 1h: log warning
  - 2h: release task, notify agent
threshold: same step for >1h
```

### HEALTH_CHECK_FAILED

```yaml
id: HEALTH_CHECK_FAILED
severity: critical
trigger: on_error
executor: agent
action: investigate crash, fix check.py
context:
  - error message
  - traceback
  - capability id
```

---

## Terms

| Term | Definition |
|------|------------|
| heartbeat | Periodic signal from running agent (last_heartbeat timestamp) |
| claimed | Task status when agent has taken ownership |
| orphan | Task whose claiming agent is dead |
| stuck | Agent or task not progressing beyond threshold |
| step_started_at | Timestamp when current procedure step began |

---

## Thresholds

| Threshold | Value | Rationale |
|-----------|-------|-----------|
| STUCK_WARNING | 5min | Early warning, may be temporary |
| DEAD_THRESHOLD | 15min | Definitively dead, safe to cleanup |
| TASK_WARN | 1h | Long for a single step |
| TASK_RELEASE | 2h | Too long, release for retry |
| CRON_INTERVAL | 60s | Balance responsiveness vs overhead |
