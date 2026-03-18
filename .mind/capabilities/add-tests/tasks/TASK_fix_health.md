# Task: fix_health

```
NODE: narrative:task
STATUS: active
```

---

## Purpose

Investigate and fix a failing health check.

---

## Resolves

| Problem | Severity |
|---------|----------|
| HEALTH_FAILED | critical |

---

## Inputs

```yaml
inputs:
  target: check_id          # Health check that failed
  error: string             # Error message
  details: object           # Additional failure details
  problem: problem_id       # HEALTH_FAILED
```

---

## Outputs

```yaml
outputs:
  root_cause: string        # Identified cause
  fix_applied: string       # Description of fix
  validated: boolean        # Health check now passes
```

---

## Executor

```yaml
executor:
  type: agent
  agents: [fixer, witness]
```

---

## Uses

```yaml
uses:
  skill: SKILL_investigate_failure
```

---

## Validation

Complete when:
1. Root cause identified and documented
2. Fix implemented
3. Health check returns healthy
4. No regressions in other checks

---

## Process

```yaml
process:
  1. Read health check error details
  2. Identify which signal failed (degraded/critical)
  3. Trace to root cause:
     - Read relevant logs
     - Check recent changes
     - Examine dependencies
  4. Implement fix
  5. Re-run health check
  6. Verify healthy status
  7. Document in SYNC
```

---

## Escalation

If root cause cannot be identified:
- Create @mind:escalation marker
- Document investigation findings
- Propose potential causes
- Request human input

---

## Instance (task_run)

Created by runtime when HEALTH.on_signal fires:

```yaml
node_type: narrative
type: task_run
nature: "urgently concerns"

links:
  - nature: serves
    to: TASK_fix_health
  - nature: concerns
    to: "{target}"
  - nature: resolves
    to: HEALTH_FAILED
```
