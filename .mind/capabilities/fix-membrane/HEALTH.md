# Fix Membrane — Health

```
STATUS: CANONICAL
CAPABILITY: fix-membrane
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

Runtime monitoring for membrane health. Detects procedure problems, triggers repair tasks.

---

## FLOWS

```yaml
flows:
  - name: init_scan
    trigger: mind init
    frequency: once per init
    risk: Low - read-only scan

  - name: file_watch
    trigger: Procedure file created/modified
    frequency: On change
    risk: Low - may create tasks if multiple edits

  - name: periodic_check
    trigger: cron
    frequency: daily
    risk: None - catches anything missed
```

---

## INDICATORS

### H1: Procedures Exist

```yaml
name: Procedures Exist
priority: critical

value: "Whether .mind/procedures/ has any YAML files"

representation:
  type: binary
  display: "{count} procedures"

docks:
  - point: init_scan.after_directory_check
    type: event
    payload: { mind_dir }

  - point: cron.daily_health
    type: schedule
    payload: { timestamp }

mechanism: |
  1. Check .mind/procedures/ exists
  2. Count *.yaml files
  3. If count == 0: critical

signals:
  healthy: count > 0
  critical: count == 0 or directory missing

throttling:
  max_tasks_per_project: 1
  cooldown: 24h

implements: runtime/checks.py::procedures_exist

on_signal:
  critical:
    action: create_task_run
    params:
      template: TASK_create_procedures
      target: ".mind/procedures/"
      nature: "urgently concerns"
      problem: MEMBRANE_NO_PROTOCOLS
```

### H2: YAML Validity

```yaml
name: YAML Validity
priority: critical

value: "Count of procedure files with parse errors"

representation:
  type: count
  range: 0-N
  display: "{count} parse errors"

docks:
  - point: file_watcher.on_procedure_change
    type: event
    payload: { file_path }

  - point: init_scan.after_file_discovery
    type: event
    payload: { procedures_dir }

  - point: cron.daily_health
    type: schedule
    payload: { timestamp }

mechanism: |
  1. For each *.yaml in .mind/procedures/
  2. Attempt yaml.safe_load()
  3. If exception: record file, line, error
  4. Return count and details

signals:
  healthy: error_count == 0
  critical: error_count > 0

throttling:
  max_tasks_per_file: 1
  cooldown: 1h
  dedupe: by file_path

implements: runtime/checks.py::yaml_valid

on_signal:
  critical:
    action: create_task_run
    params:
      template: TASK_fix_yaml_syntax
      target: "{error_file}"
      error_line: "{error_line}"
      error_msg: "{error_msg}"
      nature: "urgently concerns"
      problem: MEMBRANE_PARSE_ERROR
```

### H3: Step Structure

```yaml
name: Step Structure
priority: high

value: "Count of invalid steps across all procedures"

representation:
  type: count
  range: 0-N
  display: "{count} invalid steps"

docks:
  - point: file_watcher.on_procedure_change
    type: event
    payload: { file_path }

  - point: init_scan.after_parse
    type: event
    payload: { procedures }

mechanism: |
  1. For each successfully parsed procedure
  2. For each step in steps[]
  3. Check: has 'id', has 'action' or 'name'
  4. Check: 'params' is dict if present
  5. Record violations

signals:
  healthy: invalid_count == 0
  degraded: invalid_count > 0

throttling:
  max_tasks_per_file: 1
  cooldown: 1h
  dedupe: by file_path + step_index

implements: runtime/checks.py::steps_valid

on_signal:
  degraded:
    action: create_task_run
    params:
      template: TASK_fix_step_structure
      target: "{file_path}"
      step_index: "{step_index}"
      issue: "{issue}"
      nature: "importantly concerns"
      problem: MEMBRANE_INVALID_STEP
```

### H4: Required Fields

```yaml
name: Required Fields
priority: high

value: "Count of procedures missing required fields"

representation:
  type: count
  range: 0-N
  display: "{count} incomplete procedures"

docks:
  - point: file_watcher.on_procedure_change
    type: event
    payload: { file_path }

  - point: init_scan.after_parse
    type: event
    payload: { procedures }

mechanism: |
  1. For each successfully parsed procedure
  2. Check: 'name' exists and non-empty
  3. Check: 'steps' exists and non-empty list
  4. Record which fields missing

signals:
  healthy: missing_count == 0
  degraded: missing_count > 0

throttling:
  max_tasks_per_file: 1
  cooldown: 1h
  dedupe: by file_path

implements: runtime/checks.py::fields_complete

on_signal:
  degraded:
    action: create_task_run
    params:
      template: TASK_add_missing_fields
      target: "{file_path}"
      missing_fields: "{missing_fields}"
      nature: "importantly concerns"
      problem: MEMBRANE_MISSING_FIELDS
```

---

## KNOWN GAPS

| Gap | Impact | Mitigation |
|-----|--------|------------|
| No semantic validation | Invalid action names not caught | Future: action registry |
| No cross-file checks | Duplicate procedure names allowed | Future: registry check |
