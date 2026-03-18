# {Task Name}

```
NODE: narrative:task
STATUS: active
```

---

## Definition

{What this task accomplishes - the outcome, not the process}

---

## Execution

**Executor:** agent | automated | mechanical

**Skill:** {SKILL_Name.md if executor=agent, N/A otherwise}

**Procedure:** {procedure_name}

---

## Inputs

- `{input_name}`: {description}

## Outputs

- `{output_name}`: {description}

---

## Instance Schema

When a task_run is created:

```yaml
node_type: narrative
type: task_run
status: pending | running | completed | failed
```

**Links:**
- `[OF]` → this template
- `[TARGET]` → node being created/modified
- `[CLAIMED_BY]` → actor executing

---

## Triggers

- {condition that spawns this task}
