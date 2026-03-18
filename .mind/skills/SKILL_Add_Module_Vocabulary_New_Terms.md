# Skill: `mind.add_vocabulary`
@mind:id: SKILL.DOCS.ADD.VOCABULARY

## Maps to VIEW
`VIEW_Extend_Add_Features_To_Existing.md`

---

## Context

Each module may introduce new domain terms. VOCABULARY.md captures what this module adds
to the central vocabulary. After validation, terms merge into docs/TAXONOMY.md and docs/MAPPING.md.

The module chain is:
```
OBJECTIVES → PATTERNS → VOCABULARY → BEHAVIORS → ALGORITHM → ...
```

VOCABULARY comes after PATTERNS because patterns often reveal the need for new terms.

---

## Purpose

Add new terms introduced by a module, with proposed mappings to mind schema.

---

## Inputs
```yaml
module_path: "Path to module docs"  # string (e.g., docs/physics/)
new_terms: "Terms this module introduces"  # string[]
```

## Outputs
```yaml
vocabulary_file:
  - "Created/updated VOCABULARY_{module}.md"
  - "List of proposed terms and mappings"
```

---

## Gates

| Gate | Reason |
|------|--------|
| Term doesn't exist in central TAXONOMY | New terms only |
| Term is used by this module | Don't define unused terms |
| Mapping uses valid node_type | Schema is fixed |
| PATTERNS.md exists for module | VOCABULARY comes after PATTERNS |

---

## Process

### 1. Check Central TAXONOMY
Read `docs/TAXONOMY.md` to verify term doesn't already exist.
If it does, reference it instead of redefining.

### 2. Identify New Terms
From module PATTERNS and BEHAVIORS, identify terms that need definition.

### 3. Create VOCABULARY File
Create `docs/{area}/{module}/VOCABULARY_{module}.md`:

```yaml
id: term_{snake_case_name}
definition: |
  Clear, precise definition

properties:
  - property: description

_meta:
  abstraction_level: {1-5}
  literature_status: {L1-L4}
  importance: {1-5 stars}
  confidence: {%}
  precision: {%}
```

### 4. Add mind Mapping
For each term, define how it maps to mind:
```yaml
maps_to:
  node_type: {actor | moment | narrative | space | thing}
  subtype: "{type value}"

synthesis_template: "{template}"

content_includes:
  - what goes in content
```

### 5. Mark as PROPOSED
Set STATUS: PROPOSED until merged into central docs.

### 6. Track Merge Status
Add checklist:
- [ ] Terms reviewed
- [ ] Mappings validated
- [ ] Merged to docs/TAXONOMY.md
- [ ] Merged to docs/MAPPING.md

---

## Procedures Referenced

| Protocol | When | Creates |
|----------|------|---------|
| `add_patterns` | If new pattern emerges from vocabulary | PATTERNS update |
| `update_sync` | After creating VOCABULARY | SYNC update |

---

## Post-Validation Merge

After vocabulary is validated:
1. Use `SKILL_Define_Project_Taxonomy_Central_Vocabulary.md` to merge terms
2. Use `SKILL_Define_Project_Mapping_Mind_Translation.md` to merge mappings
3. Update VOCABULARY.md merge status checklist

---

## Evidence
- Docs: `docs/{area}/{module}/VOCABULARY_{module}.md`
- Central: `docs/TAXONOMY.md`, `docs/MAPPING.md`
- Template: `.mind/templates/VOCABULARY_TEMPLATE.md`

## Markers
- `@mind:TODO` — Term needing clarification before merge
- `@mind:proposition` — Suggested terminology change

## Never-stop
If blocked → `@mind:escalation` + `@mind:proposition` → proceed with proposition.
