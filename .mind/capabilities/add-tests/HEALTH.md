# Add Tests — Health

```
STATUS: CANONICAL
CAPABILITY: add-tests
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

Runtime monitoring for test coverage and health. Detects problems, triggers task creation.

---

## FLOWS

```yaml
flows:
  - name: init_scan
    trigger: mind init
    frequency: once per init
    risk: Low — read-only scan

  - name: code_watch
    trigger: Code file created/modified
    frequency: On change
    risk: Low — may create many tasks if batch changes

  - name: validation_watch
    trigger: VALIDATION.md modified
    frequency: On change
    risk: Low — invariant coverage check

  - name: periodic_check
    trigger: cron
    frequency: daily (coverage), hourly (health status)
    risk: None — catches anything missed
```

---

## INDICATORS

### H1: Test Coverage

```yaml
name: Test Coverage
priority: critical

value: "Percentage of modules with test files"

representation:
  type: percentage
  range: 0-100
  display: "{covered}/{total} modules tested"

docks:
  - point: init_scan.after_module_discovery
    type: event
    payload: { module_id, module_path }

  - point: file_watcher.on_code_create
    type: event
    payload: { file_path, module_id }

  - point: cron.daily_health
    type: schedule
    payload: { timestamp }

mechanism: |
  1. Get module_id from payload
  2. Check tests/{module_id}/ exists
  3. Check contains test_*.py files
  4. If missing → critical

signals:
  healthy: Test directory exists with test files
  degraded: N/A (binary check)
  critical: No test files for module

throttling:
  max_tasks_per_module: 1
  cooldown: 24h
  dedupe: by module_id

implements: runtime/checks.py::test_coverage

on_signal:
  critical:
    action: create_task_run
    params:
      template: TASK_add_tests
      target: "{module_id}"
      nature: "urgently concerns"
      problem: MISSING_TESTS
```

### H2: Invariant Coverage

```yaml
name: Invariant Coverage
priority: high

value: "Invariants with corresponding VALIDATES markers"

representation:
  type: percentage
  range: 0-100
  display: "{tested}/{total} invariants covered"

docks:
  - point: file_watcher.on_validation_change
    type: event
    payload: { validation_file, invariants }

  - point: cron.daily_health
    type: schedule
    payload: { timestamp }

mechanism: |
  1. Parse VALIDATION.md for invariant IDs (V1, V2, ...)
  2. Search tests/**/*.py for VALIDATES: markers
  3. Compare sets
  4. Missing = invariants without VALIDATES marker

signals:
  healthy: All invariants have VALIDATES markers
  degraded: Some invariants untested (<50%)
  critical: Most invariants untested (>50%)

throttling:
  max_tasks_per_invariant: 1
  cooldown: 24h
  dedupe: by invariant_id

implements: runtime/checks.py::invariant_coverage

on_signal:
  degraded:
    action: create_task_run
    params:
      template: TASK_test_invariant
      target: "{invariant_id}"
      source: "{validation_file}"
      nature: "importantly concerns"
      problem: INVARIANT_UNTESTED

  critical:
    action: create_task_run
    params:
      template: TASK_test_invariant
      target: "{invariant_ids}"
      source: "{validation_file}"
      nature: "urgently concerns"
      problem: INVARIANT_UNTESTED
```

### H3: VALIDATES Markers

```yaml
name: VALIDATES Markers
priority: medium

value: "Test files with VALIDATES markers"

representation:
  type: percentage
  range: 0-100
  display: "{marked}/{total} tests linked"

docks:
  - point: file_watcher.on_test_change
    type: event
    payload: { test_file }

  - point: cron.weekly_health
    type: schedule
    payload: { timestamp }

mechanism: |
  1. Scan tests/**/*.py
  2. For each file, extract test functions (def test_*)
  3. Check for VALIDATES: markers
  4. Flag files with tests but no markers

signals:
  healthy: All test files have VALIDATES markers
  degraded: Some test files missing markers

throttling:
  max_tasks_per_file: 1
  cooldown: 7d
  dedupe: by test_file

implements: runtime/checks.py::validates_markers

on_signal:
  degraded:
    action: create_task_run
    params:
      template: TASK_add_validates_markers
      target: "{test_file}"
      nature: "concerns"
      problem: TEST_NO_VALIDATES
```

### H4: Health Status

```yaml
name: Health Status
priority: critical

value: "Overall system health check status"

representation:
  type: enum
  values: [healthy, degraded, critical]
  display: "{status}: {check_name}"

docks:
  - point: health_runner.on_check_complete
    type: event
    payload: { check_id, status, error, details }

  - point: cron.hourly_health
    type: schedule
    payload: { timestamp }

  - point: ci.pipeline
    type: event
    payload: { pipeline_id, stage }

mechanism: |
  1. Receive health check result
  2. If status != healthy:
     - Create task_run for investigation
     - Include error details, timestamp, check name
  3. Link to relevant module and problem

signals:
  healthy: All checks passing
  degraded: Some checks failing (non-critical)
  critical: Critical checks failing

throttling:
  max_tasks_per_check: 1
  cooldown: 1h
  dedupe: by check_id + error_hash

implements: runtime/checks.py::health_status

on_signal:
  degraded:
    action: create_task_run
    params:
      template: TASK_fix_health
      target: "{check_id}"
      error: "{error}"
      details: "{details}"
      nature: "importantly concerns"
      problem: HEALTH_FAILED

  critical:
    action: create_task_run
    params:
      template: TASK_fix_health
      target: "{check_id}"
      error: "{error}"
      details: "{details}"
      nature: "urgently concerns"
      problem: HEALTH_FAILED
```

---

## KNOWN GAPS

| Gap | Impact | Mitigation |
|-----|--------|------------|
| No test quality check | Tests may exist but be weak | Review in procedure, future capability |
| No mutation testing | Coverage ≠ effectiveness | Future capability |
| No flaky test detection | Intermittent failures not tracked | Log analysis capability |
