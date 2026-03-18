# Task: dedupe_content

```
NODE: narrative:task
STATUS: active
```

---

## Purpose

Consolidate duplicate content from multiple docs into a single canonical source.

---

## Resolves

| Problem | Severity |
|---------|----------|
| DOC_DUPLICATION | medium |

---

## Inputs

```yaml
inputs:
  target: doc_path        # Primary doc path
  duplicate: doc_path     # Secondary doc path (to be reduced)
  similarity: float       # Overlap percentage (0.0-1.0)
  problem: problem_id     # DOC_DUPLICATION
```

---

## Outputs

```yaml
outputs:
  canonical: path         # Path to canonical source
  secondary: path         # Path to updated secondary
  references_added: int   # Count of refs replacing duplicate content
  info_preserved: boolean # No content was lost
```

---

## Executor

```yaml
executor:
  type: agent
  agents: [steward, voice]
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
  mode: dedupe
```

---

## Validation

Complete when:
1. Canonical source identified and contains all unique info
2. Secondary doc references canonical instead of duplicating
3. All external references to secondary still work
4. No information lost in consolidation
5. SYNC updated with consolidation note
6. Health check passes (problem resolved)

---

## Instance (task_run)

Created by runtime when HEALTH.on_signal fires:

```yaml
node_type: narrative
type: task_run
nature: "concerns"

links:
  - nature: serves
    to: TASK_dedupe_content
  - nature: concerns
    to: "{target}"
  - nature: concerns
    to: "{duplicate}"
  - nature: resolves
    to: DOC_DUPLICATION
```
