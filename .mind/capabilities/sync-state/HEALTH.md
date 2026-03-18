# Sync State — Health

```
STATUS: CANONICAL
CAPABILITY: sync-state
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

Runtime monitoring for sync state. Detects problems, triggers task creation.

---

## FLOWS

```yaml
flows:
  - name: daily_sync_check
    trigger: cron:daily
    frequency: Every 24h
    risk: Low — read-only scan

  - name: doctor_check
    trigger: mind doctor
    frequency: On command
    risk: None — comprehensive scan

  - name: file_watch
    trigger: docs/** changes
    frequency: On change
    risk: Low — may detect drift frequently during active work

  - name: status_check
    trigger: mind status
    frequency: On command
    risk: None — surfaces blocked modules
```

---

## INDICATORS

### H1: SYNC Freshness

```yaml
name: SYNC Freshness
priority: high

value: "Count of SYNC files older than 14 days"

representation:
  type: count
  range: 0-infinity
  display: "{count} stale SYNC files"

docks:
  - point: cron.daily_health
    type: schedule
    payload: { timestamp }

  - point: doctor.scan
    type: event
    payload: { project_root }

mechanism: |
  1. Glob for docs/**/SYNC*.md
  2. For each, parse LAST_UPDATED field
  3. Compare to (today - 14 days)
  4. Count files older than threshold

signals:
  healthy: stale_count == 0
  degraded: stale_count > 0 and stale_count < 5
  critical: stale_count >= 5

throttling:
  max_tasks_per_file: 1
  cooldown: 7d
  dedupe: by sync_path

implements: runtime/checks.py::sync_freshness

on_signal:
  degraded:
    action: create_task_run
    params:
      template: TASK_update_sync
      target: "{stale_files}"
      nature: "importantly concerns"
      problem: STALE_SYNC

  critical:
    action: create_task_run
    params:
      template: TASK_update_sync
      target: "{stale_files}"
      nature: "urgently concerns"
      problem: STALE_SYNC
```

### H2: YAML Drift

```yaml
name: YAML Drift
priority: high

value: "Whether modules.yaml matches file system"

representation:
  type: binary
  display: "YAML {synced|drifted}"

docks:
  - point: cron.daily_health
    type: schedule
    payload: { timestamp }

  - point: file_watcher.on_docs_change
    type: event
    payload: { changed_paths }

  - point: doctor.scan
    type: event
    payload: { project_root }

mechanism: |
  1. Load modules.yaml
  2. Scan docs/ for module directories
  3. Compare sets
  4. Drift = any missing or extra

signals:
  healthy: drifted == false
  degraded: drifted == true

throttling:
  max_tasks: 1
  cooldown: 1h
  dedupe: global (only one drift task at a time)

implements: runtime/checks.py::yaml_drift

on_signal:
  degraded:
    action: create_task_run
    params:
      template: TASK_regenerate_yaml
      missing: "{missing_from_yaml}"
      extra: "{extra_in_yaml}"
      nature: "importantly concerns"
      problem: YAML_DRIFT
```

### H3: Ingestion Coverage

```yaml
name: Ingestion Coverage
priority: medium

value: "Percentage of docs on disk that exist in graph"

representation:
  type: percentage
  range: 0-100
  display: "{in_graph}/{on_disk} docs ingested ({pct}%)"

docks:
  - point: doctor.scan
    type: event
    payload: { project_root, graph }

  - point: sync.command
    type: event
    payload: { project_root, graph }

mechanism: |
  1. Glob docs/**/*.md for files on disk
  2. Query graph for doc nodes
  3. Compute: not_ingested = disk - graph
  4. Percentage = len(in_graph) / len(on_disk) * 100

signals:
  healthy: not_ingested == []
  degraded: len(not_ingested) > 0 and len(not_ingested) < 10
  critical: len(not_ingested) >= 10

throttling:
  max_tasks: 1
  cooldown: 1h
  dedupe: global

implements: runtime/checks.py::ingestion_coverage

on_signal:
  degraded:
    action: create_task_run
    params:
      template: TASK_ingest_docs
      not_ingested: "{not_ingested}"
      nature: "concerns"
      problem: DOCS_NOT_INGESTED

  critical:
    action: create_task_run
    params:
      template: TASK_ingest_docs
      not_ingested: "{not_ingested}"
      nature: "importantly concerns"
      problem: DOCS_NOT_INGESTED
```

### H4: Blocked Modules

```yaml
name: Blocked Modules
priority: high

value: "Count of modules with STATUS: BLOCKED"

representation:
  type: count
  range: 0-infinity
  display: "{count} blocked modules"

docks:
  - point: cron.daily_health
    type: schedule
    payload: { timestamp }

  - point: status.command
    type: event
    payload: { project_root }

  - point: doctor.scan
    type: event
    payload: { project_root }

mechanism: |
  1. Glob for docs/**/SYNC*.md
  2. For each, parse STATUS field
  3. If STATUS: BLOCKED, add to blocked list
  4. Check duration blocked

signals:
  healthy: blocked_count == 0
  degraded: blocked_count > 0 and none blocked > 7 days
  critical: any module blocked > 7 days

throttling:
  max_tasks_per_module: 1
  cooldown: 3d
  dedupe: by module_id

implements: runtime/checks.py::blocked_modules

on_signal:
  degraded:
    action: create_task_run
    params:
      template: TASK_unblock_module
      blocked: "{blocked}"
      nature: "importantly concerns"
      problem: MODULE_BLOCKED

  critical:
    action: create_task_run
    params:
      template: TASK_unblock_module
      blocked: "{long_blocked}"
      nature: "urgently concerns"
      problem: MODULE_BLOCKED
```

---

## KNOWN GAPS

| Gap | Impact | Mitigation |
|-----|--------|------------|
| No content quality check for SYNC | SYNC may be updated but empty | V5 invariant check |
| YAML regeneration may lose comments | Comments in modules.yaml not preserved | Document in procedure |
| Ingestion doesn't verify content | Node may exist but with stale content | Separate staleness check |
