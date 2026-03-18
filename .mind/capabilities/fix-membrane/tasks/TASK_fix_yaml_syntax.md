# Task: fix_yaml_syntax

```
NODE: narrative:task
STATUS: active
```

---

## Purpose

Fix YAML syntax errors in procedure files that prevent parsing.

---

## Resolves

| Problem | Severity |
|---------|----------|
| MEMBRANE_PARSE_ERROR | critical |

---

## Inputs

```yaml
inputs:
  target: path           # Path to broken procedure file
  error_line: int        # Line number where error occurred
  error_msg: string      # YAML parser error message
```

---

## Outputs

```yaml
outputs:
  file_fixed: path       # Path to fixed file
  changes_made: string[] # Description of fixes applied
  validated: boolean     # Did file parse after fix
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

| Error Pattern | Fix |
|---------------|-----|
| "expected ':'" | Add missing colon after key |
| "mapping values" | Fix indentation alignment |
| "found character" | Quote string with special chars |
| "<<<<<< HEAD" | Remove merge conflict markers |
| "found tab" | Convert tabs to spaces |

---

## Steps

1. Read file content
2. Parse error message to understand issue
3. Locate problem at error_line
4. Apply appropriate fix based on error pattern
5. Re-attempt parse
6. If still fails, try next fix strategy
7. If all strategies fail, escalate to human

---

## Validation

Complete when:
1. File parses with yaml.safe_load()
2. No syntax errors remain
3. Content meaning preserved
4. Health check passes (MEMBRANE_PARSE_ERROR resolved)

---

## Instance (task_run)

Created by runtime when HEALTH.on_signal fires:

```yaml
node_type: narrative
type: task_run
nature: "urgently concerns"

links:
  - nature: serves
    to: TASK_fix_yaml_syntax
  - nature: concerns
    to: "{target}"
  - nature: resolves
    to: MEMBRANE_PARSE_ERROR
```
