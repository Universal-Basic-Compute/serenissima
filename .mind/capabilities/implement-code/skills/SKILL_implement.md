# Skill: implement

```
NODE: narrative:skill
STATUS: active
```

---

## Purpose

Agent skill for implementing code from specifications and completing partial implementations.

---

## Gates

Prerequisites before using this skill:

```yaml
gates:
  - Agent can read source code
  - Agent can write code in target language
  - Agent can run tests
  - ALGORITHM.md or function docstring available (for stubs)
  - Target file exists and is writable
```

---

## Process

### For STUB_IMPL

```yaml
process:
  1. Read specification
     - Check ALGORITHM.md for function spec
     - If no spec, use function docstring
     - If no docstring, use function name and signature to infer

  2. Understand context
     - Read surrounding code
     - Understand data types
     - Check how function is called

  3. Implement
     - Write function body
     - Follow code style of file
     - Handle edge cases mentioned in spec

  4. Test
     - Run existing tests
     - If test exists for function, verify it passes
     - If no test, consider adding one

  5. Validate
     - Verify no stub patterns remain
     - Check implementation matches spec
```

### For INCOMPLETE_IMPL

```yaml
process:
  1. Read TODO context
     - Read the full TODO/FIXME comment
     - Read surrounding code for context
     - Understand what's incomplete

  2. Analyze gap
     - What functionality is missing?
     - What edge cases are unhandled?
     - What's the expected behavior?

  3. Implement
     - Complete the missing functionality
     - Handle the edge cases
     - Follow existing code patterns

  4. Remove marker
     - Delete the TODO/FIXME comment
     - Or convert to regular comment if still relevant

  5. Test
     - Run tests to verify no regressions
     - Test the newly implemented case
```

### For UNDOC_IMPL

```yaml
process:
  1. Read implementation
     - Read all files listed in IMPLEMENTATION.md
     - Understand the code structure
     - Identify key functions and flows

  2. Extract algorithms
     - Find non-trivial logic
     - Identify decision trees
     - Note data transformations

  3. Write ALGORITHM.md
     - Use template from templates/docs/ALGORITHM_TEMPLATE.md
     - Document each algorithm with pseudocode
     - Explain decision points
     - Add complexity notes if relevant

  4. Link documents
     - Add proper CHAIN section
     - Reference IMPLEMENTATION.md
     - Update SYNC
```

### For STALE_IMPL

```yaml
process:
  1. Get code diff
     - Use git log to find recent changes
     - Identify what changed (functions, parameters, behavior)

  2. Compare to docs
     - Read current doc content
     - Identify what's now inaccurate
     - Note what's missing

  3. Update docs
     - Modify descriptions to match current code
     - Add new functions/parameters
     - Remove references to deleted code

  4. Update metadata
     - Set LAST_UPDATED to today
     - Add change note to SYNC
```

---

## Tips

- Always read the full function/method before implementing
- Check if tests exist that define expected behavior
- Follow the code style of the surrounding code
- When unsure, escalate rather than guess
- Update SYNC after completing work

---

## Executes

```yaml
executes:
  procedure: PROCEDURE_implement
```

---

## Used By

```yaml
used_by:
  tasks:
    - TASK_implement_stub
    - TASK_complete_impl
    - TASK_document_impl
    - TASK_update_impl_docs
```
