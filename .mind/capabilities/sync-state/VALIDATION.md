# Sync State — Validation

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
THIS:            VALIDATION.md (you are here)
IMPLEMENTATION:  ./IMPLEMENTATION.md
```

---

## PURPOSE

Invariants for valid sync state. When is the system synchronized?

---

## INVARIANTS

### V1: SYNC Freshness

```
INVARIANT: All SYNC files updated within threshold

REQUIRED:
  - Every SYNC file has LAST_UPDATED field
  - Date is within 14 days of today
  - No SYNC file is older than threshold

CHECK: For each SYNC, parse LAST_UPDATED, compare to today
```

### V2: YAML Accuracy

```
INVARIANT: modules.yaml matches file system

REQUIRED:
  - Every module in docs/ appears in modules.yaml
  - Every entry in modules.yaml exists in docs/
  - No phantom entries, no missing entries

CHECK: Compare set(modules.yaml) == set(docs/ dirs with SYNC or PATTERNS)
```

### V3: Graph Coverage

```
INVARIANT: All docs on disk exist in graph

REQUIRED:
  - Every docs/**/*.md has corresponding graph node
  - No orphan files on disk
  - Graph is complete view of documentation

CHECK: disk_docs - graph_docs == empty set
```

### V4: No Indefinite Blocks

```
INVARIANT: Blocked modules are tracked and resolved

REQUIRED:
  - STATUS: BLOCKED modules have blocker reason documented
  - Blocks don't persist more than 7 days without escalation
  - Each block has clear resolution path

CHECK: For blocked modules, verify escalation or resolution within 7d
```

### V5: SYNC Content Quality

```
INVARIANT: Updated SYNC has meaningful content

REQUIRED:
  - SYNC has STATUS field
  - SYNC has RECENT_CHANGES or equivalent
  - SYNC has HANDOFF section for continuity
  - Not just date bump — actual content

CHECK: Validate SYNC sections present and non-empty
```

---

## PRIORITY

| Priority | Meaning | If Violated |
|----------|---------|-------------|
| **CRITICAL** | System unusable | Cannot query or navigate |
| **HIGH** | Major value lost | State unknown, work blocked |
| **MEDIUM** | Partial value lost | Some drift acceptable short-term |

---

## INVARIANT INDEX

| ID | Value Protected | Priority |
|----|-----------------|----------|
| V1 | State currency | HIGH |
| V2 | Configuration accuracy | HIGH |
| V3 | Query completeness | MEDIUM |
| V4 | Flow continuity | HIGH |
| V5 | Handoff quality | MEDIUM |

---

## ERROR MESSAGES

| Violation | Message |
|-----------|---------|
| Stale SYNC | `SYNC stale: {path} last updated {n} days ago` |
| YAML drift | `modules.yaml drift: {missing} missing, {extra} extra` |
| Ingestion gap | `Not ingested: {count} docs on disk not in graph` |
| Blocked too long | `Module blocked: {module} since {date} ({n} days)` |
| Empty SYNC | `SYNC lacks content: {path} missing {sections}` |

---

## TASK COMPLETION CRITERIA

### STALE_SYNC complete when:

1. LAST_UPDATED is today
2. RECENT_CHANGES reflects actual recent work
3. HANDOFF section present and meaningful
4. Next health check passes

### YAML_DRIFT complete when:

1. modules.yaml matches docs/ structure exactly
2. No extra or missing entries
3. Validation passes

### DOCS_NOT_INGESTED complete when:

1. All docs on disk have graph nodes
2. Graph queries return expected docs
3. Ingestion verification passes

### MODULE_BLOCKED complete when:

1. STATUS no longer BLOCKED, OR
2. Escalation raised with clear owner
3. Resolution path documented
