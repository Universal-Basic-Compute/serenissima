# Sync State — Objectives

```
STATUS: CANONICAL
CAPABILITY: sync-state
```

---

## CHAIN

```
THIS:            OBJECTIVES.md (you are here)
PATTERNS:        ./PATTERNS.md
VOCABULARY:      ./VOCABULARY.md
BEHAVIORS:       ./BEHAVIORS.md
ALGORITHM:       ./ALGORITHM.md
VALIDATION:      ./VALIDATION.md
IMPLEMENTATION:  ./IMPLEMENTATION.md
HEALTH:          ./HEALTH.md
SYNC:            ./SYNC.md
```

---

## PURPOSE

Keep project state synchronized — SYNC files current, modules.yaml accurate, docs ingested, blockers resolved.

**Organ metaphor:** Homeostasis — maintains internal consistency between documentation, graph, and reality.

---

## RANKED OBJECTIVES

### O1: State Currency (Priority: Critical)

SYNC files reflect current reality. No stale state persisting beyond 14 days.

**Measure:** All SYNC files have LAST_UPDATED within 14 days.

### O2: Configuration Accuracy (Priority: Critical)

modules.yaml matches actual file system structure. No drift between config and reality.

**Measure:** modules.yaml entries 1:1 with docs/ directory structure.

### O3: Graph Completeness (Priority: High)

All documentation on disk is queryable in the graph. No orphan docs.

**Measure:** Every docs/**/*.md has corresponding graph node.

### O4: Flow Continuity (Priority: High)

No module remains blocked indefinitely. Blockers get resolved or escalated.

**Measure:** Blocked modules tracked and resolved within 7 days.

---

## NON-OBJECTIVES

- **NOT content quality** — sync-state tracks freshness, not quality
- **NOT doc creation** — that's create-doc-chain
- **NOT code changes** — we update docs and config, not source code
- **NOT manual tracking** — automated detection and task creation

---

## TRADEOFFS

- When **speed** conflicts with **thoroughness**, choose thoroughness.
- When **automation** conflicts with **human judgment**, escalate blockers to humans.
- We accept **more frequent checks** to preserve **state freshness**.

---

## SUCCESS SIGNALS

- `mind doctor` reports no STALE_SYNC or YAML_DRIFT problems
- All docs appear in graph queries
- Blocked modules get unblocked or escalated within a week
- modules.yaml always reflects reality
