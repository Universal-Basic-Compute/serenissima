# Task: answer_question

```
NODE: narrative:task
STATUS: active
```

---

## Purpose

Research and answer an unresolved @mind:question marker.

---

## Resolves

| Problem | Severity |
|---------|----------|
| UNRESOLVED_QUESTION | medium |

---

## Inputs

```yaml
inputs:
  target: file_path:line     # Location of question
  context: string            # Question text
  age_days: number           # How long it's been stale
  problem: problem_id        # UNRESOLVED_QUESTION
```

---

## Outputs

```yaml
outputs:
  answer: string             # The answer
  confidence: float          # 0.0-1.0 confidence in answer
  sources: string[]          # Where answer came from
  escalated_to_human: bool   # If human input needed
  marker_removed: boolean    # Was marker removed
```

---

## Executor

```yaml
executor:
  type: agent
  agents: [witness, voice]
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
    marker_type: UNRESOLVED_QUESTION
```

---

## Validation

Complete when:
1. Answer documented near original question OR
2. Escalated to human with research context
3. Original marker removed from file
4. Health check passes (problem resolved)

---

## Process

```yaml
process:
  1. Read question and surrounding context
  2. Research answer:
     - Check codebase for patterns/precedents
     - Check documentation for guidance
     - Check external sources if applicable
  3. Assess confidence:
     - If > 0.7: document answer
     - If < 0.7: escalate to human with research
  4. Document answer:
     - Add as comment near question
     - Or update documentation
  5. Remove original marker
  6. Update SYNC
```

---

## Instance (task_run)

Created by runtime when HEALTH.on_signal fires:

```yaml
node_type: narrative
type: task_run
nature: "concerns"

links:
  - nature: serves
    to: TASK_answer_question
  - nature: concerns
    to: "{target}"
  - nature: resolves
    to: UNRESOLVED_QUESTION
```
