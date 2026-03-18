---
name: Add Cluster Dynamic Creation
---

# Skill: `mind.add_cluster`
@mind:id: SKILL.PRIMITIVE.ADD_CLUSTER.DYNAMIC_CREATION

## Maps to VIEW
`(primitive; used by all creation workflows)`

---

## Purpose

Create any well-formed cluster dynamically. Schema-guided, step-by-step, with choices for linking existing vs creating new.

---

## When to Use

**Use add_cluster when:**
- No domain protocol exists for what you're creating
- Creating something unusual or one-off
- Exploring what cluster shape makes sense
- Bootstrapping before domain protocols exist

**Use domain protocols when:**
- Protocol exists (add_health_coverage, add_invariant, etc.)
- Creating standard structures
- Want opinionated guidance specific to that type

---

## Inputs

```yaml
node_type: "<actor|space|thing|narrative|moment>"  # required
space_id: "<target space>"                          # optional, will ask if not provided
config:
  require_links: true|false                        # default true
  min_links: 1                                     # default 1
  allow_recursive: true|false                      # allow creating linked nodes
```

## Outputs

```yaml
cluster:
  primary_node:
    id: "<generated>"
    type: "<node_type>"
  links: [...]
  moment:
    id: "<generated>"
    prose: "<creation description>"
```

---

## Protocols

```yaml
protocols:
  - add_cluster
```

---

## Atomicity

A cluster is atomic when:
- All nodes created together succeed or fail together
- Deleting primary node cascades to cluster-internal nodes
- Cluster-internal links don't survive without both endpoints

```yaml
atomicity:
  boundaries:
    internal: "Nodes created in same protocol run"
    external: "Links to pre-existing nodes"

  transaction:
    on_validation_fail: rollback_all
    on_partial_create: rollback_all

  cascade_delete:
    - moment (always internal)
    - docks (internal to health cluster)
    - NOT: linked validations (external, pre-existed)
```

**Example:**
```
health_cluster (atomic unit):
  |- narrative_HEALTH_* (primary)
  |- thing_DOCK_input (internal, cascades)
  |- thing_DOCK_output (internal, cascades)
  +- moment_CREATE_* (internal, cascades)

  Links OUT (don't cascade):
  |- -> narrative_VALIDATION_* (external)
  +- -> thing_FUNC_* (external)
```

---

## Link Requirements by Subtype

What MUST link to what based on subtype:

```yaml
link_requirements:

  narrative.objective:
    required:
      - contains <- space
    optional:
      - supports <- narrative.objective (secondary supports primary)
      - bounds <- narrative.objective (non-objective)

  narrative.pattern:
    required:
      - contains <- space
      - supports -> narrative.objective
    optional:
      - relates -> narrative.pattern (elaborates)

  narrative.behavior:
    required:
      - contains <- space
      - achieves -> narrative.objective
    optional:
      - relates -> narrative.pattern

  narrative.algorithm:
    required:
      - contains <- space
      - implements -> narrative.pattern
    optional:
      - enables -> narrative.behavior

  narrative.validation:
    required:
      - contains <- space
      - ensures -> narrative.behavior (min: 1)
    optional:
      - relates -> narrative.pattern

  narrative.health:
    required:
      - contains <- space
      - verifies -> narrative.validation (min: 1)
      - checks -> narrative.algorithm
      - attached_to <- thing.dock (exactly: 2)
    optional:
      - relates -> narrative.health (depends_on)

  thing.dock:
    required:
      - attached_to -> narrative.health
      - observes -> thing.func | thing.method
    fields:
      - direction: input | output (required)
      - uri: file::symbol:line (required)

  thing.file:
    required:
      - contains <- space
    created_by: doctor (not add_cluster)

  thing.func:
    required:
      - contains <- thing.file
      - implements -> narrative.algorithm (optional but recommended)
    created_by: doctor (not add_cluster)
```

---

## Valid Link Targets

What can link to what:

```yaml
valid_targets:

  # narrative.health can link to:
  narrative.health:
    verifies:
      target: narrative.validation
      min: 1
      max: unbounded
    checks:
      target: narrative.algorithm
      min: 1
      max: 1
    attached_to:
      source: thing.dock  # reversed - dock attaches to health
      exactly: 2

  # narrative.validation can link to:
  narrative.validation:
    ensures:
      target: narrative.behavior
      min: 1
      max: unbounded
    covered_by:
      source: narrative.health  # reversed
      min: 0  # can be uncovered initially

  # thing.dock can link to:
  thing.dock:
    attached_to:
      target: narrative.health
      exactly: 1
    observes:
      target: [thing.func, thing.method, thing.class]
      min: 1
      max: 1
```

**Link direction clarity:**
```
health -[verifies]-> validation     # health is the subject
dock -[attached_to]-> health        # dock belongs to health
dock -[observes]-> func             # dock reads from func
validation -[ensures]-> behavior    # validation guarantees behavior
health -[checks]-> algorithm        # health verifies algorithm works
func -[implements]-> algorithm      # code implements design
```

---

## Design vs Implementation

Narrative (design) vs Thing (implementation) distinction:

```yaml
design_implementation:

  principle: |
    - narrative.algorithm = design (how it should work, reasoning)
    - thing.func = implementation (actual code)
    - They link but are not the same

  patterns:
    algorithm_to_code:
      design: narrative.algorithm
      implementation: thing.func | thing.method
      link: "thing -[implements]-> narrative"

    health_coverage:
      checks_design: "health -[checks]-> algorithm"
      observes_impl: "dock -[observes]-> func"
      # Both required - health verifies the design via the implementation

  lifecycle:
    - algorithm can exist before code (design phase)
    - code can change while algorithm stays same (refactor)
    - multiple implementations per algorithm (versions, variants)
    - algorithm captures WHY, code is just HOW
```

---

## Protocol Composition

How domain protocols use add_cluster:

```yaml
composition:

  pattern: |
    Domain protocols (add_health_coverage, add_invariant) don't call add_cluster.
    They ARE specialized versions of add_cluster with:
    - Pre-set node types
    - Required link targets for that type
    - Domain-specific questions
    - Domain-specific validation

  hierarchy:
    primitive:
      - add_cluster (generic, any node type)

    domain:
      - add_health_coverage (narrative.health + docks)
      - add_invariant (narrative.validation)
      - add_objectives (narrative.objective)
      - add_patterns (narrative.pattern)
      - add_behaviors (narrative.behavior)
      - add_algorithm (narrative.algorithm)

  when_to_use:
    add_cluster:
      - No domain protocol exists
      - One-off or unusual structure
      - Exploring/prototyping
      - Creating node types without domain protocol

    domain_protocol:
      - Standard structure
      - Required links enforced
      - Domain-specific guidance
```

---

## Cluster Templates

What defines a complete cluster shape:

```yaml
templates:

  health_coverage_cluster:
    primary: narrative.health
    internal_nodes:
      - thing.dock (input)
      - thing.dock (output)
      - moment
    required_external_links:
      - verifies -> narrative.validation (min: 1)
      - checks -> narrative.algorithm (exactly: 1)
    internal_links:
      - dock -[attached_to]-> health
      - dock -[observes]-> thing.func
      - moment -[about]-> health
    total_nodes: 4
    total_links: 9+

  validation_cluster:
    primary: narrative.validation
    internal_nodes:
      - moment
    required_external_links:
      - ensures -> narrative.behavior (min: 1)
    optional_external_links:
      - covered_by <- narrative.health (created later)
    total_nodes: 2
    total_links: 3+

  algorithm_cluster:
    primary: narrative.algorithm
    internal_nodes:
      - moment
    required_external_links:
      - implements -> narrative.pattern
    optional_external_links:
      - implemented_by <- thing.func (created by doctor)
      - checked_by <- narrative.health (created later)
    total_nodes: 2
    total_links: 3+
```

---

## Pre-Commit Validation

What makes a cluster valid before commit:

```yaml
validation:

  universal:
    - primary node has non-empty content/name
    - moment describes creation rationale
    - contains link to space exists
    - expresses link from actor exists

  by_subtype:
    narrative.health:
      - exactly 2 docks attached
      - at least 1 validation linked (verifies)
      - exactly 1 algorithm linked (checks)
      - each dock has observes link to symbol

    narrative.validation:
      - at least 1 behavior linked (ensures)

    narrative.algorithm:
      - at least 1 pattern linked (implements)

    thing.dock:
      - direction is 'input' or 'output'
      - uri matches pattern "file::symbol:line"
      - attached_to exactly 1 health
      - observes exactly 1 symbol

  on_failure:
    action: block_creation
    message: "Missing required links: {list}"
    suggestion: "Run {protocol} to create missing targets first"
```

---

## Cluster Design Knowledge

### Minimum Viable Cluster

```
content_node --contains--> space
     |
     +--about--> moment --expresses--> actor
```

Every cluster needs:
1. At least one content node (narrative, thing, etc.)
2. Containment in a space
3. A moment recording creation
4. Actor who created it

### Dense vs Sparse

**Sparse (bad):**
```
[node] --contains--> [space]
```
Isolated. No energy flow. Hard to find. No context.

**Dense (good):**
```
[node] --contains--> [space]
   |
   |- --relates--> [existing_node_1]
   |- --relates--> [existing_node_2]
   |- --attached_to--> [thing]
   |
   +--about--> [moment] --expresses--> [actor]
```
Connected. Energy flows. Queryable. Traceable.

---

## Link Types (from schema)

### Energy Carriers (participate in physics)

| Link | Direction | Phase | Example |
|------|-----------|-------|---------|
| `expresses` | Actor -> Moment | draw | Agent expresses exploration moment |
| `about` | Moment -> Any | flow | Moment about a space |
| `relates` | Any -> Any | flow + backflow | Validation relates to behavior |
| `attached_to` | Thing -> Actor/Space | flow | Dock attached to module |

### Structural (no energy)

| Link | Direction | Purpose |
|------|-----------|---------|
| `contains` | Space -> nodes | Hierarchy |
| `sequence` | Moment -> Moment | History |
| `leads_to` | Space -> Space | Paths |
| `primes` | Moment -> Moment | Causality |
| `can_become` | Thing -> Thing | Transformation |

---

## Semantic Properties on `relates`

Instead of many link types, use properties on `relates`:

| Property | Values | Purpose |
|----------|--------|---------|
| `role` | originator, believer, witness, subject, creditor, debtor | Who/what role |
| `direction` | support, oppose, elaborate, subsume, supersede, ensures, verifies | Semantic direction |
| `strength` | 0.0 - infinity (default 1.0) | Link weight |

**Examples:**
```yaml
# This validation ensures that behavior
- type: relates
  from: validation
  to: behavior
  properties:
    direction: ensures
    role: originator
    strength: 1.0

# This narrative contradicts that one
- type: relates
  from: narrative_a
  to: narrative_b
  properties:
    direction: oppose

# Health indicator verifies validation
- type: relates
  from: health_indicator
  to: validation
  properties:
    direction: verifies
    strength: 0.85
```

---

## Node Type Reference (from schema)

### actor
Anyone/anything that can act.
- No type-specific fields
- Common subtypes: human, agent, system

### space
Container or location.
- No type-specific fields
- Common subtypes: module, folder, topic, region

### thing
Object that can be referenced, possessed, transferred.
- `uri`: optional locator (file path, URL)
- Common subtypes: file, url, artifact, dock

### narrative
Story, pattern, or knowledge.
- `content`: the narrative content
- Common subtypes: pattern, mechanism, validation, health, implementation, objective, goal, decision

### moment
Temporal event.
- `text`: event description
- `status`: possible -> active -> completed -> decayed
- `tick_created`, `tick_resolved`
- Common subtypes: task, event, exploration, protocol_create

---

## Quality Criteria

**Good cluster:**
- Content node has meaningful content (not placeholder)
- Links to at least one existing node (not orphan)
- Moment describes why this was created
- Properties on links where meaningful (direction, strength)

**Bad cluster:**
- Empty or placeholder content
- Only contains link (no relations)
- No moment (untraceable)
- All links with default properties (meaningless)

---

## Process

1. **Choose node type** -> schema injected for that type
2. **Choose space** -> containment established
3. **Fill required fields** -> with guidance per field
4. **Link to existing** -> or create new (recursive call)
5. **Add properties** -> on links where meaningful
6. **Confirm** -> review cluster shape before commit
7. **Create** -> nodes + links + moment

---

## Gates

- Content node must have non-empty content
- Must link to at least one existing node (unless config.require_links=false)
- Moment must describe creation rationale
- If recursive creation, depth limit enforced (default 3)

---

## Evidence & Referencing

- Docs: `@mind:id + file + header path`
- Code: `file + symbol`

## Markers

- `@mind:TODO <plan>`
- `@mind:escalation <blocker>`
- `@mind:proposition <suggestion>`

## Never-stop Rule

If blocked on cluster design, create minimal viable cluster (content + space + moment), add `@mind:TODO` for enrichment later.

---

## Existing Node Discovery

Every new cluster should link to AS MANY existing nodes as relevant. Sparse clusters are failures. Dense clusters are successes.

```yaml
existing_node_discovery:

  discovery_queries:
    same_space:
      query: "All nodes in target space"
      purpose: "Find siblings to relate to"

    same_type:
      query: "All nodes of same subtype across graph"
      purpose: "Find peers (other validations, other health indicators)"

    referenced_in_content:
      query: "Parse content field for @refs, node names, IDs"
      purpose: "Explicit references become links"

    upstream:
      query: "What does this depend on? (algorithms, patterns, behaviors)"
      purpose: "Required conceptual links"

    downstream:
      query: "What will depend on this? (health needs validation, test needs func)"
      purpose: "Pre-link to future consumers"

    symbols_in_space:
      query: "All thing.func/method in same module"
      purpose: "Ground narratives to code"

  protocol_behavior:
    auto_fetch: |
      Before asking questions, load:
      - All nodes in target space
      - All nodes of target type
      - All potential link targets by link_requirements

    suggest_links: |
      After required links, show:
      "Found {N} other nodes you might want to link to:
       - 3 other validations in this space (relates: peer)
       - 2 algorithms that mention similar concepts (relates: related_to)
       - 5 functions that might implement this (implements)"

    prompt_for_more: |
      After user selects links:
      "Current cluster has {N} external links.
       Recommended minimum: {M}.
       Add more connections? [show unlinked candidates]"
```

---

## Connectivity Metrics

```yaml
connectivity:

  metrics:
    links_per_node:
      definition: "Total links / total nodes in cluster"
      minimum: 2.0
      good: 3.5
      excellent: 5.0+

    external_link_ratio:
      definition: "Links to existing nodes / total links"
      minimum: 0.3
      good: 0.5
      excellent: 0.7+

    orphan_score:
      definition: "Nodes with only 'contains' link"
      target: 0

    reachability:
      definition: "Can reach node from any objective in <=4 hops"
      target: 100%

  by_subtype:
    narrative.health:
      min_links: 9
      min_external: 5
      required_link_types: [contains, verifies, checks, attached_to, observes, about, expresses]

    narrative.validation:
      min_links: 4
      min_external: 2
      required_link_types: [contains, ensures, about, expresses]

    narrative.algorithm:
      min_links: 4
      min_external: 2
      required_link_types: [contains, implements, about, expresses]

    narrative.objective:
      min_links: 3
      min_external: 1
      required_link_types: [contains, about, expresses]
      # objectives are roots, fewer incoming links expected

    thing.dock:
      min_links: 3
      min_external: 2
      required_link_types: [attached_to, observes, about]

  warnings:
    low_connectivity: "Cluster has {N} links, minimum is {M}. Add more connections."
    no_external_links: "Cluster only links to internal nodes. Must link to existing graph."
    orphan_node: "Node {id} has no links except contains. Likely incomplete."
```

---

## Scenario Examples

### Scenario 1: Health Coverage (Good)

```yaml
health_coverage_good:
  trigger: "Add health coverage for schema validation"

  existing_graph_before:
    space_MODULE_schema: 1
    narrative_OBJECTIVE_health-verified: 1
    narrative_VALIDATION_V1: 1
    narrative_VALIDATION_V6: 1
    narrative_ALGORITHM_schema-validation: 1
    thing_FUNC_GraphOps_query: 1
    thing_METHOD_HealthReport_to_dict: 1
    # Total existing: 7 nodes

  cluster_created:
    nodes:
      - narrative_HEALTH_schema-compliance (primary)
      - thing_DOCK_schema-compliance-input
      - thing_DOCK_schema-compliance-output
      - moment_CREATE_health-schema-compliance
    # Total new: 4 nodes

  links_created:
    internal: # 4 links within cluster
      - moment -[about]-> health
      - actor -[expresses]-> moment
      - dock_input -[attached_to]-> health
      - dock_output -[attached_to]-> health

    external: # 10 links to existing nodes
      - space -[contains]-> health
      - space -[contains]-> dock_input
      - space -[contains]-> dock_output
      - health -[verifies]-> V1
      - health -[verifies]-> V6
      - health -[checks]-> algorithm
      - dock_input -[observes]-> GraphOps_query
      - dock_output -[observes]-> HealthReport_to_dict
      - health -[supports]-> objective_health-verified
      - moment -[about]-> algorithm  # bonus: moment references what we're checking

  totals:
    new_nodes: 4
    new_links: 14
    internal_links: 4
    external_links: 10
    external_ratio: 0.71  # excellent
    links_per_node: 3.5   # good

  connectivity_verdict: "EXCELLENT - Dense, well-connected"
```

### Scenario 2: Health Coverage (Bad - Sparse)

```yaml
health_coverage_bad:
  trigger: "Add health coverage (minimal effort)"

  cluster_created:
    nodes:
      - narrative_HEALTH_schema-compliance
      - moment_CREATE_health-schema-compliance
    # Missing: docks!

  links_created:
    internal:
      - moment -[about]-> health
      - actor -[expresses]-> moment

    external:
      - space -[contains]-> health

  totals:
    new_nodes: 2
    new_links: 3
    internal_links: 2
    external_links: 1
    external_ratio: 0.33  # minimum
    links_per_node: 1.5   # BAD

  problems:
    - "No docks - can't observe anything"
    - "No verifies link - what validation does this cover?"
    - "No checks link - what algorithm is being verified?"
    - "No observes links - where does data come from?"

  connectivity_verdict: "FAIL - Orphan cluster, missing required structure"
```

### Scenario 3: Validation (Good)

```yaml
validation_good:
  trigger: "Add invariant: energy must stay bounded"

  existing_graph_before:
    space_MODULE_engine-physics: 1
    narrative_OBJECTIVE_system-operational: 1
    narrative_BEHAVIOR_decay-applies: 1
    narrative_BEHAVIOR_energy-flows: 1
    narrative_PATTERN_bounded-values: 1
    thing_FUNC_apply_decay: 1
    # Total existing: 6 nodes

  cluster_created:
    nodes:
      - narrative_VALIDATION_energy-bounded
      - moment_CREATE_validation-energy-bounded
    # Total new: 2 nodes

  links_created:
    internal:
      - moment -[about]-> validation
      - actor -[expresses]-> moment

    external:
      - space -[contains]-> validation
      - validation -[ensures]-> behavior_decay-applies
      - validation -[ensures]-> behavior_energy-flows
      - validation -[relates: elaborates]-> pattern_bounded-values
      - validation -[supports]-> objective_system-operational
      - moment -[about]-> behavior_decay-applies  # context

  totals:
    new_nodes: 2
    new_links: 8
    internal_links: 2
    external_links: 6
    external_ratio: 0.75  # excellent
    links_per_node: 4.0   # good

  connectivity_verdict: "GOOD - Well-connected, ready for health coverage"
```

### Scenario 4: Algorithm (Good)

```yaml
algorithm_good:
  trigger: "Add algorithm: exponential decay with neighbor averaging"

  existing_graph_before:
    space_MODULE_engine-physics: 1
    narrative_PATTERN_energy-conservation: 1
    narrative_PATTERN_bounded-values: 1
    narrative_BEHAVIOR_decay-applies: 1
    thing_FUNC_apply_decay: 1  # code exists, algorithm doc missing
    thing_FUNC_get_neighbors: 1
    # Total existing: 6 nodes

  cluster_created:
    nodes:
      - narrative_ALGORITHM_exponential-decay
      - moment_CREATE_algorithm-exponential-decay
    # Total new: 2 nodes

  links_created:
    internal:
      - moment -[about]-> algorithm
      - actor -[expresses]-> moment

    external:
      - space -[contains]-> algorithm
      - algorithm -[implements]-> pattern_energy-conservation
      - algorithm -[implements]-> pattern_bounded-values
      - algorithm -[enables]-> behavior_decay-applies
      - thing_FUNC_apply_decay -[implements]-> algorithm  # code implements design
      - thing_FUNC_get_neighbors -[used_by]-> algorithm  # helper function

  totals:
    new_nodes: 2
    new_links: 8
    internal_links: 2
    external_links: 6
    external_ratio: 0.75  # excellent
    links_per_node: 4.0   # good

  connectivity_verdict: "GOOD - Bridges design to implementation"
```

### Scenario 5: Full Module Bootstrap

```yaml
full_module:
  trigger: "New module: engine-physics from scratch"

  phase_1_objectives:
    new_nodes: 3  # primary + 2 secondary
    new_links: 6

  phase_2_patterns:
    new_nodes: 3
    new_links: 9  # each links to objectives

  phase_3_behaviors:
    new_nodes: 4
    new_links: 16  # each links to objectives + patterns

  phase_4_algorithms:
    new_nodes: 2
    new_links: 10  # patterns + behaviors + existing code

  phase_5_validations:
    new_nodes: 3
    new_links: 15  # behaviors + patterns

  phase_6_health:
    new_nodes: 9  # 3 health + 6 docks
    new_links: 36  # validations + algorithms + symbols + docks

  totals:
    total_nodes: 24
    total_links: 92
    avg_links_per_node: 3.8  # good

  graph_shape: |
    objectives (3)
        | supports
    patterns (3)
        | implements
    behaviors (4) <-- ensures -- validations (3)
        | enables               | verifies
    algorithms (2) <----------- health (3) <-- docks (6)
        | implements                           | observes
    [thing.func nodes from doctor]
```

---

## Protocol Feedback

```yaml
protocol_feedback:

  during_creation:
    after_each_step: |
      Current cluster:
        Nodes: {n}
        Links: {l} (internal: {i}, external: {e})
        Connectivity: {l/n:.1f} links/node
        External ratio: {e/l:.0%}
        Status: {SPARSE|ACCEPTABLE|GOOD|EXCELLENT}

  before_commit:
    show_summary: |
      CLUSTER SUMMARY
      ======================================
      Primary: narrative_HEALTH_schema-compliance

      Nodes created: 4
        - narrative_HEALTH_schema-compliance
        - thing_DOCK_schema-compliance-input
        - thing_DOCK_schema-compliance-output
        - moment_CREATE_...

      Links created: 14
        Internal (4):
          - moment -> health (about)
          - actor -> moment (expresses)
          - dock_in -> health (attached_to)
          - dock_out -> health (attached_to)

        External (10):
          - space -> health (contains)
          - health -> V1 (verifies)
          - health -> V6 (verifies)
          - health -> algorithm (checks)
          - dock_in -> func (observes)
          - dock_out -> method (observes)
          ...

      CONNECTIVITY SCORE: 3.5 links/node (GOOD)
      EXTERNAL RATIO: 71% (EXCELLENT)

      Ready to commit
      ======================================

  suggest_improvements: |
    Optional: Found 3 more nodes you could link to:
      - narrative_HEALTH_other-indicator (relates: peer)
      - narrative_PATTERN_verification (relates: implements)
      - thing_FUNC_validate_node (observes: additional)

    Add these links? [y/N]
```

---

## Connectivity Thresholds

| Metric | Minimum | Good | Excellent |
|--------|---------|------|-----------|
| Links/node | 2.0 | 3.5 | 5.0+ |
| External ratio | 30% | 50% | 70%+ |
| Orphan nodes | 0 | 0 | 0 |

### Scenario Summary

| Scenario | Nodes | Links | External | Ratio | Score | Verdict |
|----------|-------|-------|----------|-------|-------|---------|
| Health (good) | 4 | 14 | 10 | 71% | 3.5 | Excellent |
| Health (bad) | 2 | 3 | 1 | 33% | 1.5 | Fail |
| Validation | 2 | 8 | 6 | 75% | 4.0 | Good |
| Algorithm | 2 | 8 | 6 | 75% | 4.0 | Good |
| Full module | 24 | 92 | ~70 | 76% | 3.8 | Good |

---

## Summary of Cluster Rules

| Section | What It Defines |
|---------|-----------------|
| **Atomicity** | Transaction semantics, cascade rules |
| **Link Requirements** | What MUST link to what per subtype |
| **Valid Targets** | What CAN link to what |
| **Design vs Impl** | narrative.algorithm vs thing.func distinction |
| **Composition** | How domain protocols relate to add_cluster |
| **Templates** | Complete cluster shapes |
| **Validation** | Pre-commit checks |
| **Discovery** | Aggressive search for existing nodes to link |
| **Connectivity** | Metrics and thresholds for dense clusters |
| **Scenarios** | Concrete examples with numbers |
| **Feedback** | Protocol shows connectivity score during creation |

---

## CHAIN

- **Used by:** All domain protocols (add_health_coverage, add_invariant, etc.)
- **Calls:** add_cluster protocol (recursive for linked node creation)
