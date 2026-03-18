# Task: fix_step_structure

```
NODE: narrative:task
STATUS: active
```

---

## Purpose

Fix procedure steps that have invalid structure (missing id, action, or malformed params).

---

## Resolves

| Problem | Severity |
|---------|----------|
| MEMBRANE_INVALID_STEP | high |

---

## Inputs

```yaml
inputs:
  target: path           # Path to procedure file
  step_index: int        # Index of invalid step
  issue: string          # Description of what's wrong
```

---

## Outputs

```yaml
outputs:
  file_fixed: path       # Path to fixed file
  step_fixed: int        # Index of fixed step
  changes_made: string[] # Description of fixes applied
  validated: boolean     # Did step pass validation after fix
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

## Common Fixes

| Issue | Fix |
|-------|-----|
| Missing 'id' | Generate from action name or index |
| Missing 'action' | Default to 'noop' or infer from context |
| Params not dict | Wrap string value in dict |
| Empty params | Remove or add placeholder |

---

## Steps

1. Load and parse procedure file
2. Locate step at step_index
3. Identify missing or invalid fields
4. Apply fix:
   - For missing 'id': derive from action or use step_{index}
   - For missing 'action': use 'noop' and add TODO comment
   - For invalid params: convert to proper dict structure
5. Re-validate step
6. Save file
7. Verify full procedure still valid

---

## Validation

Complete when:
1. Step has 'id' field (string)
2. Step has 'action' or 'name' field (string)
3. If 'params' present, it's a dict
4. Full procedure validates
5. Health check passes (MEMBRANE_INVALID_STEP resolved)

---

## Instance (task_run)

Created by runtime when HEALTH.on_signal fires:

```yaml
node_type: narrative
type: task_run
nature: "importantly concerns"

links:
  - nature: serves
    to: TASK_fix_step_structure
  - nature: concerns
    to: "{target}"
  - nature: resolves
    to: MEMBRANE_INVALID_STEP
```
