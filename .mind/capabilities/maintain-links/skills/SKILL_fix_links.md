# Skill: fix_links

```
NODE: narrative:skill
STATUS: active
```

---

## Purpose

Agent skill for fixing broken code-documentation links and resolving orphan docs.

---

## Gates

Prerequisites before using this skill:

```yaml
gates:
  - Agent can search codebase (glob, grep)
  - Agent can read and edit markdown files
  - Agent understands IMPL: and DOCS: marker syntax
  - Project has docs/ directory structure
```

---

## Process

### For BROKEN_IMPL_LINK

```yaml
process:
  1. Read target doc and identify broken IMPL: markers
     - Parse all IMPL: and implements: patterns
     - For each, check if path exists

  2. For each broken marker:
     a. Extract filename from path
     b. Search codebase: glob(**/{filename})
     c. If single match:
        - Update IMPL: to new path
        - Check if code has DOCS: marker, update if needed
     d. If multiple matches:
        - Compare directory structure
        - If confident match (>80%): update
        - Else: escalate with candidates list
     e. If no matches:
        - Code was deleted
        - Remove IMPL: marker
        - Flag doc for orphan check

  3. Validate changes
     - All updated IMPL: links resolve
     - Doc content preserved (except link updates)
```

### For ORPHAN_DOCS

```yaml
process:
  1. Analyze orphan doc
     - Read content to understand topic
     - Check if doc is stub/placeholder
     - Look for module name hints

  2. Search for matching code
     a. By module name: glob(src/{module}/, lib/{module}/)
     b. By keywords in doc: grep for key terms
     c. By file patterns: if doc mentions specific files

  3. Decision tree:
     a. Code found:
        - Create IMPL: link in doc
        - Add DOCS: marker to code file header
        - Resolution: linked
     b. Doc is stub:
        - Delete doc
        - Resolution: deleted
     c. Doc has value, code missing:
        - Archive to docs/archive/{date}_{doc}
        - Resolution: archived
     d. Uncertain:
        - Create escalation
        - Resolution: escalated

  4. Validate resolution
     - Doc no longer orphan (linked, archived, or deleted)
```

---

## Tips

- Always search before deciding code doesn't exist
- Check git log for recent renames/moves if available
- Preserve doc content when updating links
- When archiving, add note explaining why
- Escalate rather than delete if uncertain

---

## Executes

```yaml
executes:
  procedure: PROCEDURE_fix_links
```

---

## Used By

```yaml
used_by:
  tasks:
    - TASK_fix_impl_link
    - TASK_fix_orphan_docs
```
