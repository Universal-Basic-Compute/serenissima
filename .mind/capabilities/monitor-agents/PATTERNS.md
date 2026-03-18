# Patterns: monitor-agents

```
NODE: narrative:patterns
STATUS: active
```

---

## Design Philosophy

Agent health monitoring follows the **cron + threshold** pattern:

1. **Periodic scans** — Check all running agents/tasks every 60s
2. **Threshold-based detection** — Problems trigger at specific time limits
3. **Graduated response** — Warning before critical, log before action
4. **Automated recovery** — Most problems resolve without human intervention

---

## Core Pattern: Heartbeat Monitoring

```
Agent running
    ↓ cron 60s
Check last_heartbeat
    ↓
    ├── < 5min → OK
    ├── 5-15min → AGENT_STUCK (warning, log only)
    └── > 15min → AGENT_DEAD (critical, cleanup)
```

---

## Core Pattern: Task Lifecycle

```
Task claimed
    ↓ cron 60s
Check agent status
    ↓
    ├── agent alive → check step duration
    │   ├── < 1h → OK
    │   ├── 1-2h → TASK_STUCK (warning)
    │   └── > 2h → release task
    └── agent dead → TASK_ORPHAN (release immediately)
```

---

## Executor Types

| Type | When | Example |
|------|------|---------|
| **automated** | Deterministic fix | Release task, cleanup actor |
| **agent** | Requires judgment | Investigate crash, debug check |

---

## Scope

**In scope:**
- Agent heartbeat monitoring
- Task claim/status tracking
- Automated cleanup
- Health check error handling

**Out of scope:**
- Agent running
- Task prioritization
- Performance metrics
