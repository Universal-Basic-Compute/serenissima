# {Project} — Taxonomy: Domain Vocabulary

```
STATUS: DRAFT | REVIEW | STABLE
CREATED: {DATE}
UPDATED: {DATE}
```

---

## PURPOSE

Central vocabulary for the entire project. All modules reference this document.
New terms are proposed in module VOCABULARY.md files, then merged here after validation.

---

## TERMS

### {Term Name}

```yaml
id: term_{snake_case_name}
definition: |
  {Clear, precise definition of the term}

properties:
  - {property_1}: {description}
  - {property_2}: {description}

_meta:
  abstraction_level: {1_substrate | 2_structural | 3_dynamic | 4_phenomenal | 5_relational}
  literature_status: {L1_established | L2_fuzzy | L3_popular | L4_novel}
  importance: {1-5 stars}
  confidence: {0-100%}
  precision: {0-100%}

related_terms:
  - {other_term}: {relationship description}

_comments: |
  {Gaps, uncertainties, open questions}
```

---

## TERMINOLOGY DECISIONS

| We Use | Not | Reason |
|--------|-----|--------|
| {preferred_term} | {rejected_term} | {why} |

---

## META-ATTRIBUTE DEFINITIONS

### Abstraction Levels

| Level | Name | Description |
|-------|------|-------------|
| 1 | substrate | Physical/computational substrate |
| 2 | structural | Static organization |
| 3 | dynamic | Processes and flows |
| 4 | phenomenal | Experiential qualities |
| 5 | relational | Inter-entity relations |

### Literature Status

| Status | Description |
|--------|-------------|
| L1_established | Well-defined in academic literature |
| L2_fuzzy | Exists but definitions vary |
| L3_popular | Common usage, less rigorous |
| L4_novel | New term, defined here |

---

## MARKERS

<!-- @mind:todo {Term that needs better definition} -->
<!-- @mind:proposition {Suggested terminology change} -->
