---
name: Author Procedures Design And Structure
---

# Skill: `mind.author_procedures`
@mind:id: SKILL.META.AUTHOR_PROCEDURES.DESIGN_AND_STRUCTURE

## Maps to VIEW
`(meta-skill; guides creation of procedures executed by membrane tool)`

---

## Context

Procedures = YAML executables executed by membrane. They gather context, ask questions, create graph clusters.

```
Skill (knowledge) → Procedure (executable) → Membrane (executor) → Graph (nodes + links)
```

Procedures differ from skills:
- Skills = contextual knowledge (what to know)
- Procedures = executable steps (what to do)

Key patterns in THIS system:
- **Auto-fetch**: Load existing state before asking questions
- **Batched questions**: 3-7 related questions per ask step (not 1 at a time)
- **Rich questions**: Include context, why_it_matters, good/bad examples
- **Clusters**: Create multiple nodes + dense links (never single isolated nodes)
- **Moments**: Every step traces reasoning via moment.agent_provides

---

## Purpose
Write procedures that gather context, check reality, ask rich batched questions, and create dense clusters.

---

## Inputs
```yaml
domain: "<area of work>"              # string
trigger: "<gap or event>"             # what starts this procedure
cluster_output: "<nodes and links>"   # what gets created
```

## Outputs
```yaml
protocol_document:
  path: "procedures/procedure_<verb>_<object>.yaml"
  structure: [triggers, requires_skills, contextual_knowledge, steps, output]
```

---

# Part 1: Question Design

## The Core Idea

Procedure isn't a form. It's a **guided conversation**.

Each question:
- Explains **why** it matters
- Shows **what** already exists
- Guides **how** to answer
- Captures **reasoning** as a moment

Agent doesn't just fill blanks. Agent understands the question, thinks, answers with intent.

---

## Question Anatomy

A rich question has:

| Field | Purpose |
|-------|---------|
| **ask** | The actual question |
| **why** | Why this matters for the cluster |
| **context** | What exists, what to consider |
| **options** | Auto-injected choices from graph |
| **guidance** | How to think about answering |
| **creates** | What this answer produces (transparency) |
| **comment** | Agent's reasoning → becomes moment |

---

## Example: Rich Question

**Shallow (bad):**
```yaml
ask: "Which validations?"
```

**Rich (good):**
```yaml
ask: "Which validations does this health indicator verify?"

why: |
  Health indicators exist to verify that validations hold at runtime.
  Without this link, we don't know what invariant this indicator protects.
  Without this link, we can't query "which validations have coverage?"

context: |
  Validations in this space:

  - V1: Link endpoints must exist
    Currently covered by: (none)

  - V6: Required fields present
    Currently covered by: (none)

  - V2: Physics values in range
    Currently covered by: health_physics_bounds

  You should verify at least the uncovered ones.

guidance: |
  Pick validations that this indicator can actually verify.
  Consider: what does the observation point (dock) actually check?
  If it queries nodes and checks fields → V6.
  If it checks link structure → V1.
  Multiple selections encouraged. One indicator can verify several validations.

creates: |
  For each validation you select:
    health ─[verifies]→ validation

  This makes the coverage queryable.

comment: (agent fills with reasoning)
```

---

## The Comment Field

Every question has a comment field. Agent fills it with reasoning.

**Why:**
- Provenance: "Why did we link to V1 and V6 but not V2?"
- Audit: Reviewable decisions
- Learning: Future agents see past reasoning
- Moments: Comments become graph nodes

**What agent writes:**
```yaml
comment: |
  Selected V1 and V6 because this health indicator queries nodes
  and checks required fields. V2 is physics-specific and already
  covered by health_physics_bounds. The input dock reads from
  GraphOps._query which validates structure, not physics values.
```

**Auto-persists as:**
```yaml
moment:
  type: decision
  text: "Selected V1 and V6 because this health indicator queries..."
  about: [health_indicator, V1, V6]
  expresses: AGENT_Keeper
```

Now the graph remembers **why**, not just **what**.

---

## Question Flow

```
┌─────────────────────────────────────────────┐
│ QUESTION                                    │
│                                             │
│ ask: "Which validations...?"                │
│                                             │
│ why: (explains importance)                  │
│                                             │
│ context:                                    │
│   - V1: uncovered ← you should pick this    │
│   - V6: uncovered ← you should pick this    │
│   - V2: covered by X                        │
│                                             │
│ guidance: (how to think about it)           │
│                                             │
└─────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────┐
│ AGENT THINKS                                │
│                                             │
│ Reads why → understands importance          │
│ Reads context → sees what exists            │
│ Reads guidance → knows how to decide        │
│                                             │
│ Decides → picks V1, V6                      │
│ Explains → writes comment                   │
│                                             │
└─────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────┐
│ ANSWER                                      │
│                                             │
│ selected: [V1, V6]                          │
│ comment: "Selected V1 and V6 because..."    │
│                                             │
└─────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────┐
│ CREATES                                     │
│                                             │
│ Links:                                      │
│   health ─[verifies]→ V1                    │
│   health ─[verifies]→ V6                    │
│                                             │
│ Moment:                                     │
│   "Selected V1 and V6 because..."           │
│   about: [health, V1, V6]                   │
│                                             │
└─────────────────────────────────────────────┘
```

---

## Context Injection

The `context` field isn't static. Membrane queries graph and injects:

**Before injection:**
```yaml
context: |
  Validations in this space:
  {query: narrative.validation in {space}}

  Show coverage status for each.
```

**After injection:**
```yaml
context: |
  Validations in this space:

  - V1: Link endpoints must exist
    Coverage: NONE ← needs health indicator

  - V6: Required fields present
    Coverage: NONE ← needs health indicator

  - V2: Physics values in range
    Coverage: health_physics_bounds (created 3 days ago)
```

Agent sees reality. Can't pick phantom nodes. Sees gaps.

---

## Guidance Types

| Question Type | Guidance Style |
|---------------|----------------|
| **Select one** | "Pick the most specific match. If multiple fit, pick primary." |
| **Select many** | "Pick all that apply. More connections = better coverage." |
| **Create new** | "Only if nothing existing fits. Check options first." |
| **Name/text** | "Use slug format. Should describe function, not implementation." |
| **Observation point** | "Pick where the actual data is read. Trace to specific function." |

---

## Comment → Moment Chain

Every step's comment becomes part of the cluster's history:

```
Procedure run: add_health_coverage

Step 1: pick_space
  answer: space_MODULE_schema
  comment: "Schema module because this verifies graph structure"
  → moment_DECISION_pick-space-001

Step 2: pick_validations
  answer: [V1, V6]
  comment: "V1 and V6 because we check structure and fields, not physics"
  → moment_DECISION_pick-validations-002

Step 3: pick_algorithm
  answer: narrative_ALGORITHM_schema-validation
  comment: "Direct match - this algorithm is what we're verifying"
  → moment_DECISION_pick-algorithm-003

Step 4: pick_input_dock
  answer: thing_FUNC_GraphOps__query
  comment: "This is where all validation queries run through"
  → moment_DECISION_pick-input-dock-004

Final cluster includes:
  - 4 nodes
  - 14 links
  - 4 decision moments (linked to nodes they affected)
```

Query later: "Why is health_schema_compliance linked to V1?"
Answer: Find moment → read comment → "V1 because we check structure..."

---

## Dense Linking Through Questions

Each question is designed to create links:

| Question | Creates |
|----------|---------|
| "Which space?" | contains link |
| "Which validations?" | verifies links (multiple) |
| "Which algorithm?" | checks link |
| "Input dock where?" | observes link to function |
| "Output dock where?" | observes link to function |
| "Which objective?" | supports link |
| "Related patterns?" | implements links |
| "Peer indicators?" | relates links |

More questions = more links = denser cluster.

Questions aren't bureaucracy. They're **link generators**.

---

## Answer Creation Guidance

For each question type, tell agent how to create answer:

**Select from options:**
```yaml
guidance: |
  Review each option in context.
  Check: Does this indicator actually verify this validation?
  Check: Can the dock observe what this validation requires?
  Select all that genuinely apply.

  Write comment explaining:
  - Why you selected these
  - Why you didn't select others
```

**Create new text:**
```yaml
guidance: |
  Name should be:
  - Slug format (lowercase, hyphens)
  - Descriptive of function (what it checks)
  - Not implementation detail (not "graphops-query-checker")

  Good: "schema-compliance", "energy-bounds", "link-integrity"
  Bad: "checker-1", "my-health", "graphops-validator"

  Write comment explaining naming choice.
```

**Observation point:**
```yaml
guidance: |
  Trace the data flow:
  1. Where does the value we're checking originate?
  2. What function actually produces/transforms it?
  3. Pick the most specific point where we can observe.

  For input dock: Where data is READ
  For output dock: Where result is REPORTED

  Write comment explaining why this observation point.
```

---

## Question Design Summary

| Aspect | Design |
|--------|--------|
| **Questions are rich** | Include why, context, guidance, creates |
| **Context is injected** | Graph state shown, not guessed |
| **Guidance teaches** | How to think, not just what to pick |
| **Creates is transparent** | Agent sees what answer produces |
| **Comment captures reasoning** | Every step has explanation |
| **Comments become moments** | Reasoning persisted in graph |
| **Questions create links** | Each answer generates connections |
| **No phantom links** | Options come from graph |

**Procedure questions = guided thinking + link generation + provenance capture**

---

# Part 2: Protocol Structure

## Gates

**Naming:**
- Procedure name: `procedure_<verb>_<object>`
- File: `procedures/procedure_<verb>_<object>.yaml`

**Structure:**
- Start with goal + auto-fetch existing state
- Check prerequisites before gathering details
- Batch 3-7 related questions per ask step
- Questions include: context, why_it_matters, good/bad examples
- Call sub-protocols when dependencies missing
- Create clusters (multiple nodes + rich links)
- Every step has moment.agent_provides

---

## Process

### 1. Define trigger and output
```yaml
batch_questions:
  - trigger: "What gap/event starts this procedure?"
  - output: "What nodes/links get created?"
  - existing: "What must already exist?"
  - enables: "What does this output enable?"
```

### 2. Write contextual_knowledge section
```yaml
contextual_knowledge:
  domain: |
    <What this area of graph is about>
    <Key concepts and relationships>
    <What already exists and how structured>
  constraints: |
    <Invariants that must hold>
    <Patterns to follow, anti-patterns to avoid>
  dependencies: |
    <What must exist before protocol runs>
    <What output enables>
  quality_criteria: |
    <What makes good vs bad output>
    <Examples of well-formed clusters>
```

### 3. Design step flow
```
understand_situation → check_prerequisites → gather_details → create_cluster
```
Each step type has specific structure (see Step Types below).

### 4. Define cluster output
Multiple nodes + rich internal links + links to existing nodes + moment tracing.

---

## Protocol Template

```yaml
protocol: procedure_<verb>_<object>
version: "1.0"
description: <what this creates and why>

triggers:
  - gap: "<graph query that reveals need>"
  - event: "<action that triggers>"

requires_skills:
  - "<skill documents for domain knowledge>"

contextual_knowledge:
  domain: |
    <domain facts>
  constraints: |
    <invariants and patterns>
  dependencies: |
    <prerequisites and enables>
  quality_criteria: |
    <good vs bad examples>

steps:
  understand_situation:
    type: ask
    auto_fetch:
      - query: { find: <type>, in_space: "{space}" }
        store_as: existing_items
    context: |
      {contextual_knowledge.domain}
      Current state: {existing_items | summarize}
    questions:
      - name: goal
        ask: "What outcome? What problem?"
        why: "<reasoning>"
        guidance: "<how to think about it>"
        creates: "<what this produces>"
    next: check_prerequisites

  check_prerequisites:
    type: branch
    checks:
      - condition: "<missing dependency>"
        action:
          type: call_protocol
          protocol: <prerequisite_protocol>
          on_complete: reload_state
      - condition: "<already exists>"
        action: { type: complete, message: "<why no work needed>" }
      - condition: "ready"
        action: { goto: gather_details }

  gather_details:
    type: ask
    context: |
      Goal: {goal}
      {contextual_knowledge.constraints}
      Available: {existing_items | list}
    questions:
      - name: <field>
        ask: "<question>"
        why: "<reasoning>"
        context: "<injected from graph>"
        guidance: "<how to decide>"
        creates: "<what this produces>"
        good_answer: "<example>"
        bad_answer: "<example>"
        expects: { type: <type>, <constraints> }
      # ... batch 3-7 questions
    moment: { agent_provides: [description, reasoning] }
    next: create_cluster

  create_cluster:
    type: create
    nodes:
      - id: "<primary>_{name}"
        node_type: narrative
        # fields...
      - id: "moment_{timestamp}"
        node_type: moment
        prose: "{agent.description}"
    links:
      - type: contains
        from: "{space}"
        to: "<primary>_{name}"
      - for_each: <linked_items>
        type: relates
        from: "<primary>_{name}"
        to: "{item}"
      - type: expresses
        from: "{actor_id}"
        to: "moment_{timestamp}"
    moment: { agent_provides: [description] }
    next: $complete

output:
  cluster:
    nodes: [<list>]
    links: [<list>]
  summary: "<template>"
```

---

## Step Types

### ask
```yaml
type: ask
auto_fetch: [{ query: ..., store_as: ... }]
context: "<situation + loaded data>"
questions:
  - name: <key>
    ask: "<question>"
    why: "<reasoning>"
    context: "<injected state>"
    guidance: "<how to decide>"
    creates: "<what this produces>"
    good_answer: "<example>"
    bad_answer: "<example>"
    expects: { type: ..., constraints... }
moment: { agent_provides: [description] }
next: <step>
```

### query
```yaml
type: query
auto_fetch:
  - query: { find: ..., where: ..., in_space: ... }
    store_as: <key>
purpose: "<why loading>"
next: <step>
```

### branch
```yaml
type: branch
checks:
  - condition: "<expression>"
    action: { goto: <step> } | { type: call_protocol, ... } | { type: complete, ... }
```

### call_protocol
```yaml
type: call_protocol
protocol: <name>
reason: "<why needed>"
context: { <passed_values> }
on_complete: <step>
```

### create
```yaml
type: create
nodes: [{ id: ..., node_type: ..., fields... }]
links: [{ type: ..., from: ..., to: ..., properties: ... }]
moment: { agent_provides: [description] }
next: $complete
```

---

# Part 3: Contextual Knowledge

## Contextual Knowledge Examples

### health_coverage protocol:
```yaml
contextual_knowledge:
  domain: |
    Health indicators verify runtime behavior tests can't catch:
    drift, ratio degradation, production-only states.
    Link to validations via `relates` with direction=verifies.
    Have docks (observation points) attached via `attached_to`.
  constraints: |
    - Must verify at least one validation
    - Must have input dock AND output dock
    - Mechanism specific enough to implement
    - Thresholds distinguish WARNING from ERROR
  quality_criteria: |
    Good: "Compare max(narrative.energy) against 1.0 threshold after decay phase"
    Bad: "Check if healthy"
```

### add_invariant protocol:
```yaml
contextual_knowledge:
  domain: |
    Validations = invariants that must always hold.
    Link to behaviors via `relates` with direction=ensures.
    Priority: HIGH=system breaks, MED=degraded, LOW=inconvenience.
  constraints: |
    - Must have failure_mode
    - Should link to at least one behavior
    - Name pattern: V-<AREA>-<INVARIANT>
  quality_criteria: |
    Good: "Energy values must remain in [0,1] range after every tick phase"
    Bad: "Energy should be valid"
```

---

# Part 4: Verification

## Verification Checklist

### Structure
- [ ] Has contextual_knowledge filled for domain
- [ ] Starts with goal + auto-fetch
- [ ] Prerequisites checked before details
- [ ] Creates cluster (multiple nodes + rich links)
- [ ] All steps have moment.agent_provides

### Questions
- [ ] Questions batched (3-7 per ask)
- [ ] Each question has `why` field
- [ ] Each question has `context` (injected from graph)
- [ ] Each question has `guidance` (how to decide)
- [ ] Each question has `creates` (transparency)
- [ ] Good/bad examples where helpful

### Connectivity
- [ ] Cluster has 2.0+ links per node
- [ ] External link ratio 30%+ (links to existing nodes)
- [ ] No orphan nodes (only contains link)
- [ ] Comments captured as moments

---

## Procedures Referenced

| Protocol | When | Creates |
|----------|------|---------|
| `protocol:explore_space` | Before creating | exploration moment |
| `protocol:author_protocol` | To create protocol | protocol YAML |

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
