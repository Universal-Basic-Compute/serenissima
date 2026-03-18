# {Module Name} — Vocabulary: New Terms

```
STATUS: PROPOSED
CREATED: {DATE}
MODULE: {area}/{module}
```

---

## CHAIN

```
OBJECTIVES:      ./OBJECTIVES_{name}.md
PATTERNS:        ./PATTERNS_{name}.md
THIS:            VOCABULARY_{name}.md (you are here)
BEHAVIORS:       ./BEHAVIORS_{name}.md
ALGORITHM:       ./ALGORITHM_{name}.md
```

---

## PURPOSE

New terms introduced by this module. After validation, merge into:
- `docs/TAXONOMY.md` — term definitions
- `docs/MAPPING.md` — mind translations

If this module introduces NO new terms, this file can be minimal or omitted.

---

## NEW TERMS

### {Term Name}

```yaml
id: term_{snake_case_name}
definition: |
  {Clear, precise definition}

properties:
  - {property}: {description}

_meta:
  abstraction_level: {1-5}
  literature_status: {L1-L4}
  importance: {1-5 stars}
  confidence: {%}
  precision: {%}

related_terms:
  - {existing_term}: {relationship}
```

**Mapping to mind:**

```yaml
maps_to:
  node_type: {actor | moment | narrative | space | thing}
  subtype: "{type value}"

synthesis_template: "{template}"

content_includes:
  - {what goes in content}
```

---

## NEW RELATIONSHIPS

### {Relationship Name}

```yaml
definition: |
  {What this relationship represents}

between:
  - {source_term} → {target_term}

maps_to:
  polarity: [{a_to_b}, {b_to_a}]
  hierarchy: {value}
  permanence: {value}
```

---

## TASKS

Tasks define work that can be done in this module.

| Layer | Node | File |
|-------|------|------|
| Template | `narrative:task` | `.mind/tasks/TASK_*.md` |
| Instance | `narrative:task_run` | (created at runtime) |

### {task_name}

```markdown
**Definition:** {What this task accomplishes}

**Executor:** agent | automated | mechanical

**Skill:** {SKILL_Name.md if executor=agent}

**Procedure:** {procedure_name}
```

**Instance links:**
- `serves` → template (narrative:task)
- `concerns` → what it creates/modifies
- `claimed by` (actor → task_run)
- `status`: pending | running | completed | failed

---

## ACTORS

Actors execute tasks. Template describes capabilities, instance does the work.

| Layer | Node | File |
|-------|------|------|
| Template | `narrative:actor` | `.mind/actors/{name}/ACTOR.md` |
| Instance | `actor` (node_type) | (created at init) |

### {actor_name}

```markdown
**Subtype:** mechanical | agent

**Purpose:** {What this actor does}

**Capabilities:** {list of task types this actor can execute}

**Triggers:** {cron:5min | event:node_created | manual}
```

**Instance links:**
- `serves` → template (narrative:actor)

---

## PROBLEMS

Problems define abnormal situations that HEALTH detects and tasks resolve.

| Layer | Node | Where |
|-------|------|-------|
| Definition | Here (VOCABULARY) | WHAT: name, definition, severity |
| Detection | HEALTH | HOW: triggers, docks, mechanism |
| Resolution | task_run | Links to resolves_with task |

### {problem_id}

```yaml
id: PROBLEM_{UPPER_SNAKE_CASE}
definition: |
  {Clear description of the abnormal situation}

severity: critical | warning | info
  # critical = blocks work, must fix immediately
  # warning = degraded state, should fix soon
  # info = notable condition, fix when convenient

resolves_with: TASK_{task_name}
  # Task template that fixes this problem

detection_hint: |
  {Brief hint for HEALTH on how to detect this}
  # Full detection logic goes in HEALTH.md
```

**Example:**

```yaml
id: PROBLEM_MISSING_DOC
definition: |
  A doc expected in the chain is absent.
  Chain incomplete = understanding blocked.

severity: critical

resolves_with: TASK_create_doc

detection_hint: |
  Compare docs_found vs docs_expected from chain template.
```

---

## TERMINOLOGY PROPOSALS

| Propose | Instead Of | Reason |
|---------|------------|--------|
| {new_term} | {existing_term} | {why change} |

---

## MERGE STATUS

- [ ] Terms reviewed
- [ ] Mappings validated
- [ ] Merged to docs/TAXONOMY.md
- [ ] Merged to docs/MAPPING.md

---

## MARKERS

<!-- @mind:todo {Term needing clarification before merge} -->
