# Improve Quality — Health

```
STATUS: CANONICAL
CAPABILITY: improve-quality
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

Runtime monitoring for code quality issues. Detects problems, triggers task creation.

---

## FLOWS

```yaml
flows:
  - name: init_scan
    trigger: mind init
    frequency: once per init
    risk: Low - read-only scan

  - name: file_watch
    trigger: Code file created/modified
    frequency: On change
    risk: Low - may create many tasks if batch changes

  - name: pre_commit
    trigger: git commit
    frequency: On commit
    risk: Low - blocks commit if secrets found

  - name: periodic_check
    trigger: cron
    frequency: daily (most), weekly (naming)
    risk: None - catches anything missed
```

---

## INDICATORS

### H1: Monolith Detection

```yaml
name: Monolith Detection
priority: high

value: "Files exceeding 500 lines"

representation:
  type: count
  range: 0-infinity
  display: "{count} monoliths"

docks:
  - point: init_scan.after_file_discovery
    type: event
    payload: { file_path }

  - point: file_watcher.on_code_change
    type: event
    payload: { file_path, change_type }

  - point: cron.daily_health
    type: schedule
    payload: { timestamp }

mechanism: |
  1. Get file_path from payload
  2. Count effective lines (excluding comments/blanks)
  3. If count > 500 -> problem
  4. If count > 1000 -> critical

signals:
  healthy: line_count <= 500
  degraded: 500 < line_count <= 1000
  critical: line_count > 1000

throttling:
  max_tasks_per_file: 1
  cooldown: 24h
  dedupe: by file_path

implements: runtime/checks.py:monolith_detection

on_signal:
  degraded:
    action: create_task_run
    params:
      template: TASK_split_monolith
      target: "{file_path}"
      line_count: "{line_count}"
      nature: "importantly concerns"
      problem: MONOLITH

  critical:
    action: create_task_run
    params:
      template: TASK_split_monolith
      target: "{file_path}"
      line_count: "{line_count}"
      nature: "urgently concerns"
      problem: MONOLITH
```

### H2: Secret Detection

```yaml
name: Secret Detection
priority: critical

value: "Files containing hardcoded secrets"

representation:
  type: binary
  range: [0, 1]
  display: "secrets: {found ? 'DETECTED' : 'none'}"

docks:
  - point: hook.pre_commit
    type: event
    payload: { staged_files }

  - point: file_watcher.on_code_change
    type: event
    payload: { file_path }

  - point: init_scan.after_file_discovery
    type: event
    payload: { file_path }

mechanism: |
  1. Scan file for secret patterns:
     - API keys (sk-*, AKIA*, ghp_*)
     - Password assignments
     - Token assignments
     - Connection strings with credentials
  2. Skip .example and _test files
  3. If any match -> critical

signals:
  healthy: no secrets found
  critical: any secret pattern matched

throttling:
  max_tasks_per_file: 1
  cooldown: 1h
  dedupe: by file_path

implements: runtime/checks.py:secret_detection

on_signal:
  critical:
    action: create_task_run
    params:
      template: TASK_extract_secrets
      target: "{file_path}"
      patterns: "{patterns_matched}"
      nature: "urgently concerns"
      problem: HARDCODED_SECRET
```

### H3: Magic Value Detection

```yaml
name: Magic Value Detection
priority: medium

value: "Count of magic values per file"

representation:
  type: count
  range: 0-infinity
  display: "{count} magic values"

docks:
  - point: init_scan.after_file_discovery
    type: event
    payload: { file_path }

  - point: cron.daily_health
    type: schedule
    payload: { timestamp }

mechanism: |
  1. Scan file for suspicious literals
  2. Filter out safe values (0, 1, -1, 100, 1000)
  3. Filter out values in constant definitions
  4. Count remaining

signals:
  healthy: count < 3
  degraded: count >= 3

throttling:
  max_tasks_per_file: 1
  cooldown: 7d
  dedupe: by file_path

implements: runtime/checks.py:magic_value_detection

on_signal:
  degraded:
    action: create_task_run
    params:
      template: TASK_extract_constants
      target: "{file_path}"
      values: "{values}"
      nature: "concerns"
      problem: MAGIC_VALUES
```

### H4: Prompt Length Detection

```yaml
name: Prompt Length Detection
priority: medium

value: "Prompts exceeding 4000 characters"

representation:
  type: count
  range: 0-infinity
  display: "{count} long prompts"

docks:
  - point: init_scan.after_file_discovery
    type: event
    payload: { file_path }

  - point: file_watcher.on_code_change
    type: event
    payload: { file_path }

  - point: cron.daily_health
    type: schedule
    payload: { timestamp }

mechanism: |
  1. Find prompt variables in file
  2. Measure character count
  3. If > 4000 -> problem

signals:
  healthy: all prompts < 4000 chars
  degraded: any prompt >= 4000 chars

throttling:
  max_tasks_per_file: 1
  cooldown: 7d
  dedupe: by file_path

implements: runtime/checks.py:prompt_length_detection

on_signal:
  degraded:
    action: create_task_run
    params:
      template: TASK_compress_prompt
      target: "{file_path}"
      char_count: "{char_count}"
      nature: "concerns"
      problem: LONG_PROMPT
```

### H5: SQL Complexity Detection

```yaml
name: SQL Complexity Detection
priority: medium

value: "SQL queries exceeding complexity threshold"

representation:
  type: count
  range: 0-infinity
  display: "{count} complex queries"

docks:
  - point: init_scan.after_file_discovery
    type: event
    payload: { file_path }

  - point: cron.daily_health
    type: schedule
    payload: { timestamp }

mechanism: |
  1. Find SQL strings in file
  2. Measure: length, join count, subquery depth
  3. Thresholds: length > 1000, joins > 5, depth > 2

signals:
  healthy: all queries under thresholds
  degraded: any query exceeds thresholds

throttling:
  max_tasks_per_file: 1
  cooldown: 7d
  dedupe: by file_path

implements: runtime/checks.py:sql_complexity_detection

on_signal:
  degraded:
    action: create_task_run
    params:
      template: TASK_refactor_sql
      target: "{file_path}"
      issues: "{issues}"
      nature: "concerns"
      problem: LONG_SQL
```

### H6: Naming Convention Detection

```yaml
name: Naming Convention Detection
priority: low

value: "Names violating conventions"

representation:
  type: count
  range: 0-infinity
  display: "{count} naming violations"

docks:
  - point: init_scan.after_file_discovery
    type: event
    payload: { file_path }

  - point: cron.weekly_health
    type: schedule
    payload: { timestamp }

mechanism: |
  1. Load naming conventions for language
  2. Check filename against pattern
  3. Check class/function names in file
  4. Count violations

signals:
  healthy: no violations
  degraded: any violations

throttling:
  max_tasks_per_file: 1
  cooldown: 30d
  dedupe: by file_path

implements: runtime/checks.py:naming_convention_detection

on_signal:
  degraded:
    action: create_task_run
    params:
      template: TASK_fix_naming
      target: "{file_path}"
      violations: "{violations}"
      nature: "optionally concerns"
      problem: NAMING_CONVENTION
```

---

## CHECKER INDEX

```yaml
checkers:
  - name: monolith_detection
    purpose: Find files > 500 lines
    status: active
    priority: high

  - name: secret_detection
    purpose: Find hardcoded secrets
    status: active
    priority: critical

  - name: magic_value_detection
    purpose: Find hardcoded literals
    status: active
    priority: medium

  - name: prompt_length_detection
    purpose: Find prompts > 4000 chars
    status: active
    priority: medium

  - name: sql_complexity_detection
    purpose: Find complex SQL queries
    status: active
    priority: medium

  - name: naming_convention_detection
    purpose: Find naming violations
    status: active
    priority: low
```

---

## KNOWN GAPS

| Gap | Impact | Mitigation |
|-----|--------|------------|
| No semantic analysis | False positives on magic values | Threshold (< 3) |
| No cross-file detection | Split monolith may create many small files | Agent judgment |
