---
name: Define Project Taxonomy Central Vocabulary
---

# Skill: `mind.define_taxonomy`
@mind:id: SKILL.DOCS.DEFINE.TAXONOMY

## Maps to VIEW
`VIEW_Specify_Design_Vision_And_Architecture.md`

---

## Context

TAXONOMY.md lives at `docs/TAXONOMY.md` and is the central vocabulary for the entire project.
All modules reference it. New terms are proposed in module VOCABULARY.md files, then merged here.

The mind schema is FIXED (5 node types, 1 link type). TAXONOMY defines domain vocabulary
that gets MAPPED to this schema (see MAPPING.md).

---

## Purpose

Define or update the central project vocabulary with new domain terms.

---

## Inputs
```yaml
terms: "List of domain terms to define"  # string[]
source: "Where these terms come from (module, external doc, conversation)"  # string
```

## Outputs
```yaml
taxonomy_update:
  - "Updated docs/TAXONOMY.md"
  - "List of terms added/modified"
```

---

## Gates

| Gate | Reason |
|------|--------|
| Term doesn't already exist in TAXONOMY | Avoid duplicates |
| Definition is precise and actionable | Fuzzy terms cause confusion |
| Meta-attributes are complete | Required for consistency |
| Related terms are linked | Terms don't exist in isolation |

---

## Process

### 1. Check Existing Terms
Read `docs/TAXONOMY.md` to see what already exists.
If term exists, decide: update or skip.

### 2. Define Term Structure
For each new term, create:
```yaml
id: term_{snake_case_name}
definition: |
  Clear, precise definition

properties:
  - property_name: description

_meta:
  abstraction_level: {1-5}
  literature_status: {L1-L4}
  importance: {1-5 stars}
  confidence: {%}
  precision: {%}

related_terms:
  - other_term: relationship
```

### 3. Add to TAXONOMY.md
Insert in alphabetical order within TERMS section.

### 4. Update Terminology Decisions
If this term replaces another, add to TERMINOLOGY DECISIONS table.

---

## Procedures Referenced

| Protocol | When | Creates |
|----------|------|---------|
| `define_space` | Exploring term relationships | Term graph |
| `update_sync` | After major changes | SYNC update |

---

## Evidence
- Docs: `docs/TAXONOMY.md`
- Template: `.mind/templates/TAXONOMY_TEMPLATE.md`

## Markers
- `@mind:TODO` — Term needing better definition
- `@mind:proposition` — Suggested terminology change

## Never-stop
If blocked → `@mind:escalation` + `@mind:proposition` → proceed with proposition.
