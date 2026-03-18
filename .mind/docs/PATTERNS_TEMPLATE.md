# {Module Name} — Patterns: {Brief Design Philosophy Description}

```
STATUS: DRAFT | REVIEW | STABLE
CREATED: {DATE}
VERIFIED: {DATE} against {COMMIT}
```

---

## CHAIN

```
OBJECTIVES:      ./OBJECTIVES_{name}.md
BEHAVIORS:      ./BEHAVIORS_*.md
THIS:            PATTERNS_*.md (you are here)
MECHANISMS:     ./MECHANISMS_*.md (if applicable)
ALGORITHM:       ./ALGORITHM_*.md
VALIDATION:      ./VALIDATION_{name}.md
HEALTH:          ./HEALTH_{name}.md
IMPLEMENTATION:  ./IMPLEMENTATION_{name}.md
SYNC:            ./SYNC_{name}.md

IMPL:            {path/to/main/source/file.py}
```

### Bidirectional Contract

**Before modifying this doc or the code:**
1. Read ALL docs in this chain first
2. Read the linked IMPL source file

**After modifying this doc:**
1. Update the IMPL source file to match, OR
2. Add a TODO in SYNC_*.md: "Docs updated, implementation needs: {what}"
3. Run tests: `{test command}`

**After modifying the code:**
1. Update this doc chain to match, OR
2. Add a TODO in SYNC_*.md: "Implementation changed, docs need: {what}"
3. Run tests: `{test command}`

---

## THE PROBLEM

{What problem does this module solve?}
{What's wrong with NOT having this?}
{What pain does this address?}

---

## THE PATTERN

{What is the core design approach?}
{What shape does the solution take?}
{What's the key insight that makes this work?}

---

## BEHAVIORS SUPPORTED

- {Behavior ID} — {short explanation of how this pattern enables it}
- {Behavior ID} — {short explanation}

## BEHAVIORS PREVENTED

- {Anti-behavior ID} — {short explanation of how this pattern blocks it}

---

## PRINCIPLES

### Principle 1: {Name}

{Description of principle}
{Why this matters}

### Principle 2: {Name}

{Description of principle}
{Why this matters}

### Principle 3: {Name}

{Description of principle}
{Why this matters}

---

## DATA

| Source | Type | Purpose / Description |
|--------|------|-----------------------|
| {path/to/data} | FILE | {What this file contains} |
| {https://url} | URL | {Why this external data matters} |
| {description} | OTHER | {Other data sources} |

---

## DEPENDENCIES

| Module | Why We Depend On It |
|--------|---------------------|
| {path} | {reason} |
| {path} | {reason} |

---

## INSPIRATIONS

{What prior art informed this design?}
{What patterns from other systems?}
{What literature or theory applies?}

---

## SCOPE

### In Scope

- {Core responsibility 1}
- {Core responsibility 2}
- {What this module owns}

### Out of Scope

- {What this explicitly does NOT handle} → see: {other-module}
- {Common misconception about what belongs here}
- {Limitation that's by design, not oversight}

---

## MARKERS

> See PRINCIPLES.md "Feedback Loop" section for marker format and usage.

<!-- @mind:todo {Actionable task that needs doing} -->
<!-- @mind:proposition {Improvement idea or future possibility} -->
<!-- @mind:escalation {Blocker or decision needed from human} -->
