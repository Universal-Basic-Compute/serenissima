# Behaviors: monitor-agents

```
NODE: narrative:behaviors
STATUS: active
```

---

## Observable Behaviors

### B1: Heartbeat Check

```
GIVEN: Cron trigger fires (every 60s)
WHEN:  Scanner queries all actors with status=running
THEN:  Each actor's last_heartbeat is compared to now()
AND:   Appropriate problem is emitted based on threshold
```

### B2: Stuck Warning

```
GIVEN: Actor has status=running
WHEN:  now() - last_heartbeat > 5min
AND:   now() - last_heartbeat <= 15min
THEN:  AGENT_STUCK warning is logged
AND:   No action is taken (may recover)
```

### B3: Dead Detection

```
GIVEN: Actor has status=running
WHEN:  now() - last_heartbeat > 15min
THEN:  AGENT_DEAD is emitted
AND:   actor.status is set to "dead"
AND:   All WORKS_ON links are removed
AND:   Claimed tasks are released
```

### B4: Orphan Detection

```
GIVEN: Task has status=claimed
WHEN:  CLAIMED_BY link points to dead actor
THEN:  TASK_ORPHAN is emitted
AND:   task.status is set to "pending"
AND:   CLAIMED_BY link is removed
```

### B5: Stuck Task Warning

```
GIVEN: Task has status=running
WHEN:  now() - step_started_at > 1h
AND:   now() - step_started_at <= 2h
THEN:  TASK_STUCK warning is logged
AND:   No action is taken yet
```

### B6: Stuck Task Release

```
GIVEN: Task has status=running
WHEN:  now() - step_started_at > 2h
THEN:  task.status is set to "pending"
AND:   CLAIMED_BY link is removed
AND:   Agent is notified of release
```

### B7: Health Check Error

```
GIVEN: MCP calls capability.check(ctx)
WHEN:  Exception is raised during execution
THEN:  HEALTH_CHECK_FAILED is emitted
AND:   Error message and traceback are captured
AND:   Task is created for agent investigation
```

---

## State Transitions

### Actor States

```
running → running  (heartbeat OK)
running → running  (STUCK warning, no change)
running → dead     (DEAD detected)
dead → ready       (manual restart only)
```

### Task States

```
pending → claimed   (agent claims)
claimed → running   (agent starts)
running → running   (step progress OK)
running → pending   (STUCK release at 2h)
claimed → pending   (ORPHAN release)
running → completed (success)
running → failed    (error)
```
