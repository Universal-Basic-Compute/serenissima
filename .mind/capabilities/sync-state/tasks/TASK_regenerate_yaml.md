# Task: regenerate_yaml

```
NODE: narrative:task
STATUS: active
```

---

## Purpose

Regenerate modules.yaml from file system to fix drift.

---

## Resolves

| Problem | Severity |
|---------|----------|
| YAML_DRIFT | warning |

---

## Inputs

```yaml
inputs:
  missing_from_yaml: string[]  # Modules on disk but not in YAML
  extra_in_yaml: string[]      # Entries in YAML but not on disk
  project_root: path           # Project root directory
```

---

## Outputs

```yaml
outputs:
  regenerated: boolean         # Was YAML regenerated
  module_count: number         # Number of modules now in YAML
  yaml_path: path              # Path to modules.yaml
```

---

## Executor

```yaml
executor:
  type: automated
  script: regenerate_modules_yaml
  reason: Mechanical task - scan dirs, generate YAML, no judgment needed
```

---

## Uses

```yaml
uses:
  skill: null  # No skill needed - fully automated
```

---

## Executes

```yaml
executes:
  script: |
    1. Scan docs/ for module directories
    2. For each dir with SYNC.md or PATTERNS.md:
       - Extract module name
       - Extract status from SYNC if present
    3. Generate modules.yaml structure
    4. Write to .mind/modules.yaml
```

---

## Validation

Complete when:
1. modules.yaml matches docs/ directory structure
2. No missing entries
3. No extra entries
4. Next health check passes (no drift)

---

## Instance (task_run)

Created by runtime when HEALTH.on_signal fires:

```yaml
node_type: narrative
type: task_run
nature: "importantly concerns"

links:
  - nature: serves
    to: TASK_regenerate_yaml
  - nature: resolves
    to: YAML_DRIFT
```
