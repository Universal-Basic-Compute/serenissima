# Task: scan_for_work

```
NODE: narrative:task
STATUS: active
```

---

## Purpose

Scan the codebase for new work when swarm is idle. Find gaps, todos, missing tests, stale docs.

---

## Resolves

| Problem | Severity |
|---------|----------|
| NO_TASKS_AVAILABLE | high |

---

## Inputs

```yaml
inputs:
  source: "swarm-driver"
  context: string  # Log lines that triggered
```

---

## Outputs

```yaml
outputs:
  tasks_created: int
  areas_scanned: list[str]
```

---

## Executor

```yaml
executor:
  type: agent
  agents: [scout, groundwork]
```

---

## Execution

1. Run `mind doctor` to find issues
2. Query graph for incomplete modules
3. Scan for @mind:TODO markers
4. Check SYNC for pending items
5. Create tasks for highest priority gaps
