# Create Doc Chain — Health

```
STATUS: CANONICAL
CAPABILITY: create-doc-chain
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

Runtime monitoring for doc chain completeness. Detects problems, triggers task creation.

---

## FLOWS

```yaml
flows:
  - name: init_scan
    trigger: mind init
    frequency: once per init
    risk: Low — read-only scan

  - name: file_watch
    trigger: Code file created/modified
    frequency: On change
    risk: Low — may create many tasks if batch changes

  - name: periodic_check
    trigger: cron
    frequency: daily
    risk: None — catches anything missed
```

---

## INDICATORS

### H1: Chain Completeness

```yaml
name: Chain Completeness
priority: critical

value: "Percentage of expected docs present per module"

representation:
  type: percentage
  range: 0-100
  display: "{found}/{expected} docs"

docks:
  - point: init_scan.after_module_discovery
    type: event
    payload: { module_id, module_path }

  - point: file_watcher.on_code_change
    type: event
    payload: { file_path, change_type }

  - point: cron.daily_health
    type: schedule
    payload: { timestamp }

mechanism: |
  1. Get module_id from payload
  2. Expected = [OBJECTIVES, PATTERNS, VOCABULARY, BEHAVIORS,
                 ALGORITHM, VALIDATION, IMPLEMENTATION, HEALTH, SYNC]
  3. Found = scan docs/{module_id}/*.md
  4. Missing = Expected - Found
  5. Percentage = len(Found) / len(Expected) * 100

signals:
  healthy: Missing == []
  degraded: Missing exists but not OBJECTIVES or PATTERNS
  critical: OBJECTIVES or PATTERNS in Missing

throttling:
  max_tasks_per_module: 1
  cooldown: 24h
  dedupe: by module_id + missing_doc

implements: runtime/health/checks/chain_completeness.py

on_signal:
  degraded:
    action: create_task_run
    params:
      template: TASK_create_doc
      target: "{module_id}"
      missing: "{missing}"
      nature: "importantly concerns"
      problem: INCOMPLETE_CHAIN

  critical:
    action: create_task_run
    params:
      template: TASK_create_doc
      target: "{module_id}"
      missing: "{missing}"
      nature: "urgently concerns"
      problem: UNDOCUMENTED
```

### H2: Placeholder Detection

```yaml
name: Placeholder Detection
priority: medium

value: "Count of unfilled placeholders in docs"

representation:
  type: count
  range: 0-∞
  display: "{count} placeholders"

docks:
  - point: doc_watcher.on_doc_change
    type: event
    payload: { doc_path }

  - point: cron.daily_health
    type: schedule
    payload: { timestamp }

mechanism: |
  1. Scan docs/**/*.md
  2. Search for patterns: "{placeholder}", "STATUS: STUB", "{Module}"
  3. Count occurrences per file

signals:
  healthy: count == 0
  degraded: count > 0 and count < 10
  critical: count >= 10

throttling:
  max_tasks_per_file: 1
  cooldown: 24h

implements: runtime/health/checks/placeholder_detection.py

on_signal:
  degraded:
    action: create_task_run
    params:
      template: TASK_create_doc
      target: "{doc_path}"
      problem: PLACEHOLDER_DOC
      nature: "concerns"

  critical:
    action: create_task_run
    params:
      template: TASK_create_doc
      target: "{doc_path}"
      problem: PLACEHOLDER_DOC
      nature: "importantly concerns"
```

### H3: Template Drift

```yaml
name: Template Drift
priority: low

value: "Docs with structure not matching templates"

representation:
  type: count
  range: 0-∞
  display: "{count} drifted docs"

docks:
  - point: doc_watcher.on_doc_change
    type: event
    payload: { doc_path, doc_type }

  - point: cron.weekly_health
    type: schedule
    payload: { timestamp }

mechanism: |
  1. For each doc in docs/**/*.md
  2. Determine doc_type from filename prefix (OBJECTIVES_, PATTERNS_, etc.)
  3. Load template: templates/docs/{doc_type}_TEMPLATE.md
  4. Extract required sections (## headers) from template
  5. Check if doc has all required sections
  6. Missing sections = drift

signals:
  healthy: drifted_count == 0
  degraded: drifted_count > 0

throttling:
  max_tasks_per_file: 1
  cooldown: 7d
  dedupe: by doc_path

implements: runtime/health/checks/template_drift.py

on_signal:
  degraded:
    action: create_task_run
    params:
      template: TASK_fix_template_drift
      target: "{doc_path}"
      missing_sections: "{missing_sections}"
      problem: TEMPLATE_DRIFT
      nature: "concerns"
```

### H4: New Undocumented Code

```yaml
name: New Undocumented Code
priority: high

value: "Recently added code files without DOCS markers"

representation:
  type: count
  range: 0-∞
  display: "{count} new undoc files"

docks:
  - point: git_hook.post_commit
    type: event
    payload: { added_files, commit_sha }

  - point: ci.pull_request
    type: event
    payload: { changed_files, pr_id }

mechanism: |
  1. Get list of added/modified code files from payload
  2. Filter to code extensions (.py, .ts, .js, etc.)
  3. For each file, check first 10 lines for "DOCS:" marker
  4. Files without marker = undocumented

signals:
  healthy: undoc_count == 0
  degraded: undoc_count > 0

throttling:
  max_tasks_per_commit: 1
  cooldown: 1h
  dedupe: by file_path

implements: runtime/health/checks/new_undoc_code.py

on_signal:
  degraded:
    action: create_task_run
    params:
      template: TASK_create_doc
      target: "{file_paths}"
      problem: NEW_UNDOC_CODE
      nature: "importantly concerns"
```

---

## KNOWN GAPS

| Gap | Impact | Mitigation |
|-----|--------|------------|
| No content quality check | Docs may exist but be poor | Review in procedure, future capability |
