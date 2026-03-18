# Sync State — Sync

```
STATUS: CANONICAL
LAST_UPDATED: 2025-12-29
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
HEALTH:          ./HEALTH.md
THIS:            SYNC.md (you are here)
```

---

## CURRENT STATE

### Maturity

| Component | Status |
|-----------|--------|
| OBJECTIVES | Canonical |
| PATTERNS | Canonical |
| VOCABULARY | Canonical |
| BEHAVIORS | Canonical |
| ALGORITHM | Canonical |
| VALIDATION | Canonical |
| IMPLEMENTATION | Canonical |
| HEALTH | Canonical |

### Problems Owned

| Problem | Severity | Status |
|---------|----------|--------|
| STALE_SYNC | warning | Defined |
| YAML_DRIFT | warning | Defined |
| DOCS_NOT_INGESTED | warning | Defined |
| MODULE_BLOCKED | high | Defined |

### Artifacts

| Artifact | Status |
|----------|--------|
| tasks/TASK_update_sync.md | Complete |
| tasks/TASK_regenerate_yaml.md | Complete |
| tasks/TASK_ingest_docs.md | Complete |
| tasks/TASK_unblock_module.md | Complete |
| skills/SKILL_update_sync.md | Complete |
| procedures/PROCEDURE_update_sync.yaml | Complete |
| runtime/checks.py | Pending implementation |

---

## RECENT CHANGES

### 2025-12-29

- Created full doc chain for sync-state capability
- Defined 4 problems in VOCABULARY:
  - STALE_SYNC: SYNC not updated in 14+ days
  - YAML_DRIFT: modules.yaml out of sync
  - DOCS_NOT_INGESTED: Docs on disk but not in graph
  - MODULE_BLOCKED: Module SYNC shows BLOCKED status
- Defined 4 health indicators (H1-H4) with on_signal handlers
- Created task templates for each problem
- Created SKILL_update_sync for agent guidance
- Created PROCEDURE_update_sync for structured execution

---

## NEXT STEPS

1. **Implement runtime checks** — runtime/checks.py with @check decorators
2. **Test detection** — Verify each problem type detected correctly
3. **Test task creation** — Verify on_signal creates proper task_runs
4. **Integration test** — Full flow from detection to resolution

---

## HANDOFF

**For next agent:**

The sync-state capability doc chain is complete. It defines:
- 4 problems (STALE_SYNC, YAML_DRIFT, DOCS_NOT_INGESTED, MODULE_BLOCKED)
- 4 health indicators with on_signal handlers
- 4 task templates
- 1 skill (SKILL_update_sync)
- 1 procedure (PROCEDURE_update_sync)

Next work is implementing the Python runtime checks.

**Agent subtype:** groundwork (building runtime implementation)
