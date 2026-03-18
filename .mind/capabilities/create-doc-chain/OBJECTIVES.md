# Create Doc Chain — Objectives

```
STATUS: CANONICAL
CAPABILITY: create-doc-chain
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

Create missing documentation for code that exists but isn't documented.

**Organ metaphor:** Memory — crystallizes knowledge into persistent, retrievable form.

---

## RANKED OBJECTIVES

### O1: Documentation Existence (Priority: Critical)

Every module with code must have corresponding documentation.

**Measure:** No code paths exist without doc chain coverage.

### O2: Template Consistency (Priority: Critical)

All docs follow canonical templates. No drift, no custom formats.

**Measure:** Every doc file passes template validation.

### O3: Chain Completeness (Priority: High)

Doc chains are complete — no missing files in the sequence.

**Measure:** OBJECTIVES → PATTERNS → ... → SYNC all present.

### O4: Accuracy (Priority: High)

Docs reflect actual code behavior, not aspirational descriptions.

**Measure:** VERIFIED field matches recent commit.

---

## NON-OBJECTIVES

- **NOT creative writing** — Docs describe reality, not vision
- **NOT retroactive justification** — If design is bad, doc says so
- **NOT one-time** — Runs continuously as code changes

---

## TRADEOFFS

- When **speed** conflicts with **completeness**, choose completeness.
- When **brevity** conflicts with **clarity**, choose clarity.
- We accept **longer docs** to preserve **full context**.

---

## SUCCESS SIGNALS

- `mind doctor` reports no UNDOCUMENTED problems
- New code triggers doc creation tasks automatically
- Agents understand any module by reading its doc chain
