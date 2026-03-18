# Task: split_large_doc

```
NODE: narrative:task
STATUS: active
```

---

## Purpose

Split oversized documentation files into smaller, focused pieces. For SYNC files, archive old entries.

---

## Resolves

| Problem | Severity |
|---------|----------|
| LARGE_DOC_MODULE | low |

---

## Inputs

```yaml
inputs:
  target: doc_path        # Path to large doc
  lines: int              # Current line count
  excess: int             # Lines over 200
  problem: problem_id     # LARGE_DOC_MODULE
```

---

## Outputs

```yaml
outputs:
  original_trimmed: boolean  # Original now under 200 lines
  split_files: path[]        # New files created (if split)
  archive_path: path         # Archive file (if SYNC)
  archived_entries: int      # Count of archived entries (if SYNC)
  content_preserved: boolean # No content lost
```

---

## Executor

```yaml
executor:
  type: agent
  agents: [steward, voice]
```

---

## Uses

```yaml
uses:
  skill: SKILL_fill_gaps
```

---

## Executes

```yaml
executes:
  procedure: PROCEDURE_fill_gaps
  mode: split
```

---

## Validation

Complete when:
1. Original doc now under 200 lines
2. All split files under 200 lines
3. No content lost (archived or split)
4. Cross-references added between split files
5. Archive file created (if SYNC split)
6. SYNC updated with split note
7. Health check passes (problem resolved)

---

## Instance (task_run)

Created by runtime when HEALTH.on_signal fires:

```yaml
node_type: narrative
type: task_run
nature: "optionally concerns"

links:
  - nature: serves
    to: TASK_split_large_doc
  - nature: concerns
    to: "{target}"
  - nature: resolves
    to: LARGE_DOC_MODULE
```
