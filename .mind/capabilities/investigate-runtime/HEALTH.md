# Investigate Runtime — Health

```
STATUS: CANONICAL
CAPABILITY: investigate-runtime
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

## PURPOSE

Runtime monitoring for errors and undocumented hooks. Detects problems, triggers task creation.

---

## FLOWS

```yaml
flows:
  - name: log_stream
    trigger: ERROR entry in log
    frequency: On occurrence
    risk: High volume during incidents

  - name: hourly_scan
    trigger: cron
    frequency: hourly
    risk: None — catches missed events

  - name: init_scan
    trigger: mind init
    frequency: once per init
    risk: Low — read-only scan

  - name: hook_watch
    trigger: Hook file created/modified
    frequency: On change
    risk: Low — rare events
```

---

## INDICATORS

### H1: Log Error Detection

```yaml
name: Log Error Detection
priority: high

value: "Count of unresolved ERROR entries in recent logs"

representation:
  type: count
  range: 0-inf
  display: "{count} errors"

docks:
  - point: log_stream.on_error
    type: stream
    payload: { log_path, line, message, stack_trace, timestamp }

  - point: cron.hourly_health
    type: schedule
    payload: { timestamp }

mechanism: |
  1. Scan .mind/logs/*.log for ERROR/CRITICAL entries
  2. Filter to entries within last 24h
  3. Deduplicate by error signature (message + location)
  4. Count unresolved (no diagnosis linked)

signals:
  healthy: count == 0
  degraded: count > 0 and count < 5
  critical: count >= 5

throttling:
  max_tasks_per_error: 1
  cooldown: 1h
  dedupe: by error_signature

implements: runtime/checks.py:log_error_detection

on_signal:
  degraded:
    action: create_task_run
    params:
      template: TASK_investigate_error
      target: "{log_path}:{line}"
      error_message: "{message}"
      stack_trace: "{stack_trace}"
      nature: "importantly concerns"
      problem: LOG_ERROR

  critical:
    action: create_task_run
    params:
      template: TASK_investigate_error
      target: "{log_path}:{line}"
      error_message: "{message}"
      stack_trace: "{stack_trace}"
      nature: "urgently concerns"
      problem: LOG_ERROR
```

### H2: Hook Documentation

```yaml
name: Hook Documentation
priority: medium

value: "Count of undocumented hooks"

representation:
  type: count
  range: 0-inf
  display: "{count} undoc hooks"

docks:
  - point: init_scan.after_project_discovery
    type: event
    payload: { project_root }

  - point: file_watcher.on_hook_change
    type: event
    payload: { hook_path, change_type }

  - point: cron.daily_health
    type: schedule
    payload: { timestamp }

mechanism: |
  1. Scan hook locations (.git/hooks/, scripts/hooks/, .husky/)
  2. For each executable hook file:
     a. Extract hook_name from filename
     b. Search BEHAVIORS docs for hook mention
     c. If not found, mark as undocumented
  3. Return list of undocumented hooks

signals:
  healthy: undoc_count == 0
  degraded: undoc_count > 0

throttling:
  max_tasks_per_hook: 1
  cooldown: 7d
  dedupe: by hook_path

implements: runtime/checks.py:hook_documentation

on_signal:
  degraded:
    action: create_task_run
    params:
      template: TASK_document_hook
      target: "{hook_path}"
      hook_name: "{hook_name}"
      nature: "concerns"
      problem: HOOK_UNDOC
```

---

## KNOWN GAPS

| Gap | Impact | Mitigation |
|-----|--------|------------|
| No log aggregation | Multiple log files scanned separately | Future: centralized log sink |
| Hook detection limited to known paths | Custom hook locations missed | Document additional paths in config |
