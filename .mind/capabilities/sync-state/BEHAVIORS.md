# Sync State — Behaviors

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
THIS:            BEHAVIORS.md (you are here)
ALGORITHM:       ./ALGORITHM.md
```

---

## PURPOSE

Observable behaviors of the sync-state capability.

---

## B1: Stale SYNC Detection

**When:** Daily cron or `mind doctor` runs

```
GIVEN:  SYNC file exists with LAST_UPDATED field
WHEN:   Health check runs (cron:daily, mind doctor)
THEN:   Parse LAST_UPDATED date
AND:    If older than 14 days → create task_run for STALE_SYNC
```

**Effect:** Outdated state surfaces automatically.

---

## B2: YAML Drift Detection

**When:** File changes in docs/ or `mind doctor` runs

```
GIVEN:  modules.yaml exists
WHEN:   Health check runs (file_watch on docs/, cron:daily)
THEN:   Compare modules.yaml to actual docs/ structure
AND:    If mismatch → create task_run for YAML_DRIFT
```

**Effect:** Configuration kept in sync with reality.

---

## B3: Ingestion Gap Detection

**When:** `mind doctor` or `mind sync` runs

```
GIVEN:  Doc files exist on disk (docs/**/*.md)
WHEN:   Health check runs
THEN:   Query graph for doc nodes
AND:    Compare disk files to graph nodes
AND:    If files missing from graph → create task_run for DOCS_NOT_INGESTED
```

**Effect:** Graph completeness ensured.

---

## B4: Blocker Detection

**When:** `mind status` or `mind doctor` runs

```
GIVEN:  SYNC files exist
WHEN:   Health check runs
THEN:   Parse STATUS field from each SYNC
AND:    If STATUS: BLOCKED → create task_run for MODULE_BLOCKED
```

**Effect:** Blocked modules cannot be forgotten.

---

## B5: SYNC Update Execution

**When:** Agent claims STALE_SYNC task

```
GIVEN:  task_run exists for STALE_SYNC
WHEN:   Agent claims and starts work
THEN:   Load SKILL_update_sync
AND:    Run PROCEDURE_update_sync
AND:    Check git log for recent changes
AND:    Update SYNC file with current state
AND:    Update LAST_UPDATED to today
```

**Effect:** SYNC file reflects current reality.

---

## B6: YAML Regeneration Execution

**When:** Agent claims YAML_DRIFT task (or automated)

```
GIVEN:  task_run exists for YAML_DRIFT
WHEN:   Regeneration runs (agent or script)
THEN:   Scan docs/ directory structure
AND:    Generate modules.yaml from reality
AND:    Replace old modules.yaml
```

**Effect:** Configuration matches file system.

---

## B7: Doc Ingestion Execution

**When:** Agent claims DOCS_NOT_INGESTED task (or automated)

```
GIVEN:  task_run exists for DOCS_NOT_INGESTED
WHEN:   Ingestion runs
THEN:   Identify docs not in graph
AND:    For each, create graph node
AND:    Add links to module space
```

**Effect:** All docs queryable in graph.

---

## B8: Blocker Resolution

**When:** Agent claims MODULE_BLOCKED task

```
GIVEN:  task_run exists for MODULE_BLOCKED
WHEN:   Agent investigates
THEN:   Read SYNC for blocker description
AND:    Either: resolve blocker directly
        OR: escalate to appropriate party
AND:    Update SYNC status to non-blocked
```

**Effect:** Modules unblocked or escalated.

---

## BEHAVIOR SUMMARY

| Trigger | Behavior | Output |
|---------|----------|--------|
| SYNC older than 14d | Detection | task_run created |
| modules.yaml mismatch | Detection | task_run created |
| Docs not in graph | Detection | task_run created |
| STATUS: BLOCKED | Detection | task_run created |
| Agent claims stale task | Update | SYNC refreshed |
| YAML drift detected | Regeneration | modules.yaml fixed |
| Docs missing from graph | Ingestion | Nodes created |
| Module blocked | Resolution | Unblocked or escalated |
