# Flag Errors — Health

```
STATUS: CANONICAL
CAPABILITY: flag-errors
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

This HEALTH file is a **spec**. The actual code lives in runtime:

```yaml
implements:
  runtime: runtime/checks.py
  decorator: @check
```

---

## HEALTH INDICATORS

```yaml
health_indicators:
  - name: new_errors
    purpose: Detect new error fingerprints in logs
    priority: high
    rationale: Core capability - finding errors users don't know about

  - name: error_spike
    purpose: Detect sudden increase in error rate
    priority: high
    rationale: Indicates regression or incident

  - name: watch_coverage
    purpose: Ensure all log files are being monitored
    priority: medium
    rationale: Gaps in coverage mean missed errors

  - name: stale_errors
    purpose: Find errors that have been open too long
    priority: low
    rationale: Prevents error backlog from growing
```

---

## CHECKER INDEX

```yaml
checkers:
  - name: new_errors
    purpose: Detect new error fingerprints
    status: active
    priority: high

  - name: error_spike
    purpose: Detect rate increases
    status: active
    priority: high

  - name: watch_coverage
    purpose: Check all logs monitored
    status: active
    priority: medium

  - name: stale_errors
    purpose: Find old unresolved errors
    status: active
    priority: low
```

---

## INDICATOR: new_errors

### VALUE TO CLIENTS & VALIDATION MAPPING

```yaml
value_and_validation:
  indicator: new_errors
  client_value: Users learn about errors before customers report them
  validation:
    - validation_id: V2
      criteria: Every error creates or updates a task
```

### ALGORITHM / CHECK MECHANISM

```python
@check(
    id="new_errors",
    triggers=[
        triggers.file.on_modify("logs/**/*.log"),
        triggers.cron.every(minutes=5),
    ],
    on_problem="NEW_ERROR",
    task="TASK_investigate_error",
)
def new_errors(ctx) -> dict:
    """
    Detect new errors in watched log files.

    Returns CRITICAL if new error found.
    Returns HEALTHY if no new errors.
    """
    watch_config = load_watch_config()
    new_fingerprints = []

    for watch in watch_config.watches:
        for log_path in glob(watch.paths):
            errors = scan_for_errors(log_path, watch)
            for error in errors:
                if not has_open_task(error.fingerprint):
                    new_fingerprints.append({
                        "fingerprint": error.fingerprint,
                        "message": error.message,
                        "log_path": str(log_path),
                    })

    if not new_fingerprints:
        return Signal.healthy()

    return Signal.critical(
        new_errors=new_fingerprints,
        count=len(new_fingerprints),
    )
```

### SIGNALS

```yaml
signals:
  healthy: No new error fingerprints detected
  critical: New error fingerprint(s) found - task created
```

---

## INDICATOR: error_spike

### VALUE TO CLIENTS & VALIDATION MAPPING

```yaml
value_and_validation:
  indicator: error_spike
  client_value: Rapid detection of incidents or regressions
  validation:
    - validation_id: V5
      criteria: Spike triggers at 10x baseline
```

### ALGORITHM / CHECK MECHANISM

```python
@check(
    id="error_spike",
    triggers=[
        triggers.cron.every(minutes=15),
    ],
    on_problem="ERROR_SPIKE",
    task=None,  # Escalates existing task
)
def error_spike(ctx) -> dict:
    """
    Detect error rate spikes.

    Returns CRITICAL if any fingerprint spiking.
    Returns HEALTHY if rates normal.
    """
    spikes = []

    for fingerprint in get_active_fingerprints():
        recent_rate = get_hourly_rate(fingerprint, hours=1)
        baseline_rate = get_hourly_rate(fingerprint, hours=168) / 168

        if baseline_rate < 1:
            baseline_rate = 1

        if recent_rate > baseline_rate * 10:
            spikes.append({
                "fingerprint": fingerprint,
                "recent_rate": recent_rate,
                "baseline_rate": baseline_rate,
                "ratio": recent_rate / baseline_rate,
            })

    if not spikes:
        return Signal.healthy()

    return Signal.critical(
        spikes=spikes,
        count=len(spikes),
    )
```

### SIGNALS

```yaml
signals:
  healthy: All error rates within normal range
  critical: Error rate spike detected - escalating
```

---

## INDICATOR: watch_coverage

### ALGORITHM / CHECK MECHANISM

```python
@check(
    id="watch_coverage",
    triggers=[
        triggers.cron.daily(),
        triggers.file.on_create("**/*.log"),
    ],
    on_problem="UNMONITORED_LOGS",
    task="TASK_configure_watch",
)
def watch_coverage(ctx) -> dict:
    """
    Check all log files are being monitored.

    Returns DEGRADED if unmonitored logs found.
    Returns HEALTHY if all logs covered.
    """
    watch_config = load_watch_config()
    watched_patterns = [w.paths for w in watch_config.watches]
    watched_patterns = flatten(watched_patterns)

    all_logs = glob("**/*.log")
    unmonitored = []

    for log in all_logs:
        if not any(matches_pattern(log, p) for p in watched_patterns):
            unmonitored.append(str(log))

    if not unmonitored:
        return Signal.healthy()

    return Signal.degraded(
        unmonitored_logs=unmonitored,
        count=len(unmonitored),
    )
```

---

## INDICATOR: stale_errors

### ALGORITHM / CHECK MECHANISM

```python
@check(
    id="stale_errors",
    triggers=[
        triggers.cron.daily(),
    ],
    on_problem="STALE_ERROR_TASK",
    task=None,  # Advisory only
)
def stale_errors(ctx) -> dict:
    """
    Find error tasks open longer than threshold.

    Returns DEGRADED if stale tasks found.
    Returns HEALTHY if all tasks being addressed.
    """
    stale_threshold_days = 7
    stale_tasks = []

    for task in get_error_tasks(status="open"):
        age_days = (now() - task.created_at).days
        if age_days > stale_threshold_days:
            stale_tasks.append({
                "fingerprint": task.fingerprint,
                "age_days": age_days,
                "occurrence_count": task.occurrence_count,
            })

    if not stale_tasks:
        return Signal.healthy()

    return Signal.degraded(
        stale_tasks=stale_tasks,
        count=len(stale_tasks),
    )
```

---

## HOW TO RUN

```bash
# Run all error health checks
mind capability check flag-errors

# Run specific checker
mind capability check flag-errors --checker new_errors

# Force scan all logs now
mind errors scan --force
```
