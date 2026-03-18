# Skill: refactor

```
NODE: narrative:skill
STATUS: active
```

---

## Purpose

Agent skill for code quality refactoring — splitting monoliths, compressing prompts, simplifying SQL, and general code improvements.

---

## Gates

Prerequisites before using this skill:

```yaml
gates:
  - Agent can read and write code
  - Target file or module exists
  - Tests exist and currently pass
  - Problem type identified (MONOLITH, LONG_PROMPT, LONG_SQL, etc.)
  - Validation criteria understood
```

---

## Process

### For MONOLITH (Split Large File)

```yaml
process:
  1. Read and understand the entire file
     - Identify distinct responsibilities
     - Note class/function groupings
     - Map internal dependencies

  2. Plan the split
     - Group related code together
     - Identify clean cut points
     - Design new file structure
     - Name new files appropriately

  3. Execute split incrementally
     - Extract one responsibility at a time
     - Create new file with imports
     - Update original file imports
     - Run tests after each extraction

  4. Update all callers
     - Find all imports of original file
     - Update import statements
     - Verify no ImportError

  5. Validate
     - Each new file < 500 lines
     - All tests pass
     - No circular imports
```

### For LONG_PROMPT (Compress Prompt)

```yaml
process:
  1. Understand the prompt's purpose
     - What is it trying to achieve?
     - What are the essential instructions?
     - What are the examples?

  2. Identify reduction opportunities
     - Redundant explanations
     - Verbose phrasing
     - Inline content that could be references
     - Repeated instructions

  3. Apply compression
     - Use concise language
     - Convert prose to bullets
     - Extract examples to files
     - Use file references

  4. Test effectiveness
     - Run prompt in test scenario
     - Verify it still achieves purpose
     - Compare outputs before/after

  5. Validate
     - Under 4000 characters
     - Still effective
```

### For LONG_SQL (Refactor Query)

```yaml
process:
  1. Understand the query
     - What data is it retrieving?
     - What transformations are applied?
     - What are the joins doing?

  2. Identify complexity sources
     - Repeated subqueries
     - Deep nesting
     - Many joins
     - Complex conditions

  3. Refactor
     - Extract subqueries to CTEs
     - Create views for reusable parts
     - Split into multiple queries if needed
     - Add intermediate temp tables

  4. Verify correctness
     - Run both queries
     - Compare results exactly
     - Check edge cases

  5. Validate
     - Under thresholds
     - Same results
     - Document in ALGORITHM
```

---

## Tips

- **Test frequently** — Run tests after every change
- **Small steps** — One extraction/change at a time
- **Preserve behavior** — Refactoring changes structure, not behavior
- **Document decisions** — Note why you split where you did
- **Update SYNC** — Record what was done and why

---

## Executes

```yaml
executes:
  procedure: PROCEDURE_refactor
```

---

## Used By

```yaml
used_by:
  tasks:
    - TASK_split_monolith
    - TASK_extract_constants
    - TASK_extract_secrets
    - TASK_compress_prompt
    - TASK_refactor_sql
    - TASK_fix_naming
```

---

## Anti-Patterns

Avoid these common mistakes:

- **Big bang refactor** — Doing everything at once. Instead: incremental changes.
- **Skipping tests** — Assuming changes are safe. Instead: test after every change.
- **Changing behavior** — Adding features while refactoring. Instead: behavior preserved.
- **Breaking imports** — Forgetting to update callers. Instead: update all references.
- **Ignoring circular imports** — Creating dependency cycles. Instead: check with tools.
