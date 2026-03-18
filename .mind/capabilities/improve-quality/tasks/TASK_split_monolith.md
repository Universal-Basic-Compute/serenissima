# Task: split_monolith

```
NODE: narrative:task
STATUS: active
```

---

## Purpose

Split a code file exceeding 500 lines into smaller, focused modules.

---

## Resolves

| Problem | Severity |
|---------|----------|
| MONOLITH | high |

---

## Inputs

```yaml
inputs:
  target: file_path       # File exceeding 500 lines
  line_count: int         # Current line count
  problem: problem_id     # MONOLITH
```

---

## Outputs

```yaml
outputs:
  new_files: path[]       # Paths to new split files
  original_deleted: bool  # Was original file deleted
  imports_updated: bool   # Were all imports updated
  tests_pass: bool        # Do tests still pass
```

---

## Executor

```yaml
executor:
  type: agent
  agents: [architect, steward]
```

---

## Uses

```yaml
uses:
  skill: SKILL_refactor
```

---

## Executes

```yaml
executes:
  procedure: PROCEDURE_refactor
```

---

## Process

1. **Analyze** — Identify distinct responsibilities in the file
2. **Plan** — Design split points and new file structure
3. **Extract** — Move code to new files one responsibility at a time
4. **Update imports** — Fix all import statements across codebase
5. **Test** — Verify all tests pass after each extraction
6. **Validate** — Confirm each new file < 500 lines

---

## Validation

Complete when:
1. Original file < 500 lines OR deleted
2. Each new file < 500 lines
3. All imports resolve (no ImportError)
4. No circular imports created
5. All tests pass
6. Health check no longer detects MONOLITH

---

## Instance (task_run)

Created by runtime when HEALTH.on_signal fires:

```yaml
node_type: narrative
type: task_run
nature: "importantly concerns"

links:
  - nature: serves
    to: TASK_split_monolith
  - nature: concerns
    to: "{target}"
  - nature: resolves
    to: MONOLITH
```
