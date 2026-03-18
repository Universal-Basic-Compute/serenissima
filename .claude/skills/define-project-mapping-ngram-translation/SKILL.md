---
name: Define Project Mapping Ngram Translation
---

# Skill: `mind.define_mapping`
@mind:id: SKILL.DOCS.DEFINE.MAPPING

## Maps to VIEW
`VIEW_Specify_Design_Vision_And_Architecture.md`

---

## Context

MAPPING.md lives at `docs/MAPPING.md` and translates domain vocabulary to the mind universal schema.

The mind schema is FIXED:
- 5 node_types: actor, moment, narrative, space, thing
- 1 link_type: link (all semantics in properties)
- Core fields: id, name, node_type, type, weight, energy, synthesis, embedding, content

Backend differences:
- FalkorDB: node_type is a field
- Neo4j: node_type is a label

---

## Purpose

Define or update how domain terms translate to the mind universal schema.

---

## Inputs
```yaml
terms: "List of domain terms to map"  # string[]
taxonomy_ref: "Reference to TAXONOMY entries"  # string
```

## Outputs
```yaml
mapping_update:
  - "Updated docs/MAPPING.md"
  - "List of mappings added/modified"
```

---

## Gates

| Gate | Reason |
|------|--------|
| Term exists in TAXONOMY.md | Can't map undefined terms |
| node_type is valid (actor/moment/narrative/space/thing) | Schema is fixed |
| synthesis_template produces embeddable text | Required for retrieval |
| No custom fields created | Everything goes in content/synthesis |

---

## Process

### 1. Check Term in TAXONOMY
Verify the term is defined in `docs/TAXONOMY.md`.

### 2. Determine node_type
Choose the appropriate mind node type:
- actor: entities that act (users, agents, characters)
- moment: events, decisions, actions in time
- narrative: beliefs, patterns, documentation, issues
- space: containers, modules, areas
- thing: files, artifacts, URIs

### 3. Define Mapping Structure
```yaml
domain_term: "{Term from TAXONOMY}"
maps_to:
  node_type: {actor | moment | narrative | space | thing}
  subtype: "{specific type value}"

synthesis_template: |
  Template for generating synthesis field
  Example: "{name} — {brief description} ({context})"

content_includes:
  - What goes in content field
  - Additional details
  - Reference IDs, metadata, etc.
```

### 4. Define Link Mappings (if relationships)
```yaml
domain_relationship: "{Relationship from TAXONOMY}"
maps_to:
  polarity: [{a_to_b}, {b_to_a}]
  hierarchy: {-1 to +1}
  permanence: {0 to 1}
```

### 5. Add to MAPPING.md
Insert in NODE MAPPINGS or LINK MAPPINGS section.

---

## Procedures Referenced

| Protocol | When | Creates |
|----------|------|---------|
| `add_patterns` | When mapping reveals design decisions | PATTERNS update |
| `update_sync` | After major changes | SYNC update |

---

## Evidence
- Docs: `docs/MAPPING.md`
- Schema: `docs/schema/schema.yaml`
- Template: `.mind/templates/MAPPING_TEMPLATE.md`

## Markers
- `@mind:TODO` — Mapping that needs clarification
- `@mind:proposition` — Suggested mapping improvement

## Never-stop
If blocked → `@mind:escalation` + `@mind:proposition` → proceed with proposition.
