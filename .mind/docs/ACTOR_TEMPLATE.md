# {Actor Name}

```
NODE: narrative:actor
SUBTYPE: mechanical | agent
STATUS: active
```

---

## Purpose

{What this actor does - its role in the system}

---

## Capabilities

Tasks this actor can execute:

- `TASK_{name}` — {brief description}

---

## Triggers

| Trigger | Condition |
|---------|-----------|
| cron | `{schedule}` |
| event | `{event_type}` |
| manual | {description} |

---

## Implementation

**Code:** `{path/to/implementation.py}` (if mechanical)

**Agent:** `{agent_name}` (if agent, links to .mind/agents/{name}/)

---

## Instance Schema

Actor node created at `mind init`:

```yaml
node_type: actor
type: {actor_name}
```

**Links:**
- `serves` → this template (narrative:actor)
