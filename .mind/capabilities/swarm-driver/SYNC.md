# Swarm Driver — Sync

```
LAST_UPDATED: 2025-12-30
STATUS: CANONICAL
```

---

## Current State

Swarm driver capability is **defined and ready for implementation**.

---

## Behavior Summary

| Aspect | Value |
|--------|-------|
| Frequency | Every 2 minutes |
| Trigger | Only if new log content |
| Output | At most 1 task (singleton) |
| Reactivation | Yes, if issue recurs after completion |

---

## State File

```
.mind/swarm/driver_state.json
```

Tracks:
- File positions (read offsets)
- Last task ID created
- Last run timestamp

---

## Log Sources

```
.mind/swarm/logs/*.log
```

Expected files:
- `agent_*.log` — per-agent activity
- `tasks.log` — task lifecycle
- `errors.log` — failures
- `completions.log` — finished work

---

## Implementation Status

| Component | Status |
|-----------|--------|
| Doc chain | ✅ complete |
| Runtime | pending |
| Integration | pending |

---

## Next Steps

1. Create `.mind/swarm/logs/` directory
2. Implement `runtime/driver.py`
3. Register with cron scheduler
4. Test with sample logs
