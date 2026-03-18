# {Project} — Mapping: Translation to mind Schema

```
STATUS: DRAFT | REVIEW | STABLE
CREATED: {DATE}
UPDATED: {DATE}
```

---

## PURPOSE

Translates domain vocabulary (TAXONOMY) to the universal mind schema.
All modules reference this. New mappings are proposed in VOCABULARY.md, then merged here.

---

## MIND UNIVERSAL SCHEMA

The schema is **FIXED**. We map TO it, never extend it.

**Reference:** `docs/schema/schema.yaml`

### Key Points

- **node_type** (enum): `actor`, `moment`, `narrative`, `space`, `thing`
- **link type**: `link` — ONE type, all semantics in properties
- **Subtypes**: via `type` field (string, nullable)

### Backend Notes

| Backend | node_type | Subtype |
|---------|-----------|---------|
| FalkorDB | `node_type` field | `type` field |
| Neo4j | Node label | `type` field |

### Why No Custom Fields

- mind never does Cypher queries
- All retrieval is embedding-based
- `synthesis` = embeddable summary (for search)
- `content` = full prose/details (for display)

---

## NODE MAPPINGS

### {Domain Term} → {node_type}

```yaml
domain_term: "{Term from TAXONOMY}"
maps_to:
  node_type: {actor | moment | narrative | space | thing}
  subtype: "{specific type value}"

synthesis_template: |
  {Template for generating synthesis field}
  Example: "{name} — {brief description} ({context})"

content_includes:
  - {What goes in content field}
  - {Additional details}
  - {Reference IDs, metadata, etc.}

example:
  domain: "{Example from domain}"
  synthesis: "{Generated synthesis}"
  content: |
    {Generated content}
```

---

## LINK MAPPINGS

### {Relationship} → link properties

```yaml
domain_relationship: "{Relationship from TAXONOMY}"
maps_to:
  polarity: [{a_to_b}, {b_to_a}]  # [0-1, 0-1]
  hierarchy: {-1 to +1}           # -1=contains, +1=elaborates
  permanence: {0 to 1}            # 0=speculative, 1=definitive

synthesis_template: |
  {Template for link synthesis}
  Example: "{node_a.name} {verb} {node_b.name}"
```

---

## COMMON PATTERNS

### Documentation → Narrative

```yaml
doc_type: "PATTERNS.md"
maps_to:
  node_type: narrative
  subtype: pattern
synthesis_template: "{module} patterns — {brief description}"
```

### Code Directory → Space

```yaml
code_pattern: "src/{module}/"
maps_to:
  node_type: space
  subtype: module
synthesis_template: "{module} module — {purpose}"
```

### Source File → Thing

```yaml
file_pattern: "*.py"
maps_to:
  node_type: thing
  subtype: file
synthesis_template: "{filename} — {primary responsibility}"
```

---

## MARKERS

<!-- @mind:todo {Mapping that needs clarification} -->
<!-- @mind:proposition {Suggested mapping improvement} -->
