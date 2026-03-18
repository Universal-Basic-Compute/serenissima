# Sync State — Vocabulary

```
STATUS: CANONICAL
CAPABILITY: sync-state
```

---

## CHAIN

```
OBJECTIVES:      ./OBJECTIVES.md
PATTERNS:        ./PATTERNS.md
THIS:            VOCABULARY.md (you are here)
BEHAVIORS:       ./BEHAVIORS.md
ALGORITHM:       ./ALGORITHM.md
```

---

## PURPOSE

Terms and problems owned by this capability.

---

## TERMS

### SYNC freshness

How recently a SYNC file was updated. Measured by LAST_UPDATED field.

### state drift

When configuration files no longer match file system reality.

### graph coverage

Percentage of docs on disk that have corresponding graph nodes.

### blocker

A condition preventing module work from progressing. Recorded as STATUS: BLOCKED.

---

## PROBLEMS

### PROBLEM: STALE_SYNC

```yaml
id: STALE_SYNC
severity: warning
category: sync

definition: |
  A SYNC file has not been updated in more than 14 days.
  The LAST_UPDATED field is outdated, indicating the module
  state documentation may not reflect current reality.

detection:
  - SYNC file exists
  - LAST_UPDATED field parsed
  - Date older than (today - 14 days)

resolves_with: TASK_update_sync

examples:
  - "docs/auth/SYNC.md has LAST_UPDATED: 2025-12-01 (16 days ago)"
  - "docs/api/SYNC.md has LAST_UPDATED: 2025-11-15"
```

### PROBLEM: YAML_DRIFT

```yaml
id: YAML_DRIFT
severity: warning
category: sync

definition: |
  The modules.yaml file is out of sync with actual files in the docs
  directory. Modules listed don't exist or existing modules aren't listed.

detection:
  - Scan docs/ for module directories
  - Parse modules.yaml for listed modules
  - Compare: missing or extra entries = drift

resolves_with: TASK_regenerate_yaml

examples:
  - "modules.yaml lists 'auth' but docs/auth/ doesn't exist"
  - "docs/payments/ exists but not in modules.yaml"
  - "Manual edit introduced typo in modules.yaml"
```

### PROBLEM: DOCS_NOT_INGESTED

```yaml
id: DOCS_NOT_INGESTED
severity: warning
category: sync

definition: |
  Documentation files exist on disk but have not been ingested into
  the graph database. They exist but aren't queryable.

detection:
  - Scan docs/**/*.md for files on disk
  - Query graph for doc nodes
  - Files on disk without graph nodes = not ingested

resolves_with: TASK_ingest_docs

examples:
  - "docs/api/PATTERNS.md exists but no graph node"
  - "New module created but mind sync not run"
  - "Ingestion failed silently for some files"
```

### PROBLEM: MODULE_BLOCKED

```yaml
id: MODULE_BLOCKED
severity: high
category: sync

definition: |
  A module's SYNC file indicates STATUS: BLOCKED, meaning work cannot
  proceed due to some dependency or decision needed.

detection:
  - Parse SYNC files
  - STATUS field equals "BLOCKED"
  - Check how long blocked

resolves_with: TASK_unblock_module

examples:
  - "docs/payments/SYNC.md has STATUS: BLOCKED (waiting on API spec)"
  - "Module blocked by unresolved escalation"
  - "Predecessor module not complete"
```

---

## USAGE

```yaml
# In HEALTH.md
on_problem:
  problem_id: STALE_SYNC
  creates:
    node:
      node_type: narrative
      type: task_run
      nature: "importantly concerns"
    links:
      - nature: "serves"
        to: TASK_update_sync
      - nature: "resolves"
        to: STALE_SYNC
```
