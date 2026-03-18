# Skill: fill_gaps

```
NODE: narrative:skill
STATUS: active
```

---

## Purpose

Agent skill for resolving documentation quality issues: filling gaps, consolidating duplicates, and splitting large docs.

---

## Gates

Prerequisites before using this skill:

```yaml
gates:
  - Agent can read/write markdown files
  - Agent can research content in codebase
  - Agent understands documentation structure
  - Agent can compute content similarity
  - Target files exist and are readable
```

---

## Process

```yaml
process:
  1. Identify problem type
     - Read task inputs
     - Determine: gap, duplicate, or size issue

  2. For GAP (DOC_GAPS):
     a. Read @mind:gap marker and context
     b. Research in codebase (code, related docs)
     c. If researchable: generate content
     d. If needs human: add @mind:escalation
     e. Replace gap marker with content
     f. Validate content quality

  3. For DUPLICATE (DOC_DUPLICATION):
     a. Read both docs
     b. Determine canonical source
        - More complete? Use that
        - Same completeness? Use older
        - Same age? Use better location
     c. Find overlapping sections
     d. Replace duplicate with reference to canonical
     e. Verify no info lost

  4. For SIZE (LARGE_DOC_MODULE):
     a. Determine doc type
     b. If SYNC:
        - Identify entries older than 30 days
        - Move to SYNC_archive.md
        - Keep recent in original
     c. If other doc:
        - Find natural split points (## headers)
        - Create separate files for distinct sections
        - Add cross-references
     d. Verify all files under 200 lines

  5. Finalize
     - Remove problem markers
     - Update SYNC with resolution note
     - Validate per VALIDATION.md
```

---

## Tips

- For gaps: Check if related code has comments that answer the gap
- For gaps: Look at commit history for context
- For duplicates: Prefer docs/ location over root files
- For splits: SYNC files almost always archive, not split
- Always verify line counts after any operation
- Keep cross-references simple: relative paths

---

## Escalation Triggers

Escalate if:
- Gap requires domain knowledge not in codebase
- Gap involves external systems not documented
- Deduplication loses unique information from either source
- Split would break logical coherence of document

---

## Executes

```yaml
executes:
  procedure: PROCEDURE_fill_gaps
```

---

## Used By

```yaml
used_by:
  tasks:
    - TASK_fill_gap
    - TASK_dedupe_content
    - TASK_split_large_doc
```
