# Implement Code — Health

```
STATUS: CANONICAL
CAPABILITY: implement-code
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

Runtime monitoring for implementation completeness. Detects stubs, TODOs, missing algorithm docs, and stale documentation.

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

  - name: post_commit
    trigger: Git commit
    frequency: Per commit
    risk: Low — catches staleness early

  - name: periodic_check
    trigger: cron
    frequency: daily
    risk: None — catches anything missed
```

---

## INDICATORS

### H1: Stub Detection

```yaml
name: Stub Detection
priority: critical

value: "Count of stub functions in codebase"

representation:
  type: count
  range: 0-infinity
  display: "{count} stubs"

docks:
  - point: file_watcher.on_code_change
    type: event
    payload: { file_path, change_type }

  - point: init_scan.after_module_discovery
    type: event
    payload: { module_id }

  - point: cron.daily_health
    type: schedule
    payload: { timestamp }

mechanism: |
  1. Parse code file as AST
  2. Extract all function definitions
  3. For each function:
     a. Get function body
     b. Strip docstring and comments
     c. Check if body matches stub patterns:
        - `pass`
        - `...`
        - `raise NotImplementedError`
        - Empty
  4. Count stub functions

signals:
  healthy: stub_count == 0
  degraded: stub_count > 0 and stub_count <= 5
  critical: stub_count > 5

throttling:
  max_tasks_per_file: 1
  cooldown: 1h
  dedupe: by file_path + function_name

implements: runtime/checks.py::stub_detection

on_signal:
  degraded:
    action: create_task_run
    params:
      template: TASK_implement_stub
      target: "{file_path}"
      functions: "{stub_functions}"
      nature: "importantly concerns"
      problem: STUB_IMPL

  critical:
    action: create_task_run
    params:
      template: TASK_implement_stub
      target: "{file_path}"
      functions: "{stub_functions}"
      nature: "urgently concerns"
      problem: STUB_IMPL
```

### H2: Incomplete Code Detection

```yaml
name: Incomplete Code Detection
priority: high

value: "Count of TODO/FIXME markers in code"

representation:
  type: count
  range: 0-infinity
  display: "{count} TODOs"

docks:
  - point: file_watcher.on_code_change
    type: event
    payload: { file_path }

  - point: cron.daily_health
    type: schedule
    payload: { timestamp }

mechanism: |
  1. Read code file
  2. Search for patterns:
     - # TODO
     - # FIXME
     - # XXX
     - # HACK
     - // TODO (JS/TS)
     - // FIXME (JS/TS)
  3. Extract marker text and line number
  4. Check if tracked by existing task
  5. Count untracked markers

signals:
  healthy: untracked_count == 0
  degraded: untracked_count > 0 and untracked_count <= 10
  critical: untracked_count > 10

throttling:
  max_tasks_per_file: 3
  cooldown: 4h
  dedupe: by file_path + line_number

implements: runtime/checks.py::incomplete_detection

on_signal:
  degraded:
    action: create_task_run
    params:
      template: TASK_complete_impl
      target: "{file_path}"
      markers: "{markers}"
      nature: "importantly concerns"
      problem: INCOMPLETE_IMPL

  critical:
    action: create_task_run
    params:
      template: TASK_complete_impl
      target: "{file_path}"
      markers: "{markers}"
      nature: "urgently concerns"
      problem: INCOMPLETE_IMPL
```

### H3: Undocumented Implementation Detection

```yaml
name: Undocumented Implementation
priority: high

value: "Count of IMPLEMENTATION.md without ALGORITHM.md"

representation:
  type: count
  range: 0-infinity
  display: "{count} missing ALGORITHM"

docks:
  - point: doc_watcher.on_impl_create
    type: event
    payload: { doc_path, module_id }

  - point: init_scan.after_doc_discovery
    type: event
    payload: { module_id }

  - point: cron.daily_health
    type: schedule
    payload: { timestamp }

mechanism: |
  1. Find all IMPLEMENTATION*.md files
  2. For each, check parent directory for ALGORITHM*.md
  3. If ALGORITHM missing:
     a. Mark as undocumented
  4. If ALGORITHM exists but is stub:
     a. Check for placeholder markers
     b. Check STATUS field
     c. Check content length
     d. Mark as undocumented if stub

signals:
  healthy: undoc_count == 0
  degraded: undoc_count > 0

throttling:
  max_tasks_per_module: 1
  cooldown: 24h
  dedupe: by module_id

implements: runtime/checks.py::undoc_impl_detection

on_signal:
  degraded:
    action: create_task_run
    params:
      template: TASK_document_impl
      target: "{module_id}"
      impl_path: "{impl_path}"
      nature: "importantly concerns"
      problem: UNDOC_IMPL
```

### H4: Stale Implementation Docs

```yaml
name: Stale Implementation Docs
priority: medium

value: "Docs behind code by more than 7 days"

representation:
  type: count
  range: 0-infinity
  display: "{count} stale docs"

docks:
  - point: git_hook.post_commit
    type: event
    payload: { modified_files, commit_sha }

  - point: cron.daily_health
    type: schedule
    payload: { timestamp }

mechanism: |
  1. Get modified code files from payload (or scan all)
  2. For each code file with DOCS: marker:
     a. Get linked doc path
     b. Get code modification time (git)
     c. Get doc LAST_UPDATED field
     d. Calculate days difference
  3. If code newer by > 7 days:
     a. Mark as stale

signals:
  healthy: stale_count == 0
  degraded: stale_count > 0 and max_staleness <= 30
  critical: max_staleness > 30

throttling:
  max_tasks_per_file: 1
  cooldown: 7d
  dedupe: by code_file + doc_file

implements: runtime/checks.py::stale_impl_detection

on_signal:
  degraded:
    action: create_task_run
    params:
      template: TASK_update_impl_docs
      code_file: "{code_file}"
      doc_file: "{doc_file}"
      days_behind: "{days_behind}"
      nature: "concerns"
      problem: STALE_IMPL

  critical:
    action: create_task_run
    params:
      template: TASK_update_impl_docs
      code_file: "{code_file}"
      doc_file: "{doc_file}"
      days_behind: "{days_behind}"
      nature: "importantly concerns"
      problem: STALE_IMPL
```

---

## KNOWN GAPS

| Gap | Impact | Mitigation |
|-----|--------|------------|
| No semantic stub detection | Complex stubs not caught | Future: LLM analysis |
| No cross-language support | Only Python/JS/TS | Add patterns as needed |
| No test coverage check | Impl may lack tests | Separate capability |
