# Skill: write_doc

```
NODE: narrative:skill
STATUS: active
```

---

## Purpose

Agent skill for writing documentation from templates.

---

## Gates

Prerequisites before using this skill:

```yaml
gates:
  - Agent can read source code
  - Agent can write markdown
  - Templates available in templates/docs/
  - Target module exists
```

---

## Process

```yaml
process:
  1. Read target module code
     - Understand purpose, structure, key functions
     - Note dependencies, entry points

  2. For each missing doc type:
     a. Load template: templates/docs/{TYPE}_TEMPLATE.md
     b. Fill sections with context from code
     c. Write to: docs/{module}/{TYPE}.md
     d. Validate structure matches template

  3. Verify chain links
     - CHAIN section paths resolve
     - No broken references

  4. Remove any placeholder markers
     - No {placeholder} text remains
     - No STATUS: STUB
```

---

## Tips

- Read existing docs in the module first (if any)
- Follow naming conventions from PATTERNS
- Be concrete, not aspirational
- Reference actual code paths
- Keep SYNC current with what you did

---

## Executes

```yaml
executes:
  procedure: PROCEDURE_create_doc
```

---

## Used By

```yaml
used_by:
  tasks:
    - TASK_create_doc
```
