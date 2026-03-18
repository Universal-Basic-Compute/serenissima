# Task: document_impl

```
NODE: narrative:task
STATUS: active
```

---

## Purpose

Create ALGORITHM.md for modules that have IMPLEMENTATION.md but no algorithm documentation.

---

## Resolves

| Problem | Severity |
|---------|----------|
| UNDOC_IMPL | high |

---

## Inputs

```yaml
inputs:
  target: module_id      # Module needing ALGORITHM.md
  impl_path: doc_path    # Path to existing IMPLEMENTATION.md
  problem: problem_id    # UNDOC_IMPL
```

---

## Outputs

```yaml
outputs:
  algo_path: path        # Path to created ALGORITHM.md
  algorithms_documented: int  # Count of algorithms described
  validated: boolean     # Did doc pass validation
```

---

## Executor

```yaml
executor:
  type: agent
  agents: [voice, witness]
```

---

## Uses

```yaml
uses:
  skill: SKILL_implement
```

---

## Executes

```yaml
executes:
  procedure: PROCEDURE_implement
```

---

## Validation

Complete when:
1. docs/{module}/ALGORITHM.md exists
2. File has STATUS: CANONICAL or DESIGNING (not STUB)
3. No placeholder markers remain ({placeholder}, {Module})
4. Contains at least one algorithm description with pseudocode
5. CHAIN section links correctly to IMPLEMENTATION.md
6. Content is > 500 characters
7. Health check no longer detects UNDOC_IMPL for this module

---

## Instance (task_run)

Created by runtime when HEALTH.on_signal fires:

```yaml
node_type: narrative
type: task_run
nature: "importantly concerns"

links:
  - nature: serves
    to: TASK_document_impl
  - nature: concerns
    to: "{target}"
  - nature: resolves
    to: UNDOC_IMPL
```
