# Implementation: monitor-agents

```
NODE: narrative:implementation
STATUS: active
```

---

## File Structure

```
capabilities/monitor-agents/
├── OBJECTIVES.md
├── PATTERNS.md
├── VOCABULARY.md
├── BEHAVIORS.md
├── ALGORITHM.md
├── VALIDATION.md
├── IMPLEMENTATION.md    ← you are here
├── HEALTH.md
├── SYNC.md
├── tasks/
│   ├── TASK_log_stuck_agent.md
│   ├── TASK_cleanup_dead_agent.md
│   ├── TASK_release_orphan_task.md
│   ├── TASK_unstick_task.md
│   └── TASK_investigate_health_failure.md
└── runtime/
    ├── __init__.py
    └── checks.py
```

---

## Runtime Checks

Location: `runtime/checks.py`

```python
@check(
    id="agent_health",
    triggers=[triggers.cron.every("60s")],
    on_problem=["AGENT_STUCK", "AGENT_DEAD"],
)
def agent_health(ctx) -> list:
    """Check all running agents for heartbeat."""
    ...

@check(
    id="task_health",
    triggers=[triggers.cron.every("60s")],
    on_problem=["TASK_ORPHAN", "TASK_STUCK"],
)
def task_health(ctx) -> list:
    """Check all claimed/running tasks."""
    ...
```

---

## Graph Queries

### Find Running Agents

```cypher
MATCH (a:Actor {status: 'running'})
RETURN a.id, a.last_heartbeat
```

### Find Claimed Tasks

```cypher
MATCH (t:Narrative {type: 'task_run', status: 'claimed'})
OPTIONAL MATCH (t)-[:CLAIMED_BY]->(a:Actor)
RETURN t.id, t.step_started_at, a.id, a.status
```

### Cleanup Dead Agent

```cypher
MATCH (a:Actor {id: $agent_id})
SET a.status = 'dead'
WITH a
MATCH (a)-[r:WORKS_ON]->()
DELETE r
```

### Release Task

```cypher
MATCH (t:Narrative {id: $task_id})
SET t.status = 'pending', t.claimed_by = null
WITH t
MATCH (t)-[r:CLAIMED_BY]->()
DELETE r
```

---

## Dependencies

| Dependency | Purpose |
|------------|---------|
| runtime.infrastructure.database | Graph adapter |
| runtime.physics.graph | Graph queries |
| mcp.server | Cron trigger registration |

---

## Configuration

```yaml
# Thresholds (could be configurable)
agent:
  stuck_threshold: 300      # 5 minutes
  dead_threshold: 900       # 15 minutes

task:
  warn_threshold: 3600      # 1 hour
  release_threshold: 7200   # 2 hours

cron:
  interval: 60              # seconds
```
