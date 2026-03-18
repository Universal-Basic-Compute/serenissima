# Task: document_hook

```
NODE: narrative:task
STATUS: active
```

---

## Purpose

Document an undocumented hook so its behavior is understood.

---

## Resolves

| Problem | Severity |
|---------|----------|
| HOOK_UNDOC | medium |

---

## Inputs

```yaml
inputs:
  hook_path: string        # Path to hook file
  hook_name: string        # Hook identifier (pre-commit, post-deploy, etc.)
  problem: problem_id      # HOOK_UNDOC
```

---

## Outputs

```yaml
outputs:
  behaviors_doc: path      # Path to BEHAVIORS.md with hook doc
  sections_added: string[] # Documentation sections written
  validated: boolean       # Did doc pass validation
```

---

## Executor

```yaml
executor:
  type: agent
  agents: [voice]
```

---

## Uses

```yaml
uses:
  skill: SKILL_investigate
```

---

## Executes

```yaml
executes:
  procedure: PROCEDURE_investigate
```

---

## Validation

Complete when:
1. BEHAVIORS doc exists with hook section
2. All required fields present:
   - Trigger
   - Purpose
   - Side effects
   - Failure mode
3. Hook path linked in documentation
4. Health check no longer detects HOOK_UNDOC

---

## Instance (task_run)

Created by runtime when HEALTH.on_signal fires:

```yaml
node_type: narrative
type: task_run
nature: "concerns"

links:
  - nature: serves
    to: TASK_document_hook
  - nature: concerns
    to: "{hook_path}"
  - nature: resolves
    to: HOOK_UNDOC
```
