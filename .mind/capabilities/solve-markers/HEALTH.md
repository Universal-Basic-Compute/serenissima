# Solve Markers — Health

```
STATUS: CANONICAL
CAPABILITY: solve-markers
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

Runtime monitoring for marker freshness. Detects stale markers, triggers task creation.

---

## FLOWS

```yaml
flows:
  - name: escalation_scan
    trigger: File change or 6h cron
    frequency: High (every 6h + on change)
    risk: Critical — escalations block work

  - name: proposition_scan
    trigger: Weekly cron
    frequency: Low (weekly)
    risk: Medium — ideas may be lost

  - name: legacy_scan
    trigger: Daily cron
    frequency: Medium (daily)
    risk: Low — technical debt accumulates

  - name: question_scan
    trigger: Weekly cron
    frequency: Low (weekly)
    risk: Medium — uncertainty persists
```

---

## INDICATORS

### H1: Escalation Freshness

```yaml
name: Escalation Freshness
priority: critical

value: "Count of @mind:escalation markers older than 48 hours"

representation:
  type: count
  range: 0-infinity
  display: "{count} stale escalations"

docks:
  - point: file_watcher.on_change
    type: event
    payload: { file_path }

  - point: cron.every_6h
    type: schedule
    payload: { timestamp }

mechanism: |
  1. Scan all files for "@mind:escalation" pattern
  2. For each match, get age via git blame or file mtime
  3. Filter to those older than 48 hours
  4. Return count and locations

signals:
  healthy: count == 0
  critical: count > 0

throttling:
  max_tasks_per_marker: 1
  cooldown: 24h
  dedupe: by file_path + line

implements: runtime/checks.py::escalation_freshness

on_signal:
  critical:
    action: create_task_run
    params:
      template: TASK_resolve_escalation
      target: "{file_path}:{line}"
      context: "{marker_context}"
      nature: "urgently concerns"
      problem: ESCALATION
```

### H2: Proposition Freshness

```yaml
name: Proposition Freshness
priority: medium

value: "Count of @mind:proposition markers older than 7 days"

representation:
  type: count
  range: 0-infinity
  display: "{count} stale propositions"

docks:
  - point: cron.weekly
    type: schedule
    payload: { timestamp }

mechanism: |
  1. Scan all files for "@mind:proposition" pattern
  2. For each match, get age via git blame
  3. Filter to those older than 7 days
  4. Return count and locations

signals:
  healthy: count == 0
  degraded: count > 0 and count < 5
  critical: count >= 5

throttling:
  max_tasks_per_marker: 1
  cooldown: 7d
  dedupe: by file_path + line

implements: runtime/checks.py::proposition_freshness

on_signal:
  degraded:
    action: create_task_run
    params:
      template: TASK_evaluate_proposition
      target: "{file_path}:{line}"
      context: "{marker_context}"
      nature: "concerns"
      problem: SUGGESTION

  critical:
    action: create_task_run
    params:
      template: TASK_evaluate_proposition
      target: "{file_path}:{line}"
      context: "{marker_context}"
      nature: "importantly concerns"
      problem: SUGGESTION
```

### H3: Legacy Marker Freshness

```yaml
name: Legacy Marker Freshness
priority: low

value: "Count of TODO/FIXME/HACK/XXX markers older than 30 days"

representation:
  type: count
  range: 0-infinity
  display: "{count} stale legacy markers"

docks:
  - point: cron.daily
    type: schedule
    payload: { timestamp }

mechanism: |
  1. Scan code files for TODO, FIXME, HACK, XXX patterns
  2. Exclude test files and vendored code
  3. For each match, get age via git blame
  4. Filter to those older than 30 days
  5. Return count and locations

signals:
  healthy: count == 0
  degraded: count > 0 and count < 10
  critical: count >= 10

throttling:
  max_tasks_per_marker: 1
  cooldown: 7d
  dedupe: by file_path + line

implements: runtime/checks.py::legacy_marker_freshness

on_signal:
  degraded:
    action: create_task_run
    params:
      template: TASK_fix_legacy_marker
      target: "{file_path}:{line}"
      marker_type: "{marker_type}"
      context: "{marker_context}"
      nature: "concerns"
      problem: LEGACY_MARKER

  critical:
    action: create_task_run
    params:
      template: TASK_fix_legacy_marker
      target: "{file_path}:{line}"
      marker_type: "{marker_type}"
      context: "{marker_context}"
      nature: "importantly concerns"
      problem: LEGACY_MARKER
```

### H4: Question Freshness

```yaml
name: Question Freshness
priority: medium

value: "Count of @mind:question markers older than 14 days"

representation:
  type: count
  range: 0-infinity
  display: "{count} stale questions"

docks:
  - point: cron.weekly
    type: schedule
    payload: { timestamp }

mechanism: |
  1. Scan all files for "@mind:question" pattern
  2. For each match, get age via git blame
  3. Filter to those older than 14 days
  4. Check if answer exists nearby (heuristic)
  5. Return count of unanswered, stale questions

signals:
  healthy: count == 0
  degraded: count > 0

throttling:
  max_tasks_per_marker: 1
  cooldown: 7d
  dedupe: by file_path + line

implements: runtime/checks.py::question_freshness

on_signal:
  degraded:
    action: create_task_run
    params:
      template: TASK_answer_question
      target: "{file_path}:{line}"
      context: "{marker_context}"
      nature: "concerns"
      problem: UNRESOLVED_QUESTION
```

---

## SUMMARY

| Indicator | Priority | Threshold | Trigger |
|-----------|----------|-----------|---------|
| H1: Escalation Freshness | critical | 48h | 6h cron, file change |
| H2: Proposition Freshness | medium | 7d | weekly cron |
| H3: Legacy Marker Freshness | low | 30d | daily cron |
| H4: Question Freshness | medium | 14d | weekly cron |

---

## KNOWN GAPS

| Gap | Impact | Mitigation |
|-----|--------|------------|
| No semantic analysis | May miss context-dependent markers | Review in procedure |
| Git blame required | Fails on untracked files | Fall back to mtime |
