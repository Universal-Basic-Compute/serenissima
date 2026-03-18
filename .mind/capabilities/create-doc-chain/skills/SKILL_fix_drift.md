# Skill: fix_drift

```
NODE: narrative:skill
STATUS: active
```

---

## Purpose

Agent skill for fixing documentation that has drifted from template structure.

---

## Gates

Prerequisites before using this skill:

```yaml
gates:
  - Agent can read documentation templates
  - Agent can edit markdown files
  - Templates available in templates/docs/
  - Target doc exists and has structure issues
```

---

## Process

```yaml
process:
  1. Load template
     - Determine doc type from filename (PATTERNS, ALGORITHM, etc.)
     - Load: templates/docs/{TYPE}_TEMPLATE.md
     - Extract required sections (## headers)

  2. Analyze current doc
     - Read target doc content
     - Extract existing sections
     - Identify content in each section

  3. Compare and identify drift
     - Missing sections from template
     - Extra sections not in template
     - Wrong section order

  4. Fix structure
     - Add missing sections (empty with TODO marker)
     - Preserve all existing content
     - Reorder sections to match template
     - Do NOT delete extra sections (move to end)

  5. Validate result
     - All required sections present
     - Original content preserved
     - Structure matches template
```

---

## Tips

- Never lose existing content during restructure
- Add @mind:todo markers for empty sections
- Keep custom sections at the end
- Update SYNC with what was fixed
- Run template_drift check after to verify

---

## Executes

```yaml
executes:
  procedure: PROCEDURE_fix_drift
```

---

## Used By

```yaml
used_by:
  tasks:
    - TASK_fix_template_drift
```
