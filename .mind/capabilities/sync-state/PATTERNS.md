# Sync State — Patterns

```
STATUS: CANONICAL
CAPABILITY: sync-state
```

---

## CHAIN

```
OBJECTIVES:      ./OBJECTIVES.md
THIS:            PATTERNS.md (you are here)
VOCABULARY:      ./VOCABULARY.md
BEHAVIORS:       ./BEHAVIORS.md
ALGORITHM:       ./ALGORITHM.md
```

---

## THE PROBLEM

State drifts. SYNC files become stale. modules.yaml stops matching reality. Docs exist on disk but not in the graph. Modules get blocked and forgotten. The system loses internal consistency.

---

## THE PATTERN

**Continuous synchronization monitoring.**

1. System monitors state indicators (SYNC freshness, YAML accuracy, graph coverage, blocker status)
2. Health checks detect drift or staleness
3. Creates task_run to restore synchronization
4. Agent claims task, loads skill
5. Skill guides through appropriate procedure
6. State synchronized, problem resolved

---

## PRINCIPLES

### Principle 1: Freshness Over Perfection

A recently-updated SYNC with incomplete info is better than a stale SYNC with complete info. Currency matters.

### Principle 2: Reality Is Source of Truth

modules.yaml, graph, and docs must match file system. When drift detected, update config/graph to match reality.

### Principle 3: Blockers Must Surface

A blocked module should never be forgotten. Either resolve or escalate — no indefinite blocking.

### Principle 4: Automation First

Detection is automated. Only resolution requires agent judgment. Minimize human attention required.

---

## DESIGN DECISIONS

### Why 14 days for STALE_SYNC?

- Short enough to catch drift
- Long enough for normal work cycles
- Matches typical sprint cadence

### Why automated YAML regeneration?

modules.yaml can be mechanically derived from file system. No judgment needed.

### Why agent for blocker resolution?

Blockers require understanding context, making decisions, possibly escalating. Cannot be scripted.

### Why ingestion as separate check?

Ingestion can fail silently. Explicit check ensures graph stays synchronized with disk.

---

## SCOPE

### In Scope

- Detecting stale SYNC files
- Detecting modules.yaml drift
- Detecting undigested docs
- Detecting blocked modules
- Creating tasks to fix these problems
- Providing skills and procedures for resolution

### Out of Scope

- Creating new documentation (create-doc-chain)
- Writing code
- Changing code behavior
- Content quality assessment
