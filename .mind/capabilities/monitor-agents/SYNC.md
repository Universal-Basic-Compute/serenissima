# SYNC: monitor-agents

```
NODE: narrative:sync
STATUS: active
```

---

## Current State

| Aspect | Status |
|--------|--------|
| Doc chain | Complete |
| Runtime checks | Pending |
| Tasks | Pending |
| Integration | Pending |

---

## Recent Changes

### 2024-12-29: Initial Creation

- Created capability structure
- Defined 5 problems: AGENT_STUCK, AGENT_DEAD, TASK_ORPHAN, TASK_STUCK, HEALTH_CHECK_FAILED
- Documented thresholds and algorithms
- Pending: runtime implementation

---

## Open Questions

1. Should STUCK thresholds be configurable per-agent?
2. Should we track stuck history to detect patterns?
3. Should dead agents be auto-restarted?

---

## Next Steps

1. Implement runtime/checks.py with cron triggers
2. Create task definitions for automated resolution
3. Add HEALTH_CHECK_FAILED handler to MCP server
4. Integration test with agent spawn
