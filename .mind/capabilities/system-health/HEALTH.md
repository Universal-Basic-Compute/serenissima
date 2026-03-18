# Health: system-health

Self-monitoring capability for the capability runtime itself.

## Health Indicators

### H1: Stuck Agent Detection

| Field | Value |
|-------|-------|
| ID | `stuck_agent_detection` |
| Trigger | `cron.every(60)` |
| Problem | `AGENT_STUCK`, `AGENT_DEAD` |
| Task | `TASK_investigate_stuck_agent` |

**Behavior:**
- Runs every 60 seconds
- Checks all running agents for stale heartbeats
- DEGRADED: 5-10 min without heartbeat
- CRITICAL: >10 min without heartbeat (auto-marks dead)

### H2: Orphan Task Detection

| Field | Value |
|-------|-------|
| ID | `orphan_task_detection` |
| Trigger | `cron.every(60)` |
| Problem | `TASK_ORPHAN` |
| Task | `TASK_release_orphan_task` |

**Behavior:**
- Runs every 60 seconds
- Finds tasks claimed by dead agents
- Auto-releases them back to pending
- Creates task_run for audit trail

### H3: Health Check Failure

| Field | Value |
|-------|-------|
| ID | `health_check_failure` |
| Trigger | `stream.on_error(".mind/logs/health.log")` |
| Problem | `HEALTH_CHECK_FAILED` |
| Task | `TASK_investigate_health_failure` |

**Behavior:**
- Triggered when any check.py crashes or times out
- Creates task for investigation

### H4: Queue Health

| Field | Value |
|-------|-------|
| ID | `agent_queue_health` |
| Trigger | `cron.every(5)` |
| Problem | `QUEUE_UNHEALTHY` |
| Task | `TASK_investigate_queue` |

**Behavior:**
- Runs every 5 minutes
- Checks if queue is full with no workers
- DEGRADED: Queue >80% full, no workers
- CRITICAL: Queue >80% full, workers stuck
