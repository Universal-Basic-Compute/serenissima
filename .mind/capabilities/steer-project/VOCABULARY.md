# Steer Project — Vocabulary

```
STATUS: CANONICAL
CAPABILITY: steer-project
```

---

## CHAIN

```
OBJECTIVES:      ./OBJECTIVES.md
PATTERNS:        ./PATTERNS.md
THIS:            VOCABULARY.md (you are here)
BEHAVIORS:       ./BEHAVIORS.md
```

---

## TERMS

### steering_session

A periodic review and planning session.

```yaml
term: steering_session
fields:
  id: string
  timestamp: datetime
  scope: project|module
  findings: finding[]
  actions_taken: action[]
  tasks_created: task_id[]
```

### finding

An observation from assessment.

```yaml
term: finding
fields:
  type: blocker|drift|staleness|progress|risk
  severity: critical|high|medium|low
  description: string
  evidence: string[]
  suggested_action: string
```

### blocker

Something preventing progress.

```yaml
term: blocker
fields:
  id: string
  description: string
  affects: module[]|task_id[]
  type: technical|decision|external|resource
  resolution_path: string
```

### escalation_marker

A @mind:escalation in code or docs.

```yaml
term: escalation_marker
fields:
  location: path:line
  content: string
  created: datetime
  status: open|processing|resolved
```

---

## PROBLEMS

### STALE_SYNC

SYNC file hasn't been updated in threshold period.

```yaml
problem: STALE_SYNC
severity: medium
inputs:
  sync_file: path
  days_since_update: int
resolves_with: TASK_update_sync
```

### UNPROCESSED_ESCALATION

Escalation marker exists without resolution.

```yaml
problem: UNPROCESSED_ESCALATION
severity: high
inputs:
  location: path:line
  age_days: int
resolves_with: TASK_process_escalation
```

### NO_ACTIVE_TASKS

No tasks in progress for a module.

```yaml
problem: NO_ACTIVE_TASKS
severity: medium
inputs:
  module: string
resolves_with: TASK_steer_module
```

### PROJECT_BLOCKED

Critical blocker affecting multiple modules.

```yaml
problem: PROJECT_BLOCKED
severity: critical
inputs:
  blocker: blocker
resolves_with: TASK_resolve_blocker
```

---

## STATES

### project_health

```yaml
states:
  - healthy: Active work, no blockers, docs current
  - degraded: Minor issues (stale docs, some blockers)
  - blocked: Critical blocker stopping progress
  - stalled: No active work for extended period
```
