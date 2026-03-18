# Skill: fix_procedure

```
NODE: narrative:skill
STATUS: active
```

---

## Purpose

Agent skill for diagnosing and repairing broken procedure YAML files.

---

## Gates

Prerequisites before using this skill:

```yaml
gates:
  - Agent can read and write YAML files
  - Agent understands procedure schema
  - .mind/ directory exists
  - Target procedure file exists (unless MEMBRANE_NO_PROTOCOLS)
```

---

## Process

```yaml
process:
  1. Identify problem type
     - MEMBRANE_NO_PROTOCOLS: need to install templates
     - MEMBRANE_PARSE_ERROR: YAML syntax broken
     - MEMBRANE_INVALID_STEP: step structure wrong
     - MEMBRANE_MISSING_FIELDS: required fields absent

  2. For MEMBRANE_NO_PROTOCOLS:
     a. Locate template procedures
     b. Copy to .mind/procedures/
     c. Validate each copied file

  3. For MEMBRANE_PARSE_ERROR:
     a. Read raw file content (not parsed)
     b. Identify error location from exception
     c. Apply targeted fix based on error pattern
     d. Re-attempt parse
     e. Repeat until clean or escalate

  4. For MEMBRANE_INVALID_STEP:
     a. Parse procedure
     b. Locate invalid step by index
     c. Add missing fields (id, action)
     d. Fix type errors (params to dict)
     e. Re-validate

  5. For MEMBRANE_MISSING_FIELDS:
     a. Parse procedure
     b. Add missing fields with defaults
     c. Preserve existing content
     d. Re-validate

  6. Final validation
     - All files parse
     - All required fields present
     - All steps valid
     - Problem resolved
```

---

## Error Patterns

Common YAML errors and fixes:

| Error | Pattern | Fix |
|-------|---------|-----|
| Missing colon | `key value` | `key: value` |
| Bad indent | Inconsistent spaces | Align with parent |
| Tab character | Contains \t | Replace with spaces |
| Unquoted special | `value: @special` | `value: "@special"` |
| Merge conflict | `<<<<<<` markers | Remove conflict markers |

---

## Tips

- Always backup before modifying
- Preserve comments when possible
- Use 2-space indentation
- Quote strings with special YAML characters
- Check diff after fix to verify only intended changes

---

## Executes

```yaml
executes:
  procedure: PROCEDURE_fix_membrane
```

---

## Used By

```yaml
used_by:
  tasks:
    - TASK_create_procedures
    - TASK_fix_yaml_syntax
    - TASK_fix_step_structure
    - TASK_add_missing_fields
```
