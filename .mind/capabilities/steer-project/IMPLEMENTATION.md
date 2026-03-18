# Steer Project — Implementation

```
STATUS: CANONICAL
CAPABILITY: steer-project
```

---

## CHAIN

```
OBJECTIVES:      ./OBJECTIVES.md
PATTERNS:        ./PATTERNS.md
VOCABULARY:      ./VOCABULARY.md
BEHAVIORS:       ./BEHAVIORS.md
ALGORITHM:       ./ALGORITHM.md
VALIDATION:      ./VALIDATION.md
THIS:            IMPLEMENTATION.md (you are here)
HEALTH:          ./HEALTH.md
SYNC:            ./SYNC.md
```

---

## FILE STRUCTURE

```
capabilities/steer-project/
├── OBJECTIVES.md
├── PATTERNS.md
├── VOCABULARY.md
├── BEHAVIORS.md
├── ALGORITHM.md
├── VALIDATION.md
├── IMPLEMENTATION.md      (this file)
├── HEALTH.md
├── SYNC.md
├── tasks/
│   ├── TASK_steering_session.md
│   ├── TASK_update_sync.md
│   ├── TASK_process_escalation.md
│   └── TASK_resolve_blocker.md
├── skills/
│   └── SKILL_strategic_assessment.md
├── procedures/
│   └── PROCEDURE_steering_session.yaml
└── runtime/
    ├── __init__.py
    └── checks.py
```

---

## RUNTIME COMPONENTS

### Session Trigger

```python
@check(
    id="steering_due",
    triggers=[
        triggers.cron.weekly(),  # Monday 9am
    ],
    on_problem="STEERING_DUE",
    task="TASK_steering_session",
)
def steering_due(ctx) -> dict:
    """Check if steering session is due."""
    ...
```

### SYNC Freshness

```python
@check(
    id="stale_sync",
    triggers=[
        triggers.cron.daily(),
    ],
    on_problem="STALE_SYNC",
    task="TASK_update_sync",
)
def stale_sync(ctx) -> dict:
    """Find SYNC files that need updating."""
    ...
```

### Escalation Monitor

```python
@check(
    id="unprocessed_escalations",
    triggers=[
        triggers.cron.daily(),
        triggers.git.post_commit(),
    ],
    on_problem="UNPROCESSED_ESCALATION",
    task="TASK_process_escalation",
)
def unprocessed_escalations(ctx) -> dict:
    """Find escalation markers needing attention."""
    ...
```

---

## INTEGRATION POINTS

### SYNC Files

```yaml
reads:
  - .mind/state/SYNC_Project_State.md
  - **/SYNC*.md
writes:
  - .mind/state/SYNC_Project_State.md
```

### Markers

```yaml
scans_for:
  - "@mind:escalation"
  - "@mind:proposition"
  - "@mind:todo"
```

---

## CLI COMMANDS

```bash
# Run steering session manually
mind steer

# Show project health
mind steer status

# Show pending escalations
mind steer escalations

# Show stale SYNC files
mind steer stale

# Process specific escalation
mind steer process <location>
```

---

## MCP TOOLS

```yaml
steering_run:
  params: {}
  returns: steering_session summary

steering_status:
  params: {}
  returns: project health overview

escalation_list:
  params:
    status: open|resolved|all
  returns: list of escalation markers

sync_status:
  params: {}
  returns: freshness report for all SYNC files
```
