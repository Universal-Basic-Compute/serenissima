# Task: fill_gap

```
NODE: narrative:task
STATUS: active
```

---

## Purpose

Fill @mind:gap markers with actual content based on research and context.

---

## Resolves

| Problem | Severity |
|---------|----------|
| DOC_GAPS | high |

---

## Inputs

```yaml
inputs:
  target: doc_path        # Path to doc with gap
  context: gap_text       # The @mind:gap marker text
  problem: problem_id     # DOC_GAPS
```

---

## Outputs

```yaml
outputs:
  content_added: string   # The content that replaced the gap
  gap_resolved: boolean   # Did gap marker get removed
  escalated: boolean      # Did we need human input
```

---

## Executor

```yaml
executor:
  type: agent
  agents: [voice, groundwork]
```

---

## Uses

```yaml
uses:
  skill: SKILL_fill_gaps
```

---

## Executes

```yaml
executes:
  procedure: PROCEDURE_fill_gaps
  mode: fill_gap
```

---

## Validation

Complete when:
1. `@mind:gap` marker removed from target location
2. Substantive content exists in its place (> 50 chars)
3. Content is not placeholder text (no TBD, TODO)
4. SYNC updated with resolution note
5. Health check passes (problem resolved)

If gap requires human input:
1. Add `@mind:escalation` marker
2. Document what's needed
3. Mark task as blocked

---

## Instance (task_run)

Created by runtime when HEALTH.on_signal fires:

```yaml
node_type: narrative
type: task_run
nature: "importantly concerns"

links:
  - nature: serves
    to: TASK_fill_gap
  - nature: concerns
    to: "{target}"
  - nature: resolves
    to: DOC_GAPS
```
