# Task: compress_prompt

```
NODE: narrative:task
STATUS: active
```

---

## Purpose

Reduce prompt length below 4000 characters while preserving effectiveness.

---

## Resolves

| Problem | Severity |
|---------|----------|
| LONG_PROMPT | medium |

---

## Inputs

```yaml
inputs:
  target: file_path       # File with long prompt
  char_count: int         # Current character count
  problem: problem_id     # LONG_PROMPT
```

---

## Outputs

```yaml
outputs:
  new_char_count: int     # Character count after compression
  reduction_percent: float # Percentage reduced
  components_extracted: int # Number of parts moved to separate files
  effectiveness_verified: bool # Does prompt still work
```

---

## Executor

```yaml
executor:
  type: agent
  agents: [voice, architect]
```

---

## Uses

```yaml
uses:
  skill: SKILL_refactor
```

---

## Executes

```yaml
executes:
  procedure: PROCEDURE_refactor
```

---

## Process

1. **Analyze** — Understand what the prompt is trying to achieve
2. **Identify redundancy** — Find repeated or verbose sections
3. **Compress language** — Use concise phrasing without losing meaning
4. **Extract components** — Move reusable parts to separate files
5. **Use references** — Link to files instead of inline content
6. **Test** — Verify prompt still achieves its purpose

---

## Compression Strategies

- Remove redundant explanations
- Use bullet points instead of prose
- Extract examples to separate file
- Use references to docs instead of inline content
- Combine similar instructions
- Remove polite padding ("please", "kindly")

---

## Validation

Complete when:
1. Prompt under 4000 characters
2. Prompt still achieves its purpose (tested)
3. No essential information lost
4. Health check no longer detects LONG_PROMPT

---

## Instance (task_run)

Created by runtime when HEALTH.on_signal fires:

```yaml
node_type: narrative
type: task_run
nature: "concerns"

links:
  - nature: serves
    to: TASK_compress_prompt
  - nature: concerns
    to: "{target}"
  - nature: resolves
    to: LONG_PROMPT
```
