# Swarm Driver — Health

```
STATUS: CANONICAL
CAPABILITY: swarm-driver
```

---

## Indicators

### H1: Driver Running

```yaml
name: Driver Active
priority: critical

mechanism: |
  1. Check driver_state.json exists
  2. Check last_run < 5 minutes ago
  3. If stale → driver not running

signals:
  healthy: Driver ran within last 5 minutes
  critical: Driver not running or stale

on_signal:
  critical:
    action: restart_driver
```

### H2: Log Processing

```yaml
name: Log Processing
priority: high

mechanism: |
  1. Compare file sizes to positions
  2. If gap > 10KB → falling behind
  3. If gap > 100KB → critical backlog

signals:
  healthy: Processing keeps up with logs
  degraded: Small backlog (< 100KB)
  critical: Large backlog (> 100KB)
```

### H3: Task Singleton

```yaml
name: Task Singleton
priority: high

mechanism: |
  1. Query graph for driver tasks
  2. Count active (pending/claimed)
  3. Should be 0 or 1

signals:
  healthy: 0-1 active driver tasks
  critical: > 1 active (singleton violated)

on_signal:
  critical:
    action: cancel_duplicates
```

---

## Triggers

```yaml
triggers:
  - cron.every_2_minutes    # Main driver loop
  - init.startup            # Start driver
  - file.swarm_logs         # Log file changes (optional fast path)
```
