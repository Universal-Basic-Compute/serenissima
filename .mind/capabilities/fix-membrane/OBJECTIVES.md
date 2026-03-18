# Fix Membrane — Objectives

```
STATUS: CANONICAL
CAPABILITY: fix-membrane
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

Detect and repair broken procedure YAML files that prevent the membrane system from executing.

**Organ metaphor:** Immune system — identifies and repairs structural damage to the communication layer.

---

## RANKED OBJECTIVES

### O1: Procedure Availability (Priority: Critical)

Every project must have executable procedures. Empty .mind/procedures/ breaks the membrane entirely.

**Measure:** At least one valid procedure file exists in .mind/procedures/.

### O2: YAML Validity (Priority: Critical)

Procedure files must parse. Syntax errors block loading entirely.

**Measure:** All .yaml files in procedures/ parse without error.

### O3: Step Structure Integrity (Priority: High)

Each procedure step must have required fields with correct types.

**Measure:** All steps pass schema validation.

### O4: Field Completeness (Priority: High)

Procedures must have all required metadata (name, steps, etc.).

**Measure:** All procedures have required root fields.

---

## NON-OBJECTIVES

- **NOT authoring procedures** — This fixes broken ones, not creates new
- **NOT semantic validation** — We check structure, not meaning
- **NOT runtime debugging** — We fix static files, not execution issues

---

## TRADEOFFS

- When **fixing** conflicts with **preserving intent**, prefer preserving intent.
- When **automatic fix** conflicts with **accuracy**, prefer accuracy (escalate).
- We accept **manual review** to ensure **correct repairs**.

---

## SUCCESS SIGNALS

- `mind doctor` reports no MEMBRANE_* problems
- All procedure files load without error
- `procedure_list` MCP tool returns valid procedures
