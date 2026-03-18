# Task: add_missing_fields

```
NODE: narrative:task
STATUS: active
```

---

## Purpose

Add missing required fields (name, steps) to procedure definitions.

---

## Resolves

| Problem | Severity |
|---------|----------|
| MEMBRANE_MISSING_FIELDS | high |

---

## Inputs

```yaml
inputs:
  target: path             # Path to procedure file
  missing_fields: string[] # List of missing field names
```

---

## Outputs

```yaml
outputs:
  file_fixed: path       # Path to fixed file
  fields_added: string[] # Fields that were added
  validated: boolean     # Did procedure pass validation after fix
```

---

## Executor

```yaml
executor:
  type: agent
  agents: [fixer, groundwork]
```

---

## Uses

```yaml
uses:
  skill: SKILL_fix_procedure
```

---

## Executes

```yaml
executes:
  procedure: PROCEDURE_fix_membrane
```

---

## Field Defaults

| Missing Field | Default Value |
|---------------|---------------|
| name | Derived from filename |
| version | "1.0" |
| status | "active" |
| steps | [{ id: 'placeholder', action: 'noop', name: 'TODO: Add steps' }] |
| purpose | "TODO: Describe purpose" |

---

## Steps

1. Load and parse procedure file
2. Identify which required fields are missing
3. For each missing field:
   - 'name': derive from filename (update_sync.yaml -> "update_sync")
   - 'steps': add placeholder step array
   - Other: use template defaults
4. Preserve existing content
5. Save file
6. Re-validate procedure

---

## Validation

Complete when:
1. 'name' field exists and is non-empty string
2. 'steps' field exists and is non-empty list
3. All steps have required fields (id, action)
4. Health check passes (MEMBRANE_MISSING_FIELDS resolved)

---

## Instance (task_run)

Created by runtime when HEALTH.on_signal fires:

```yaml
node_type: narrative
type: task_run
nature: "importantly concerns"

links:
  - nature: serves
    to: TASK_add_missing_fields
  - nature: concerns
    to: "{target}"
  - nature: resolves
    to: MEMBRANE_MISSING_FIELDS
```
