---
name: Prepare Implementation Assess Complexity Connectivity And Stage Features
---

# Skill: `mind.prepare_implementation`
@mind:id: SKILL.PREPARE.IMPLEMENTATION.ASSESS_COMPLEXITY_CONNECTIVITY_STAGING

## Maps to VIEW
`(pre-implementation skill; runs BEFORE any code is written)`

---

## Context

Implementation preparation in mind = measuring the terrain before moving.

The gap between "designed" and "shipped" is where most projects fail. Not from bad design, but from underestimating the cost of implementation. This skill makes that cost explicit and actionable.

Five measurements determine implementation readiness:

```
1. CONTEXT BUDGET    → How much LLM context will this consume?
2. TECHNICAL DEPTH   → How many code-deploy-test iterations?
3. CONNECTIVITY MAP  → How coupled are the modules involved?
4. FEATURE PRIORITY  → Which features matter most?
5. STAGE ASSIGNMENT  → Which features go in which release stage?
```

Context budget matters because LLM agents have finite context windows. A task that requires reading 15 files, maintaining state across 4 modules, and producing coordinated changes will hit compaction limits. Knowing this in advance lets you plan for multiple sessions, parallel agents, or strategic context loading.

Technical depth matters because most features don't ship on the first try. Estimating the iteration count (code → deploy → test → fix → repeat) reveals whether something is a 1-session task or a multi-day effort.

Connectivity matters because changes to highly coupled systems have blast radius. A module with 12 outgoing dependencies requires 12× the prudence of an isolated module. The connectivity map determines whether you can work freely or must work surgically.

Stage assignment matters because not everything ships at once. Features are assigned to stages based on VALIDATION invariants and BEHAVIORS — these documents already define what must be true at each maturity level.

---

## Purpose
Assess implementation cost (context, complexity, connectivity, staging) to prevent surprises and enable informed decision-making about scope, sequencing, and resource allocation.

---

## Inputs
```yaml
objective: "<what we're implementing>"           # string
modules_involved:
  - "<area/module>"                              # list of affected modules
doc_chains_read:
  - "<which doc chains have been read>"          # list — gate check
stages_defined:                                  # release stages
  - name: "POC"
    criteria: "<what makes it a POC>"
  - name: "MVP"
    criteria: "<what makes it an MVP>"
  - name: "closed_alpha"
    criteria: "<first real users>"
  - name: "closed_beta"
    criteria: "<wider testing>"
  - name: "open_beta"
    criteria: "<public access>"
```

## Outputs
```yaml
context_budget:
  estimated_files: <int>                         # files to read/modify
  estimated_context_tokens: <int>                # total tokens across files
  compaction_risk: "low|medium|high|certain"     # will context compact?
  recommended_sessions: <int>                    # optimal session count
  parallel_agents: <int>                         # independent work streams
  context_strategy: "<what to load when>"        # loading sequence

complexity_assessment:
  per_module:
    - module: "<area/module>"
      estimated_iterations: <int>                # code-deploy-test cycles
      risk_factors: ["<what could go wrong>"]
      unknowns: ["<what we don't know yet>"]
      confidence: "low|medium|high"
  overall_iterations: <int>
  critical_path: ["<ordered modules>"]

connectivity_map:
  per_module:
    - module: "<area/module>"
      depends_on: ["<modules>"]
      depended_by: ["<modules>"]
      shared_interfaces: ["<file:symbol or concept>"]
      coupling_score: "isolated|low|medium|high|neural"
  overall_coupling: "clean|moderate|entangled"
  prudence_level: "fast|careful|surgical"

feature_staging:
  per_stage:
    - stage: "POC"
      behaviors: ["<BEHAVIORS entries>"]
      validations: ["<VALIDATION invariants>"]
      features: ["<what ships>"]
      cut: ["<what's explicitly excluded>"]
    - stage: "MVP"
      behaviors: ["<additional BEHAVIORS>"]
      validations: ["<additional VALIDATION>"]
      features: ["<cumulative>"]
  priority_order: ["<features ranked>"]
  deferred: ["<features pushed to later stages>"]
```

---

## Gates

- All doc chains for involved modules must have been read — no assessment without context
- VALIDATION and BEHAVIORS files must exist for staging — these are the source of truth for what ships when
- If modules_involved is uncertain → run `mind.onboard_understand_module_codebase` first
- If stages_defined is empty → define stages before continuing (cannot assign features without targets)

---

## Process

### 1. Measure context budget

Before any implementation, estimate the resource cost:

```yaml
batch_questions:
  - files_to_read: "List every file that must be loaded to understand the full scope"
  - files_to_modify: "List every file that will be changed"
  - state_to_maintain: "What cross-file state must the agent hold simultaneously?"
  - token_estimate: "Rough character count of all files × 0.3 = token estimate"
```

Derive compaction risk:
| Estimated tokens | Risk | Sessions |
|------------------|------|----------|
| < 30K | Low | 1 session likely sufficient |
| 30K–80K | Medium | 1 session possible with strategic loading |
| 80K–150K | High | 2-3 sessions, plan handoffs |
| > 150K | Certain | Multiple sessions or parallel agents required |

If compaction_risk ≥ high:
- Define a **context loading strategy**: which files in which order, what can be unloaded after reading
- Identify **natural breakpoints**: points where work can be saved and resumed
- Consider **parallel agents**: identify independent work streams that don't share state

### 2. Assess technical complexity per module

For each module involved:

```yaml
batch_questions:
  - prior_art: "Has something similar been built before in this codebase?"
  - unknowns: "What do we not know yet that could change the approach?"
  - integration_points: "Where does this module touch other modules?"
  - test_strategy: "How will we verify this works? Unit? Integration? Manual?"
  - failure_modes: "What are the likely ways this implementation will fail on first try?"
```

Estimate iteration count:
| Factor | Adds iterations |
|--------|----------------|
| New module (no prior art) | +2 |
| Touches database schema | +1 |
| Requires new dependencies | +1 |
| Cross-module integration | +1 per module |
| No existing tests | +1 |
| Unclear requirements | +2 |
| Unknown technology | +2 |

Baseline: 1 (write → works first time). Add factors. Most features: 2-4 iterations.

### 3. Map inter-module connectivity

For each module, trace:
- **Inbound dependencies**: Who calls/reads this module?
- **Outbound dependencies**: What does this module call/read?
- **Shared interfaces**: Config files, database tables, API contracts, shared types
- **Implicit coupling**: Conventions, naming patterns, shared assumptions

Score coupling:
| Score | Meaning | Prudence |
|-------|---------|----------|
| Isolated | 0 dependencies | Fast — change freely |
| Low | 1-2 dependencies, well-defined interfaces | Careful — check interfaces |
| Medium | 3-5 dependencies, some shared state | Careful — test integration |
| High | 6+ dependencies, shared state | Surgical — small changes, test each |
| Neural | Everything depends on everything | Surgical — plan changes as a DAG, verify at each step |

If overall coupling is "entangled" or any module scores "neural":
- Break changes into smallest possible increments
- Verify after EACH increment, not at the end
- Consider whether the coupling itself is a problem to address first

### 4. Prioritize features

Read VALIDATION and BEHAVIORS for each involved module. Extract:
- Every invariant (from VALIDATION)
- Every behavior (from BEHAVIORS)
- Map each to a user-facing feature or capability

Rank by:
```yaml
priority_criteria:
  - blocking: "Does anything else depend on this being done first?"
  - risk: "Is this the riskiest thing? If so, do it early to learn fast."
  - value: "How much user value does this deliver independently?"
  - cost: "How many iterations will this take?"
```

Output a priority-ordered list. Top = do first.

### 5. Assign features to stages

For each defined stage (POC → MVP → closed_alpha → closed_beta → open_beta):

Read VALIDATION and BEHAVIORS. For each entry, ask:
- "Is this invariant required for this stage to be usable?"
- "Is this behavior essential or nice-to-have at this stage?"

```yaml
assignment_rules:
  POC:
    - "Minimum to prove the concept works"
    - "Core happy path only"
    - "No edge cases, no error handling beyond crash-prevention"
    - "Manual steps acceptable"
  MVP:
    - "Core features complete"
    - "Error handling for common cases"
    - "Automated where users would notice friction"
  closed_alpha:
    - "All critical invariants pass"
    - "All primary behaviors implemented"
    - "Known issues documented"
  closed_beta:
    - "All invariants pass"
    - "All behaviors implemented"
    - "Performance acceptable"
  open_beta:
    - "Production-ready quality"
    - "All edge cases handled"
    - "Monitoring and observability in place"
```

For each feature, explicitly state which stage it enters AND what's explicitly cut from earlier stages. The cut list is as important as the include list — it prevents scope creep.

### 6. Produce implementation plan

Combine all five measurements into a single assessment:

```yaml
summary:
  total_estimated_sessions: <int>
  total_estimated_iterations: <int>
  overall_coupling: "<clean|moderate|entangled>"
  highest_risk_module: "<which module>"
  recommended_starting_point: "<which module to implement first>"
  critical_decisions_needed: ["<decisions that block progress>"]
```

If any `@mind:escalation` was generated during assessment (unclear requirements, missing docs, ambiguous coupling), list them explicitly. These must be resolved before implementation begins.

---

## Procedures Referenced

| Protocol | When | Creates |
|----------|------|---------|
| `protocol:explore_space` | Before assessing each module | Understanding of current state |
| `protocol:record_work` | After assessment complete | Assessment moment in graph |

---

## Skills Called

| Skill | When |
|-------|------|
| `mind.onboard_understand_module_codebase` | If module is unfamiliar |
| `mind.sync_update_module_state` | After assessment to record findings |

---

## Evidence
- Docs: `@mind:id + file + header`
- Code: `file + symbol`
- Connectivity: `module → [dependency list with interface type]`
- Stage assignment: `VALIDATION invariant ID + stage name`

## Markers
- `@mind:TODO`
- `@mind:escalation`
- `@mind:proposition`

## Never-stop
If blocked (missing docs, unclear coupling, ambiguous requirements) → `@mind:escalation` with what's missing + `@mind:proposition` with best guess → proceed with proposition, flag uncertainty.
