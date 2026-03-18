# Task: fix_legacy_marker

```
NODE: narrative:task
STATUS: active
```

---

## Purpose

Fix or properly track a legacy marker (TODO, FIXME, HACK, XXX).

---

## Resolves

| Problem | Severity |
|---------|----------|
| LEGACY_MARKER | low |

---

## Inputs

```yaml
inputs:
  target: file_path:line     # Location of marker
  marker_type: string        # TODO | FIXME | HACK | XXX
  context: string            # Marker message/context
  age_days: number           # How long it's been stale
  problem: problem_id        # LEGACY_MARKER
```

---

## Outputs

```yaml
outputs:
  action: enum               # fixed | converted | deleted
  task_created: task_id      # If converted, new task ID
  fix_applied: boolean       # If fixed, was code changed
  marker_removed: boolean    # Was marker removed
```

---

## Executor

```yaml
executor:
  type: agent
  agents: [fixer, groundwork]
```

---

## Uses

```yaml
uses:
  skill: SKILL_solve_markers
```

---

## Executes

```yaml
executes:
  procedure: PROCEDURE_solve_markers
  params:
    marker_type: LEGACY_MARKER
```

---

## Validation

Complete when:
1. One of: fixed, converted to task, or deleted as obsolete
2. If fixed: code change verified
3. If converted: task exists with proper description
4. Original marker removed from file
5. Health check passes (problem resolved)

---

## Process

```yaml
process:
  1. Read marker context and surrounding code
  2. Determine if issue is still relevant:
     - If obsolete: delete marker, done
  3. If relevant, assess quick-fix possibility:
     - If < 30 min effort: fix it now
     - If larger: convert to tracked task
  4. If fixing now:
     - Apply fix
     - Remove marker
     - Test if applicable
  5. If converting:
     - Create task with clear description
     - Replace marker with task reference (optional)
     - Or remove marker entirely
  6. Update SYNC
```

---

## Instance (task_run)

Created by runtime when HEALTH.on_signal fires:

```yaml
node_type: narrative
type: task_run
nature: "concerns"

links:
  - nature: serves
    to: TASK_fix_legacy_marker
  - nature: concerns
    to: "{target}"
  - nature: resolves
    to: LEGACY_MARKER
```
