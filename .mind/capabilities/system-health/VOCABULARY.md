# Vocabulary: system-health

## Problems

| ID | Description | Severity |
|----|-------------|----------|
| `AGENT_STUCK` | Agent no heartbeat > 5 min | DEGRADED |
| `AGENT_DEAD` | Agent no heartbeat > 10 min | CRITICAL |
| `TASK_ORPHAN` | Task claimed by dead agent | DEGRADED (auto-fixed) |
| `HEALTH_CHECK_FAILED` | check.py crashed/timeout | DEGRADED |
| `QUEUE_UNHEALTHY` | Queue full, no workers | DEGRADED/CRITICAL |

## Thresholds

| Name | Value | Description |
|------|-------|-------------|
| `STUCK_THRESHOLD` | 300s (5 min) | Time before marking agent stuck |
| `DEAD_THRESHOLD` | 600s (10 min) | Time before marking agent dead |
| `HEARTBEAT_INTERVAL` | 60s | Expected heartbeat frequency |
| `QUEUE_WARNING` | 80% | Queue fullness warning level |

## Auto-Resolution

| Problem | Auto-Fixed? | How |
|---------|-------------|-----|
| `TASK_ORPHAN` | Yes | Released back to pending |
| `AGENT_DEAD` | Partial | Task released, agent marked dead |
| `AGENT_STUCK` | No | Requires investigation |
| `HEALTH_CHECK_FAILED` | No | Requires code fix |
| `QUEUE_UNHEALTHY` | No | Requires agent spawn or investigation |
