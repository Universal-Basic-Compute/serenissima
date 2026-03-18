# Task: resolve_escalation

```
NODE: narrative:task
STATUS: active
```

---

## Purpose

Resolve a blocking @mind:escalation marker by making a decision or escalating to human.

---

## Resolves

| Problem | Severity |
|---------|----------|
| ESCALATION | critical |

---

## Inputs

```yaml
inputs:
  target: file_path:line     # Location of escalation
  context: string            # Escalation message/context
  age_hours: number          # How long it's been stale
  problem: problem_id        # ESCALATION
```

---

## Outputs

```yaml
outputs:
  decision: string           # What was decided
  rationale: string          # Why this decision
  escalated_to_human: bool   # If human decision needed
  marker_removed: boolean    # Was marker removed
```

---

## Executor

```yaml
executor:
  type: agent
  agents: [architect, voice]
```

---

## Uses

```yaml
uses:
  skill: SKILL_solve_markers
```

---

## Executes

```yaml
executes:
  procedure: PROCEDURE_solve_markers
  params:
    marker_type: ESCALATION
```

---

## Validation

Complete when:
1. Decision made and documented
2. Original marker removed from file
3. If human needed, escalation forwarded
4. Health check passes (problem resolved)

---

## Process

```yaml
process:
  1. Read marker context and surrounding code
  2. Identify what decision is needed
  3. Analyze options and tradeoffs
  4. If confidence > 0.8: make decision
     Else: escalate to human
  5. Document decision with rationale
  6. Remove original marker
  7. Update SYNC
```

---

## Instance (task_run)

Created by runtime when HEALTH.on_signal fires:

```yaml
node_type: narrative
type: task_run
nature: "urgently concerns"

links:
  - nature: serves
    to: TASK_resolve_escalation
  - nature: concerns
    to: "{target}"
  - nature: resolves
    to: ESCALATION
```
