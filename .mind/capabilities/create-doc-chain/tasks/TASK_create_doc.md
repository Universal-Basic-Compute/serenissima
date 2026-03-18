# Task: create_doc

```
NODE: narrative:task
STATUS: active
```

---

## Purpose

Create missing documentation for a module using templates.

---

## Resolves

| Problem | Severity |
|---------|----------|
| UNDOCUMENTED | critical |
| INCOMPLETE_CHAIN | high |
| PLACEHOLDER_DOC | medium |

---

## Inputs

```yaml
inputs:
  target: module_id      # Module needing docs
  missing: doc_type[]    # List of missing doc types
  problem: problem_id    # Which problem triggered this
```

---

## Outputs

```yaml
outputs:
  docs_created: path[]   # Paths to created docs
  validated: boolean     # Did docs pass validation
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
  skill: SKILL_write_doc
```

---

## Executes

```yaml
executes:
  procedure: PROCEDURE_create_doc
```

---

## Validation

Complete when:
1. All docs in `missing` exist
2. No placeholder markers remain
3. Structure matches templates
4. Health check passes (problem resolved)

---

## Instance (task_run)

Created by runtime when HEALTH.on_signal fires:

```yaml
node_type: narrative
type: task_run
nature: "{severity} concerns"  # urgently/importantly

links:
  - nature: serves
    to: TASK_create_doc
  - nature: concerns
    to: "{target}"
  - nature: resolves
    to: "{problem}"
```
