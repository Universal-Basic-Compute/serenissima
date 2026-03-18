# Objectives: monitor-agents

```
NODE: narrative:objectives
STATUS: active
```

---

## Purpose

Monitor agent and task health to detect stuck, dead, or orphaned states and automatically recover.

---

## Goals (Ranked)

1. **Detect dead agents** — Identify agents without heartbeat for >15min
2. **Release orphaned tasks** — Free tasks claimed by dead agents
3. **Warn on stuck states** — Alert before problems become critical
4. **Auto-recover** — Automated cleanup without human intervention
5. **Investigate crashes** — Route check failures to agents for debugging

---

## Non-Goals

- Agent scheduling/assignment (that's membrane)
- Task creation (that's doctor)
- Performance optimization (just health)

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Dead agent detection | <60s after threshold |
| Orphan task release | <60s after agent death |
| False positive rate | <1% |
| Auto-recovery success | >99% |
