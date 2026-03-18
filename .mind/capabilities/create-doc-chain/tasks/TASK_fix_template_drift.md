# Task: fix_template_drift

```
NODE: narrative:task
STATUS: active
```

---

## Purpose

Fix documentation that has drifted from canonical template structure.

---

## Resolves

| Problem | Severity |
|---------|----------|
| TEMPLATE_DRIFT | low |

---

## Inputs

```yaml
inputs:
  target: doc_path           # Path to drifted doc
  missing_sections: string[] # List of missing section headers
  problem: problem_id        # TEMPLATE_DRIFT
```

---

## Outputs

```yaml
outputs:
  doc_fixed: path       # Path to fixed doc
  sections_added: int   # Count of sections added
  validated: boolean    # Did doc pass validation
```

---

## Executor

```yaml
executor:
  type: agent
  agents: [voice, steward]
```

---

## Uses

```yaml
uses:
  skill: SKILL_fix_drift
```

---

## Executes

```yaml
executes:
  procedure: PROCEDURE_fix_drift
```

---

## Validation

Complete when:
1. All `missing_sections` now exist in doc
2. Section order matches template
3. No content was lost during fix
4. Health check passes (problem resolved)

---

## Instance (task_run)

Created by runtime when HEALTH.on_signal fires:

```yaml
node_type: narrative
type: task_run
nature: "concerns"

links:
  - nature: serves
    to: TASK_fix_template_drift
  - nature: concerns
    to: "{target}"
  - nature: resolves
    to: TEMPLATE_DRIFT
```
