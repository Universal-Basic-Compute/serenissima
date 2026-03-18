# Task: create_procedures

```
NODE: narrative:task
STATUS: active
```

---

## Purpose

Install base procedure templates when .mind/procedures/ is empty or missing.

---

## Resolves

| Problem | Severity |
|---------|----------|
| MEMBRANE_NO_PROTOCOLS | critical |

---

## Inputs

```yaml
inputs:
  target: path           # Path to .mind/procedures/ directory
  mind_dir: path         # Path to .mind/ root
```

---

## Outputs

```yaml
outputs:
  procedures_created: path[]  # Paths to created procedure files
  count: int                  # Number of procedures installed
  validated: boolean          # Did all procedures pass validation
```

---

## Executor

```yaml
executor:
  type: agent
  agents: [groundwork, fixer]
```

---

## Uses

```yaml
uses:
  skill: SKILL_fix_procedure
```

---

## Executes

```yaml
executes:
  procedure: PROCEDURE_fix_membrane
```

---

## Steps

1. Check if .mind/procedures/ exists, create if not
2. Locate procedure templates in mind-platform/templates/procedures/
3. Copy each template to .mind/procedures/
4. Validate each copied file parses correctly
5. Verify at least one procedure now exists

---

## Validation

Complete when:
1. .mind/procedures/ directory exists
2. At least one .yaml file present
3. All files parse without error
4. Health check passes (MEMBRANE_NO_PROTOCOLS resolved)

---

## Instance (task_run)

Created by runtime when HEALTH.on_signal fires:

```yaml
node_type: narrative
type: task_run
nature: "urgently concerns"

links:
  - nature: serves
    to: TASK_create_procedures
  - nature: concerns
    to: "{target}"
  - nature: resolves
    to: MEMBRANE_NO_PROTOCOLS
```
