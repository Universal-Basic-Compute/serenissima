# Health: monitor-agents

```
NODE: narrative:health
STATUS: active
```

---

## Health Checks

### H1: Monitor Running

```yaml
id: monitor_running
signal: critical
check: Cron job executing every 60s
recovery: Restart MCP server
```

### H2: No Zombie Agents

```yaml
id: no_zombie_agents
signal: warning
check: No actors with status=running AND last_heartbeat > 15min
recovery: Run cleanup manually
```

### H3: No Orphan Tasks

```yaml
id: no_orphan_tasks
signal: warning
check: No tasks claimed by dead agents
recovery: Release orphan tasks
```

---

## Signals

| Signal | Meaning | Action |
|--------|---------|--------|
| healthy | All checks pass | None |
| degraded | Warnings present | Monitor |
| critical | Monitor not running | Restart |

---

## Self-Monitoring

The monitor-agents capability monitors itself:

```python
def self_check(ctx):
    # Check that cron is registered and running
    last_run = ctx.get_property("monitor_agents", "last_run")
    if now() - last_run > 120:  # 2 minutes
        return Signal.critical(message="Monitor cycle not running")
    return Signal.healthy()
```
