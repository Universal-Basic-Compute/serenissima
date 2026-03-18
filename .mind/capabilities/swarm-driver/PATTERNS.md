# Swarm Driver — Patterns

```
STATUS: CANONICAL
```

---

## Core Pattern: Log-Driven Task Generation

```
Logs → Parse → Detect Patterns → Create Tasks → Update SYNC
         ↑                              │
         └──────── only if new ─────────┘
```

**Only process new content.** Track file positions. Skip if nothing new.

---

## Log Sources

```
.mind/swarm/logs/
├── agent_{name}.log      # Per-agent activity
├── tasks.log             # Task lifecycle events
├── errors.log            # Failures and exceptions
└── completions.log       # Finished work
```

---

## Detection Patterns

### P1: Agent Stuck

```
Pattern: Same task_id in agent log for > 30 minutes without progress
Signal: Agent needs help or task is blocked
Action: Create TASK_unblock or escalate
```

### P2: Error Spike

```
Pattern: > 3 errors from same source in 5 minutes
Signal: Systemic issue
Action: Create TASK_investigate with error context
```

### P3: Completion Gap

```
Pattern: Many tasks started, few completed
Signal: Tasks too large or agents struggling
Action: Create TASK_split or review scope
```

### P4: Idle Agents

```
Pattern: No activity from agent in > 10 minutes
Signal: No work available or agent stalled
Action: Run task scan, create new tasks
```

### P5: SYNC Drift

```
Pattern: Completions not reflected in SYNC
Signal: State getting stale
Action: Create TASK_update_sync
```

---

## Position Tracking

```python
# .mind/swarm/driver_state.json
{
  "positions": {
    "agent_witness.log": 12847,
    "tasks.log": 5621,
    "errors.log": 892
  },
  "last_run": "2025-12-30T04:45:00Z"
}
```

Read from position → end. Update position. Skip if position == file size.

---

## Priority Calculation

```python
priority = base_priority + urgency_boost + staleness_penalty

# Factors:
# - Error severity: critical=10, degraded=5
# - Time waiting: +1 per hour unclaimed
# - Dependencies: +3 if blocking other work
# - SYNC mention: +2 if affects project state
```

---

## Anti-Patterns

| ❌ Don't | ✅ Do |
|----------|-------|
| Re-read entire log | Track position, read new only |
| Create duplicate tasks | Hash-based dedupe |
| Ignore context | Include relevant log lines in task |
| Spam tasks | Throttle per source |
