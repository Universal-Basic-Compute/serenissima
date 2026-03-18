---
name: Orchestrate Feature Integration Pipeline Orchestrator And Progress Router
---

# Skill: `mind.orchestrate_feature_integration`
@mind:id: SKILL.ORCH.FEATURE_INTEGRATION.PIPELINE.ORCHESTRATOR

## Maps to VIEW
`(wrapper skill; calls the pipeline sequence)`

---

## Context

Orchestration in mind = running the full integration pipeline with work conservation.

Pipeline order:
1. **Ingest** → Parse raw inputs, produce routing table
2. **Per-module loop** → For each module: scaffold → document → implement → verify
3. **Close-out** → Update project SYNC, collect remaining escalations

Work conservation: Work never halts. If blocked on one module, switch to next unblocked. Track all blockers as `@mind:escalation`.

Task graph: Deterministic mapping of modules to todos and verification plans.

Progress log: Status per module: scaffolded → documented → implemented → verified.

---

## Purpose
Run the full pipeline: ingest → per-module loop → close-out, enforcing never-stop work conservation and deterministic routing.

---

## Inputs
```yaml
objective: "<goal + acceptance criteria>"     # string
data_sources:
  - "<path or url>"                           # list
scope_hints:
  areas: ["<area>"]                           # optional filter
  modules: ["<module>"]                       # optional filter
constraints:
  do_not_touch: ["<paths>"]                   # off-limits
  patterns: ["<canon patterns>"]              # must respect
```

## Outputs
```yaml
task_graph:
  - module: "<area/module>"
    todos: ["<todo-id>"]
    chosen_view: "implement|extend|debug"
    verification_plan: ["<health check>"]
progress_log:
  - module: "<area/module>"
    status: "scaffolded|documented|implemented|verified"
    blockers: ["<escalation if any>"]
```

---

## Gates

- Must load PROTOCOL and required VIEWs — pipeline needs context
- Must create at least one `@mind:TODO` per module discovered — track all work
- Must enforce pipeline order and never-stop — no halting, just switching

---

## Process

### 1. Ingest raw inputs
Call `mind.ingest_raw_data_sources` skill.
Produce routing table.

### 2. Build task graph
For each routed item:
```yaml
task:
  module: "<target module>"
  view: "<implement|extend|debug based on nature>"
  todos: ["<specific tasks>"]
  verification: ["<how to verify>"]
```

### 3. Per-module loop
For each module in task graph:
1. Load module context (PATTERNS, SYNC, IMPLEMENTATION)
2. Execute chosen VIEW skill
3. Update module SYNC
4. If blocked → `@mind:escalation`, switch to next module

### 4. Close-out
- Update project SYNC (`SYNC_Project_State.md`)
- Collect all remaining escalations
- Report progress log

---

## Skills Called

| Skill | When |
|-------|------|
| `mind.ingest_raw_data_sources` | Phase 1: Ingest |
| `mind.create_module_documentation` | If scaffolding needed |
| `mind.implement_write_or_modify_code` | If implementing |
| `mind.extend_add_features` | If extending |
| `mind.debug_investigate_fix_issues` | If debugging |
| `mind.sync_update_module_state` | After each module |

---

## Procedures Referenced

| Protocol | When | Creates |
|----------|------|---------|
| `protocol:explore_space` | Before each module | Context |
| `protocol:record_work` | After each module | progress moment |

---

## Evidence
- Docs: `@mind:id + file + header`
- Code: `file + symbol`

## Markers
- `@mind:TODO`
- `@mind:escalation`
- `@mind:proposition`

## Never-stop
If blocked → `@mind:escalation` + `@mind:proposition` → switch to next unblocked module.
