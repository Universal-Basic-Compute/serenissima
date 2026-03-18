# Task: unblock

```
NODE: narrative:task
STATUS: active
```

---

## Purpose

Unblock a stuck agent by investigating the cause and resolving it.

---

## Resolves

| Problem | Severity |
|---------|----------|
| AGENT_STUCK | high |

---

## Inputs

```yaml
inputs:
  agent: string       # Which agent is stuck
  context: list[str]  # Recent log lines
```

---

## Outputs

```yaml
outputs:
  resolved: boolean
  action_taken: string
  needs_escalation: boolean
```

---

## Executor

```yaml
executor:
  type: agent
  agents: [weaver, fixer]
```

---

## Execution

1. Read agent's recent log lines
2. Identify blocking issue (missing file, API error, unclear spec)
3. If resolvable: fix it
4. If needs human: create escalation
5. Ping stuck agent to retry
