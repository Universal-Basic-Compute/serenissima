# Swarm Driver — Objectives

```
STATUS: CANONICAL
PRIORITY: P0
```

---

## Primary Objective

**Drive the swarm by reading logs and creating relevant tasks.**

The swarm driver watches `.mind/swarm/logs/`, analyzes agent activity, detects gaps, and creates tasks to keep the swarm productive. It's the feedback loop that ensures continuous useful work.

---

## Ranked Goals

| Rank | Goal | Tradeoff |
|------|------|----------|
| 1 | **Continuous task generation** | Never let agents idle if work exists |
| 2 | **Priority steering** | High-impact tasks first |
| 3 | **Gap detection** | Find what's missing, blocked, or stale |
| 4 | **SYNC coherence** | Keep project state accurate |

---

## Non-Goals

- Executing tasks (agents do that)
- Replacing human decisions (escalate ambiguity)
- Micromanaging (guide, don't control)

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Agent idle time | < 10% |
| Task relevance | > 90% useful |
| False positive tasks | < 5% |
| Log processing latency | < 30s |
