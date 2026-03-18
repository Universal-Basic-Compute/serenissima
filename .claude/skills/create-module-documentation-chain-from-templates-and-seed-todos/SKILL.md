---
name: Create Module Documentation Chain From Templates And Seed Todos
---

# Skill: `mind.create_module_documentation`
@mind:id: SKILL.DOCS.CREATE_CHAIN_FROM_TEMPLATES.SEED_TODOS

## Maps to VIEW

---

## Context

Doc chains in mind follow: [CONCEPT →] OBJECTIVES → PATTERNS → BEHAVIORS → ALGORITHM → VALIDATION → IMPLEMENTATION → HEALTH → SYNC.

CONCEPT is optional — only when the module introduces a cross-cutting idea that spans multiple modules.

Each doc type has specific purpose:
- CONCEPT: Cross-cutting idea definition (optional, for ideas spanning modules)
- OBJECTIVES: Ranked goals, what we optimize for, tradeoffs
- PATTERNS: Design decisions, why this shape
- BEHAVIORS: Observable effects, what it does
- ALGORITHM: Procedures, how it works
- VALIDATION: Invariants, what must be true
- IMPLEMENTATION: Code architecture, where code lives
- HEALTH: Runtime verification, how to check
- SYNC: Current state, handoff info

Bidirectional pointers:
- Docs reference code: `file:symbol` in IMPLEMENTATION docking points
- Code references docs: `# DOCS: path/to/PATTERNS.md` comment in source files

Templates live in `.mind/templates/`. Copy verbatim, fill placeholders.

---

## Purpose
Create module doc directory, copy templates into full chain, add TODO plans, establish doc↔code pointers.

---

## Inputs
```yaml
module: "<area/module>"           # string, e.g., "physics/tick"
templates_root: "<path>"          # string, default ".mind/templates"
```

## Outputs
```yaml
created_files:
  - "docs/<area>/<module>/CONCEPT_*.md"        # (optional)
  - "docs/<area>/<module>/OBJECTIVES_*.md"
  - "docs/<area>/<module>/PATTERNS_*.md"
  - "docs/<area>/<module>/BEHAVIORS_*.md"
  - "docs/<area>/<module>/ALGORITHM_*.md"
  - "docs/<area>/<module>/VALIDATION_*.md"
  - "docs/<area>/<module>/IMPLEMENTATION_*.md"
  - "docs/<area>/<module>/HEALTH_*.md"
  - "docs/<area>/<module>/SYNC_*.md"
todos_added:
  - file: "<path>"
    todo: "@mind:TODO <plan>"
```

---

## Gates

- Must use templates verbatim as base — prevents inconsistent structure
- Must add at least one `@mind:TODO` per doc — tracks what needs filling
- Must establish bidirectional pointers — docs→code and code→docs

---

## Process

### 1. Check existing state
```yaml
batch_questions:
  - exists: "Does docs/<area>/<module>/ already exist?"
  - partial: "If partial, which docs are missing?"
  - code_exists: "Does the code at <module> path exist?"
```
If docs exist → extend, don't overwrite.

### 2. Create directory and copy templates
Copy each template, rename with module context:
- `PATTERNS_TEMPLATE.md` → `PATTERNS_<Module_Name>.md`

### 3. Add TODOs
Each doc gets at least one `@mind:TODO` describing what to fill:
```markdown
@mind:TODO Fill PATTERNS with design decisions for <module>
```

### 4. Establish pointers
- In IMPLEMENTATION: Add docking points referencing code files
- In code files: Add `# DOCS: docs/<area>/<module>/PATTERNS_*.md`

---

## Procedures Referenced

| Protocol | When | Creates |
|----------|------|---------|
| `protocol:explore_space` | Before creating | Check what exists |
| `protocol:create_doc_chain` | To create docs | Full doc chain (NOT YET IMPLEMENTED) |

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
