# Fill Gaps — Health

```
STATUS: CANONICAL
CAPABILITY: fill-gaps
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

Runtime monitoring for documentation quality. Detects gaps, duplicates, and oversized docs. Triggers task creation.

---

## FLOWS

```yaml
flows:
  - name: init_scan
    trigger: mind init
    frequency: once per init
    risk: Low — read-only scan

  - name: doc_watch
    trigger: Doc file created/modified
    frequency: On change
    risk: Low — may create tasks for new gaps

  - name: periodic_gap_check
    trigger: cron
    frequency: daily
    risk: None — catches gaps missed by watch

  - name: duplication_scan
    trigger: cron
    frequency: weekly
    risk: Medium — O(n^2) doc comparison, throttled
```

---

## INDICATORS

### H1: Gap Detection

```yaml
name: Gap Detection
priority: high

value: "Count of @mind:gap markers in documentation"

representation:
  type: count
  range: 0-infinity
  display: "{count} gaps"

docks:
  - point: init_scan.after_doc_discovery
    type: event
    payload: { docs_path }

  - point: doc_watcher.on_doc_change
    type: event
    payload: { doc_path, change_type }

  - point: cron.daily_health
    type: schedule
    payload: { timestamp }

mechanism: |
  1. Scan docs/**/*.md for "@mind:gap" pattern
  2. Extract each gap's context (marker text)
  3. Count total gaps
  4. Group by doc file

signals:
  healthy: gap_count == 0
  degraded: gap_count > 0

throttling:
  max_tasks_per_doc: 3
  cooldown: 24h
  dedupe: by doc_path + gap_context

implements: runtime/checks.py::gap_detection

on_signal:
  degraded:
    action: create_task_run
    params:
      template: TASK_fill_gap
      target: "{doc_path}"
      context: "{gap_context}"
      nature: "importantly concerns"
      problem: DOC_GAPS
```

### H2: Duplication Detection

```yaml
name: Duplication Detection
priority: medium

value: "Count of doc pairs with >30% content overlap"

representation:
  type: count
  range: 0-infinity
  display: "{count} duplicate pairs"

docks:
  - point: cron.weekly_health
    type: schedule
    payload: { timestamp }

  - point: ingest.after_doc_ingest
    type: event
    payload: { ingested_docs[] }

mechanism: |
  1. Load all docs/**/*.md
  2. Strip headers and CHAIN sections
  3. For each pair, compute ngram Jaccard similarity
  4. Flag pairs with similarity > 0.30
  5. Return list of duplicate pairs

signals:
  healthy: duplicate_count == 0
  degraded: duplicate_count > 0

throttling:
  max_tasks_per_pair: 1
  cooldown: 7d
  dedupe: by sorted(path1, path2)

implements: runtime/checks.py::duplication_detection

on_signal:
  degraded:
    action: create_task_run
    params:
      template: TASK_dedupe_content
      target: "{path1}"
      duplicate: "{path2}"
      similarity: "{similarity}"
      nature: "concerns"
      problem: DOC_DUPLICATION
```

### H3: Size Detection

```yaml
name: Size Detection
priority: low

value: "Count of docs exceeding 200 lines"

representation:
  type: count
  range: 0-infinity
  display: "{count} large docs"

docks:
  - point: init_scan.after_doc_discovery
    type: event
    payload: { docs_path }

  - point: doc_watcher.on_doc_change
    type: event
    payload: { doc_path, change_type }

  - point: cron.daily_health
    type: schedule
    payload: { timestamp }

mechanism: |
  1. For each docs/**/*.md
  2. Count lines: wc -l
  3. If lines > 200, flag as large
  4. Return list of large docs with line counts

signals:
  healthy: large_count == 0
  degraded: large_count > 0

throttling:
  max_tasks_per_doc: 1
  cooldown: 7d
  dedupe: by doc_path

implements: runtime/checks.py::size_detection

on_signal:
  degraded:
    action: create_task_run
    params:
      template: TASK_split_large_doc
      target: "{doc_path}"
      lines: "{line_count}"
      excess: "{lines - 200}"
      nature: "optionally concerns"
      problem: LARGE_DOC_MODULE
```

---

## CHECKER INDEX

```yaml
checkers:
  - name: gap_detection
    purpose: Find @mind:gap markers in docs
    status: active
    priority: high

  - name: duplication_detection
    purpose: Find overlapping content between docs
    status: active
    priority: medium

  - name: size_detection
    purpose: Find docs exceeding 200 lines
    status: active
    priority: low
```

---

## HOW TO RUN

```bash
# Run all health checks for this capability
mind doctor --capability fill-gaps

# Run a specific checker
mind doctor --check gap_detection
mind doctor --check duplication_detection
mind doctor --check size_detection
```

---

## KNOWN GAPS

| Gap | Impact | Mitigation |
|-----|--------|------------|
| No semantic similarity | May miss paraphrased duplicates | Use embeddings in v2 |
| SYNC archive not versioned | Archive grows unbounded | Add archive rotation |
