# Maintain Links — Health

```
STATUS: CANONICAL
CAPABILITY: maintain-links
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

Runtime monitoring for code-doc link integrity. Detects broken IMPL: links and orphan documentation, triggers task creation.

---

## FLOWS

```yaml
flows:
  - name: doc_change
    trigger: Doc file modified
    frequency: On change
    risk: Low — read-only validation

  - name: code_move
    trigger: Code file moved or renamed
    frequency: On change
    risk: Medium — may invalidate multiple IMPL: links

  - name: code_delete
    trigger: Code file deleted
    frequency: On change
    risk: High — may create orphan docs

  - name: periodic_check
    trigger: cron
    frequency: daily
    risk: None — catches anything missed
```

---

## INDICATORS

### H1: IMPL Link Validity

```yaml
name: IMPL Link Validity
priority: high

value: "Percentage of IMPL: markers pointing to existing files"

representation:
  type: percentage
  range: 0-100
  display: "{valid}/{total} IMPL links valid"

docks:
  - point: doc_watcher.on_doc_change
    type: event
    payload: { doc_path }

  - point: file_watcher.on_code_move
    type: event
    payload: { old_path, new_path }

  - point: cron.daily_health
    type: schedule
    payload: { timestamp }

mechanism: |
  1. Get doc_path from payload (or scan all docs if cron)
  2. Parse content for IMPL: markers
  3. For each marker, resolve path relative to project root
  4. Check if resolved path exists
  5. Calculate: valid_count / total_count * 100

signals:
  healthy: all IMPL: links resolve
  degraded: 1-3 broken links
  critical: 4+ broken links OR critical doc has broken link

throttling:
  max_tasks_per_doc: 1
  cooldown: 1h
  dedupe: by doc_path + marker

implements: runtime/checks.py:impl_link_validity

on_signal:
  degraded:
    action: create_task_run
    params:
      template: TASK_fix_impl_link
      target: "{doc_path}"
      broken_markers: "{broken_markers}"
      nature: "importantly concerns"
      problem: BROKEN_IMPL_LINK

  critical:
    action: create_task_run
    params:
      template: TASK_fix_impl_link
      target: "{doc_path}"
      broken_markers: "{broken_markers}"
      nature: "urgently concerns"
      problem: BROKEN_IMPL_LINK
```

### H2: Orphan Doc Detection

```yaml
name: Orphan Doc Detection
priority: medium

value: "Count of documentation files without code references"

representation:
  type: count
  range: 0-∞
  display: "{count} orphan docs"

docks:
  - point: file_watcher.on_code_delete
    type: event
    payload: { deleted_path }

  - point: refactor.post_move
    type: event
    payload: { moves[] }

  - point: cron.daily_health
    type: schedule
    payload: { timestamp }

mechanism: |
  1. If event-triggered, check docs that had IMPL: to deleted/moved file
  2. If cron-triggered, scan all docs
  3. For each doc:
     a. Parse IMPL: markers, check if any resolve
     b. Scan code files for DOCS: markers pointing to this doc
  4. If neither exists, doc is orphan
  5. Count orphans

signals:
  healthy: orphan_count == 0
  degraded: orphan_count > 0 and orphan_count < 5
  critical: orphan_count >= 5

throttling:
  max_tasks_per_doc: 1
  cooldown: 24h
  dedupe: by doc_path

implements: runtime/checks.py:orphan_doc_detection

on_signal:
  degraded:
    action: create_task_run
    params:
      template: TASK_fix_orphan_docs
      target: "{orphan_docs}"
      nature: "concerns"
      problem: ORPHAN_DOCS

  critical:
    action: create_task_run
    params:
      template: TASK_fix_orphan_docs
      target: "{orphan_docs}"
      nature: "importantly concerns"
      problem: ORPHAN_DOCS
```

---

## CHECKERS

```yaml
checkers:
  - name: impl_link_validity
    purpose: Verify IMPL: markers point to existing files
    status: active
    priority: high

  - name: orphan_doc_detection
    purpose: Find docs without code references
    status: active
    priority: medium
```

---

## HOW TO RUN

```bash
# Run all health checks for this capability
mind doctor --capability maintain-links

# Run a specific checker
mind doctor --check impl_link_validity
mind doctor --check orphan_doc_detection
```

---

## KNOWN GAPS

| Gap | Impact | Mitigation |
|-----|--------|------------|
| No semantic validation | Link may exist but doc may not match code | Future: content similarity check |
| No git history check | Can't distinguish "moved" from "deleted" | Future: use git log for smarter resolution |
