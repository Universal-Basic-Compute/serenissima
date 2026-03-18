# Fix Membrane — Patterns

```
STATUS: CANONICAL
CAPABILITY: fix-membrane
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

Procedure files are YAML. YAML is unforgiving. A missing colon, wrong indent, or invalid field breaks the entire procedure. The membrane system can't execute what it can't parse.

---

## THE PATTERN

**Layered validation with targeted repair.**

1. Layer 1: YAML syntax — can we parse it at all?
2. Layer 2: Schema structure — does it have required fields?
3. Layer 3: Step validity — is each step well-formed?
4. Layer 4: Semantic checks — do references resolve?

Each layer has its own detection and repair strategy.

---

## PRINCIPLES

### Principle 1: Parse Before Validate

Don't assume structure. Try to parse first. If parsing fails, fix syntax before checking schema.

### Principle 2: Minimal Repair

Fix exactly what's broken. Don't restructure working procedures. Preserve author intent.

### Principle 3: Escalate Ambiguity

If the correct fix is unclear, create task for human review. Don't guess.

### Principle 4: Template as Reference

Use canonical procedure templates to know what's expected. Compare, don't assume.

---

## DESIGN DECISIONS

### Why separate from create-doc-chain?

Create-doc-chain handles documentation. Fix-membrane handles runtime configuration. Different domains, different expertise, different failure modes.

### Why not auto-fix everything?

Some errors have multiple valid fixes. YAML indentation errors might mean "this should be nested" or "this should be siblings." Human judgment needed.

### Why YAML specifically?

Procedures are YAML by design. YAML errors are the most common membrane failure. Focused capability = better detection.

---

## SCOPE

### In Scope

- Detecting missing procedures
- Fixing YAML syntax errors
- Validating procedure structure
- Adding missing required fields

### Out of Scope

- Writing new procedures
- Semantic procedure validation
- Runtime execution issues
- Template creation
