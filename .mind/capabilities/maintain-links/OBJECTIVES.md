# Maintain Links — Objectives

```
STATUS: CANONICAL
CAPABILITY: maintain-links
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

Maintain bidirectional links between code and documentation. Ensure IMPL: markers point to real files and docs have corresponding code references.

**Organ metaphor:** Connective tissue — maintains structural integrity between code and docs.

---

## RANKED OBJECTIVES

### O1: Link Integrity (Priority: Critical)

Every IMPL: marker in documentation must point to an existing file.

**Measure:** Zero broken IMPL links across all docs.

### O2: No Orphan Docs (Priority: High)

Documentation files must have corresponding code. Orphan docs mislead agents.

**Measure:** Every doc has either IMPL: links to existing code or DOCS: markers from code pointing to it.

### O3: Bidirectional Traceability (Priority: High)

Code-to-doc and doc-to-code links form complete graph. No one-way references.

**Measure:** For every IMPL: in doc, there's a DOCS: in code. For every DOCS: in code, there's an IMPL: in doc.

### O4: Automatic Detection (Priority: Medium)

Link issues surface automatically, not through manual inspection.

**Measure:** Health checks detect issues within 24h of occurrence.

---

## NON-OBJECTIVES

- **NOT code creation** — Fixes links, doesn't write missing code
- **NOT doc creation** — Fixes links, doesn't write missing docs
- **NOT content validation** — Only checks link existence, not content quality

---

## TRADEOFFS

- When **speed** conflicts with **completeness**, choose completeness.
- When **aggressive deletion** conflicts with **preservation**, preserve and flag.
- We accept **manual review** for ambiguous orphan situations.

---

## SUCCESS SIGNALS

- `mind doctor` reports no ORPHAN_DOCS or BROKEN_IMPL_LINK problems
- Refactors automatically update affected links
- Agents trust that doc links lead to real code
