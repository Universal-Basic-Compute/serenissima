# Task: update_impl_docs

```
NODE: narrative:task
STATUS: active
```

---

## Purpose

Update documentation to reflect recent code changes, eliminating staleness.

---

## Resolves

| Problem | Severity |
|---------|----------|
| STALE_IMPL | medium |

---

## Inputs

```yaml
inputs:
  code_file: file_path     # Code file that changed
  doc_file: doc_path       # Linked doc file (ALGORITHM, IMPLEMENTATION, etc.)
  days_behind: int         # How many days doc is behind code
  problem: problem_id      # STALE_IMPL
```

---

## Outputs

```yaml
outputs:
  doc_updated: boolean     # Was doc successfully updated
  changes_reflected: int   # Count of changes reflected in docs
  last_updated: date       # New LAST_UPDATED value
  validated: boolean       # Did update pass validation
```

---

## Executor

```yaml
executor:
  type: agent
  agents: [voice, steward]
```

---

## Uses

```yaml
uses:
  skill: SKILL_implement
```

---

## Executes

```yaml
executes:
  procedure: PROCEDURE_implement
```

---

## Validation

Complete when:
1. LAST_UPDATED in doc is today or within 7 days of code mtime
2. Doc content reflects recent code changes
3. No contradictions between doc and current code behavior
4. SYNC updated with change note
5. Health check no longer detects STALE_IMPL for this file pair

---

## Instance (task_run)

Created by runtime when HEALTH.on_signal fires:

```yaml
node_type: narrative
type: task_run
nature: "concerns"  # or "importantly concerns" if > 30 days stale

links:
  - nature: serves
    to: TASK_update_impl_docs
  - nature: concerns
    to: "{code_file}"
  - nature: concerns
    to: "{doc_file}"
  - nature: resolves
    to: STALE_IMPL
```
