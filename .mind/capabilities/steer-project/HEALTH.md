# Steer Project — Health

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
IMPLEMENTATION:  ./IMPLEMENTATION.md
THIS:            HEALTH.md (you are here)
SYNC:            ./SYNC.md
```

---

## IMPLEMENTS

```yaml
implements:
  runtime: runtime/checks.py
  decorator: @check
```

---

## HEALTH INDICATORS

```yaml
health_indicators:
  - name: steering_due
    purpose: Ensure regular steering sessions
    priority: high
    rationale: Projects need periodic strategic review

  - name: stale_sync
    purpose: Keep SYNC files current
    priority: high
    rationale: Stale docs lead to wrong decisions

  - name: unprocessed_escalations
    purpose: Ensure blockers get attention
    priority: critical
    rationale: Ignored escalations mean stalled work

  - name: project_momentum
    purpose: Detect stalled projects
    priority: medium
    rationale: No activity = drifting
```

---

## INDICATOR: steering_due

### ALGORITHM / CHECK MECHANISM

```python
@check(
    id="steering_due",
    triggers=[
        triggers.cron.weekly(),
    ],
    on_problem="STEERING_DUE",
    task="TASK_steering_session",
)
def steering_due(ctx) -> dict:
    """
    Check if steering session is overdue.

    Returns DEGRADED if no session in past week.
    Returns HEALTHY if recent session exists.
    """
    last_session = get_last_steering_session()

    if last_session is None:
        return Signal.degraded(
            message="No steering session on record",
            suggested_action="Run initial steering session",
        )

    days_since = (now() - last_session.timestamp).days

    if days_since > 7:
        return Signal.degraded(
            days_since_session=days_since,
            message=f"Steering session overdue by {days_since - 7} days",
        )

    return Signal.healthy(
        last_session=last_session.timestamp.isoformat(),
        days_since=days_since,
    )
```

---

## INDICATOR: stale_sync

### ALGORITHM / CHECK MECHANISM

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
    """
    Find SYNC files that haven't been updated recently.

    Returns CRITICAL if any SYNC > 30 days old.
    Returns DEGRADED if any SYNC > 7 days old.
    Returns HEALTHY if all SYNC files fresh.
    """
    stale = []
    critical = []

    for sync_file in glob("**/SYNC*.md"):
        age_days = (now() - sync_file.stat().st_mtime).days

        if age_days > 30:
            critical.append({
                "file": str(sync_file),
                "age_days": age_days,
            })
        elif age_days > 7:
            stale.append({
                "file": str(sync_file),
                "age_days": age_days,
            })

    if critical:
        return Signal.critical(
            critical_files=critical,
            stale_files=stale,
            count=len(critical) + len(stale),
        )

    if stale:
        return Signal.degraded(
            stale_files=stale,
            count=len(stale),
        )

    return Signal.healthy()
```

---

## INDICATOR: unprocessed_escalations

### ALGORITHM / CHECK MECHANISM

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
    """
    Find @mind:escalation markers that need attention.

    Returns CRITICAL if any escalation > 7 days old.
    Returns DEGRADED if any escalation > 3 days old.
    Returns HEALTHY if no old escalations.
    """
    escalations = find_escalation_markers()
    critical = []
    aging = []

    for esc in escalations:
        if esc.status != "open":
            continue

        age_days = (now() - esc.created).days

        if age_days > 7:
            critical.append({
                "location": esc.location,
                "age_days": age_days,
                "content": esc.content[:100],
            })
        elif age_days > 3:
            aging.append({
                "location": esc.location,
                "age_days": age_days,
                "content": esc.content[:100],
            })

    if critical:
        return Signal.critical(
            critical_escalations=critical,
            aging_escalations=aging,
        )

    if aging:
        return Signal.degraded(
            aging_escalations=aging,
        )

    return Signal.healthy()
```

---

## INDICATOR: project_momentum

### ALGORITHM / CHECK MECHANISM

```python
@check(
    id="project_momentum",
    triggers=[
        triggers.cron.weekly(),
    ],
    on_problem="NO_ACTIVE_TASKS",
    task="TASK_steering_session",
)
def project_momentum(ctx) -> dict:
    """
    Check if project has active work.

    Returns DEGRADED if no commits/tasks in past week.
    Returns HEALTHY if active work ongoing.
    """
    recent_commits = get_commits(since=now() - timedelta(days=7))
    active_tasks = get_tasks(status="in_progress")

    if len(recent_commits) == 0 and len(active_tasks) == 0:
        return Signal.degraded(
            message="No activity in past week",
            suggested_action="Review project priorities",
        )

    return Signal.healthy(
        recent_commits=len(recent_commits),
        active_tasks=len(active_tasks),
    )
```
