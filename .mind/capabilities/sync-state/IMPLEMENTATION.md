# Sync State — Implementation

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
THIS:            IMPLEMENTATION.md (you are here)
HEALTH:          ./HEALTH.md
SYNC:            ./SYNC.md
```

---

## PURPOSE

Where sync-state code lives and how it's structured.

---

## FILE STRUCTURE

```
capabilities/sync-state/                    # Self-contained capability
├── OBJECTIVES.md
├── PATTERNS.md
├── VOCABULARY.md
├── BEHAVIORS.md
├── ALGORITHM.md
├── VALIDATION.md
├── IMPLEMENTATION.md                       # You are here
├── HEALTH.md
├── SYNC.md
├── tasks/
│   ├── TASK_update_sync.md                 # For STALE_SYNC
│   ├── TASK_regenerate_yaml.md             # For YAML_DRIFT
│   ├── TASK_ingest_docs.md                 # For DOCS_NOT_INGESTED
│   └── TASK_unblock_module.md              # For MODULE_BLOCKED
├── skills/
│   └── SKILL_update_sync.md                # Agent skill for SYNC updates
├── procedures/
│   └── PROCEDURE_update_sync.yaml          # Step-by-step procedure
└── runtime/                                # MCP-executable code
    ├── __init__.py                         # Exports CHECKS list
    └── checks.py                           # @check decorated functions
```

### After `mind init`

```
.mind/capabilities/sync-state/              # Full copy
└── [same structure]
```

---

## KEY COMPONENTS

### Runtime Code

```python
# capabilities/sync-state/runtime/checks.py

from mind.capability import check, Signal, triggers

@check(
    id="sync_freshness",
    triggers=[
        triggers.cron.daily(),
        triggers.command.on("mind doctor"),
    ],
    on_problem="STALE_SYNC",
    task="TASK_update_sync",
)
def sync_freshness(ctx) -> dict:
    """H1: Check if SYNC files are fresh."""
    stale = check_sync_freshness(ctx.project_root)

    if not stale:
        return Signal.healthy()

    return Signal.degraded(
        stale_count=len(stale),
        stale_files=[s["path"] for s in stale]
    )


@check(
    id="yaml_drift",
    triggers=[
        triggers.cron.daily(),
        triggers.file.on_change("docs/**"),
    ],
    on_problem="YAML_DRIFT",
    task="TASK_regenerate_yaml",
)
def yaml_drift(ctx) -> dict:
    """H2: Check if modules.yaml matches reality."""
    result = check_yaml_drift(ctx.project_root)

    if not result.get("drifted"):
        return Signal.healthy()

    return Signal.degraded(
        missing=result.get("missing_from_yaml", []),
        extra=result.get("extra_in_yaml", [])
    )


@check(
    id="ingestion_coverage",
    triggers=[
        triggers.command.on("mind doctor"),
        triggers.command.on("mind sync"),
    ],
    on_problem="DOCS_NOT_INGESTED",
    task="TASK_ingest_docs",
)
def ingestion_coverage(ctx) -> dict:
    """H3: Check if all docs are in graph."""
    result = check_ingestion_coverage(ctx.project_root, ctx.graph)

    not_ingested = result.get("not_ingested", [])
    if not not_ingested:
        return Signal.healthy()

    return Signal.degraded(
        not_ingested_count=len(not_ingested),
        not_ingested=not_ingested[:10]  # Limit for display
    )


@check(
    id="blocked_modules",
    triggers=[
        triggers.cron.daily(),
        triggers.command.on("mind status"),
    ],
    on_problem="MODULE_BLOCKED",
    task="TASK_unblock_module",
)
def blocked_modules(ctx) -> dict:
    """H4: Check for blocked modules."""
    blocked = check_blocked_modules(ctx.project_root)

    if not blocked:
        return Signal.healthy()

    # Critical if blocked > 7 days
    long_blocked = [b for b in blocked if b.get("days_blocked", 0) > 7]

    if long_blocked:
        return Signal.critical(
            blocked=blocked,
            long_blocked=long_blocked
        )

    return Signal.degraded(blocked=blocked)
```

### Task Templates

See `tasks/TASK_*.md` for each problem type.

### Skills

See `skills/SKILL_update_sync.md` for the agent skill.

### Procedures

See `procedures/PROCEDURE_update_sync.yaml` for the step-by-step procedure.

---

## INTEGRATION POINTS

### Triggers

| Trigger | When | Calls |
|---------|------|-------|
| cron:daily | Every 24h | H1, H2, H4 |
| file_watch | docs/** changes | H2 |
| mind doctor | CLI command | H1, H2, H3, H4 |
| mind sync | CLI command | H3 |
| mind status | CLI command | H4 |

### Graph Nodes Created

| Node | Type | When |
|------|------|------|
| task_run | narrative:task_run | on_signal degraded/critical |
| doc nodes | thing:doc | After ingestion |

### Links Created

| From | To | Nature |
|------|-----|--------|
| task_run | TASK_* | serves |
| task_run | target module | concerns |
| task_run | problem | resolves |
| agent | task_run | claims |

---

## EXECUTION MODES

### Automated (Script)

- YAML_DRIFT: Can be fully scripted — regenerate from fs
- DOCS_NOT_INGESTED: Can be fully scripted — run ingest_docs

### Agent Required

- STALE_SYNC: Agent summarizes changes, writes meaningful SYNC
- MODULE_BLOCKED: Agent investigates, decides resolution
