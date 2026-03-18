# Validation: monitor-agents

```
NODE: narrative:validation
STATUS: active
```

---

## Invariants

### I1: Dead Agent Cleanup

```
IF actor.status == "dead"
THEN NOT EXISTS link(type="WORKS_ON", from=actor)
AND  NOT EXISTS task(claimed_by=actor, status="claimed")
```

### I2: Orphan Prevention

```
IF task.status == "claimed"
AND task has CLAIMED_BY link to actor
THEN actor.status != "dead"
```

### I3: Heartbeat Monotonic

```
actor.last_heartbeat <= now()
```

### I4: Step Timestamp Valid

```
IF task.status == "running"
THEN task.step_started_at IS NOT NULL
AND  task.step_started_at <= now()
```

### I5: Threshold Ordering

```
STUCK_THRESHOLD < DEAD_THRESHOLD
TASK_WARN_THRESHOLD < TASK_RELEASE_THRESHOLD
```

---

## Constraints

| Constraint | Rule |
|------------|------|
| Cron interval | Must be < STUCK_THRESHOLD |
| Dead detection | Must run before orphan check |
| Release | Must clear all claim links |
| Heartbeat | Must be updated by running agents |

---

## Test Cases

### T1: Agent Stuck Detection

```
GIVEN: actor with last_heartbeat = now - 6min
WHEN:  monitor_cycle runs
THEN:  AGENT_STUCK warning emitted
AND:   actor.status unchanged
```

### T2: Agent Dead Detection

```
GIVEN: actor with last_heartbeat = now - 16min
WHEN:  monitor_cycle runs
THEN:  AGENT_DEAD emitted
AND:   actor.status = dead
AND:   claimed tasks released
```

### T3: Orphan Detection

```
GIVEN: task claimed by dead actor
WHEN:  monitor_cycle runs
THEN:  TASK_ORPHAN emitted
AND:   task.status = pending
```

### T4: Stuck Task Warning

```
GIVEN: task with step_started_at = now - 1.5h
WHEN:  monitor_cycle runs
THEN:  TASK_STUCK warning emitted
AND:   task.status unchanged
```

### T5: Stuck Task Release

```
GIVEN: task with step_started_at = now - 2.5h
WHEN:  monitor_cycle runs
THEN:  TASK_STUCK critical emitted
AND:   task.status = pending
```
