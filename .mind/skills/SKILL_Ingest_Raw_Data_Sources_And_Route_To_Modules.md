# Skill: `mind.ingest_raw_data_sources`
@mind:id: SKILL.INGEST.RAW_DATA.ROUTE_TO_MODULES

## Maps to VIEW

---

## Context

Ingestion in mind = parsing raw inputs and routing to modules before any edits.

Raw inputs: chat exports, PDFs, research notes, feature requests, bug reports.

Routing table: Deterministic mapping from data items to target modules and doc chain targets.

```yaml
routing_table:
  - data_item: "user auth feature request"
    target_area: "backend"
    target_module: "auth"
    doc_chain_targets: [PATTERNS, BEHAVIORS, VALIDATION]
```

No edits without routing: The routing table must exist before any code/doc changes. This prevents scattered, untracked changes.

Ambiguous routing: If target is unclear, log `@mind:escalation` and route clear items first. Don't guess.

---

## Purpose
Parse and route raw inputs into areas/modules/tasks; produce deterministic routing table and seed TODOs.

---

## Inputs
```yaml
data_sources:
  - "<path or url>"        # list of raw inputs
scope_hints:               # optional filters
  areas: ["<area>"]
  modules: ["<module>"]
```

## Outputs
```yaml
routing_table:
  - data_item: "<name>"
    target_area: "<area>"
    target_module: "<module>"
    doc_chain_targets: ["<doc types>"]
    implementation_surfaces: ["<file:symbol>"]
seeded_todos:
  - module: "<area/module>"
    todo: "@mind:TODO <plan>"
```

---

## Gates

- No code/doc edits until routing table exists — prevents scattered changes
- If routing ambiguous → `@mind:escalation`, route clear items first — don't guess

---

## Process

### 1. Parse raw inputs
```yaml
batch_questions:
  - format: "What format is each input (chat, PDF, markdown, etc.)?"
  - items: "What distinct items/topics are in the input?"
  - scope: "Are there scope hints to filter by area/module?"
```

### 2. Identify target modules
For each item, determine:
- Which area (backend, frontend, infra, etc.)
- Which module within area
- Which doc chain types need updating

### 3. Handle ambiguity
If target unclear:
- Log `@mind:escalation` with the ambiguous item
- Route clear items first
- Return to ambiguous items after escalation resolved

### 4. Produce routing table
Deterministic mapping. Each item has one target.

### 5. Seed TODOs
For each routed item, create `@mind:TODO` in target module's SYNC.

---

## Procedures Referenced

| Protocol | When | Creates |
|----------|------|---------|
| `protocol:explore_space` | Before routing | Understand existing modules |
| `protocol:record_work` | After routing complete | progress moment |

---

## Evidence
- Docs: `@mind:id + file + header`
- Code: `file + symbol`

## Markers
- `@mind:TODO`
- `@mind:escalation`
- `@mind:proposition`

## Never-stop
If blocked → `@mind:escalation` + `@mind:proposition` → proceed with proposition.
