# Fill Gaps — Patterns

```
STATUS: CANONICAL
CAPABILITY: fill-gaps
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

Documentation degrades over time:
- Authors leave gaps marked with `@mind:gap` intending to return
- Copy-paste spreads content across multiple files
- SYNC files accumulate entries, growing past useful size

Without intervention, gaps become permanent, duplicates diverge, and large docs become unnavigable.

---

## THE PATTERN

**Detection-driven documentation repair.**

1. System detects gaps, duplicates, or oversized docs (HEALTH triggers)
2. Creates task_run to fix the issue
3. Agent claims task, loads skill
4. Skill guides through appropriate procedure
5. Content fixed, validated, problem resolved

---

## PRINCIPLES

### Principle 1: Marker-Based Detection

`@mind:gap` markers are explicit requests for content. Scan for them, don't guess.

### Principle 2: Similarity-Based Deduplication

Use content similarity (embedding or ngram) to detect duplication. Threshold: >30% overlap.

### Principle 3: Line-Based Sizing

Simple line count. 200 lines is the threshold. No exceptions for "but it's all necessary."

### Principle 4: Canonical Source Selection

When deduplicating, the canonical source is:
1. The more complete version, or
2. The older version if equal, or
3. The one in a more appropriate location

---

## DESIGN DECISIONS

### Why 200 lines?

- Fits in typical context window without chunking
- Forces authors to think about structure
- SYNC files especially benefit from archival

### Why not auto-fill gaps?

Gaps often require human judgment or research. Agent can:
- Research and propose content
- Escalate if uncertain
- Fill obvious gaps from code context

### Why detect duplication?

- Maintenance burden: update N copies
- Drift risk: copies diverge
- Confusion: which is authoritative?

---

## SCOPE

### In Scope

- Detecting and filling `@mind:gap` markers
- Detecting and consolidating duplicate content
- Detecting and splitting large docs
- Archiving old SYNC entries

### Out of Scope

- Creating new documentation (create-doc-chain capability)
- Fixing template structure (create-doc-chain capability)
- Code refactoring
