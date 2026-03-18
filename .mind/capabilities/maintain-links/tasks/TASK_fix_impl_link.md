# Task: fix_impl_link

```
NODE: narrative:task
STATUS: active
```

---

## Purpose

Fix IMPL: markers in documentation that point to non-existent files.

---

## Resolves

| Problem | Severity |
|---------|----------|
| BROKEN_IMPL_LINK | high |

---

## Inputs

```yaml
inputs:
  target: doc_path          # Doc with broken link(s)
  broken_markers: string[]  # List of broken IMPL: values
  problem: problem_id       # BROKEN_IMPL_LINK
```

---

## Outputs

```yaml
outputs:
  fixed: boolean            # Were all links fixed
  updates: object[]         # { old_path, new_path, action }
  remaining: string[]       # Markers that couldn't be fixed
```

---

## Executor

```yaml
executor:
  type: agent
  agents: [voice, fixer]
```

---

## Uses

```yaml
uses:
  skill: SKILL_fix_links
```

---

## Executes

```yaml
executes:
  procedure: PROCEDURE_fix_links
```

---

## Resolution Strategies

### Strategy 1: Path Update (File Moved)

1. Extract filename from broken IMPL: path
2. Search codebase for file with same name
3. If single match: update IMPL: to new path
4. Update code file's DOCS: marker if present
5. Action: `updated`

### Strategy 2: Name Update (File Renamed)

1. Extract directory from broken IMPL: path
2. List files in that directory
3. Find file with similar name or purpose
4. Update IMPL: to new filename
5. Action: `renamed`

### Strategy 3: Remove Marker (Code Deleted)

1. Search confirms file doesn't exist anywhere
2. Code was intentionally deleted
3. Remove IMPL: marker from doc
4. Flag doc for potential orphan check
5. Action: `removed`

### Strategy 4: Escalate (Ambiguous)

1. Multiple files match filename
2. Cannot determine correct target
3. Create task_run for human decision
4. Action: `escalated`

---

## Validation

Complete when:
1. All broken IMPL: markers in `broken_markers` are fixed
2. Updated paths point to existing files
3. No new broken links created
4. Health check no longer detects BROKEN_IMPL_LINK for this doc

---

## Instance (task_run)

Created by runtime when HEALTH.on_signal fires:

```yaml
node_type: narrative
type: task_run
nature: "importantly concerns"

links:
  - nature: serves
    to: TASK_fix_impl_link
  - nature: concerns
    to: "{target}"
  - nature: resolves
    to: BROKEN_IMPL_LINK
```
