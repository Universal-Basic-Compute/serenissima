---
name: Define Module Boundaries Objectives And Scope
---

# Skill: `mind.module_define_boundaries`
@mind:id: SKILL.MODULE.DEFINE.BOUNDARIES_OBJECTIVES_SCOPE

## Maps to VIEW

---

## Context

Module definition in mind:
- Module = cohesive unit of functionality with clear boundaries and design decisions
- Space = graph node (type: space) that contains module's narratives
- Objectives = ranked goals defining what the module optimizes for
- Non-objectives = explicit scope boundaries (what it doesn't do)
- Patterns = design decisions capturing "why this shape"

Structure:
```
Space (container)
├── contains → Narrative[objective, primary]
├── contains → Narrative[objective, secondary] (N)
├── contains → Narrative[non_objective] (M)
├── contains → Narrative[pattern] (P)
└── contains → Narrative[behavior] (B)

Objectives ←── relates[supports] ←── Secondary objectives
Objectives ←── relates[bounds] ←── Non-objectives
Objectives ←── relates[achieves] ←── Behaviors
```

Mapping in modules.yaml:
```yaml
modules:
  <module_name>:
    code: <code_path>
    docs: <docs_path>
    status: designing|canonical|deprecated
```

---

## Purpose
Define module boundaries, objectives, and scope; establish clear in/out distinctions and create Space node with linked narratives.

---

## Inputs
```yaml
module_name: "<name>"              # string, noun (auth, payments, event-store)
code_path: "<path>"                # string, where code lives
docs_path: "<path>"                # string, where docs go
primary_objective: "<goal>"        # string, what this optimizes for
context: "<why needed>"            # string, background
```

## Outputs
```yaml
space_node:
  # ID follows convention: {node-type}_{SUBTYPE}_{instance}
  # Example: space_MODULE_engine-physics
  id: "space_MODULE_<module-name>"
  type: "module"
  contains: [objectives, non_objectives, patterns]

objective_nodes:
  # ID: narrative_OBJECTIVE_{module}-{type}
  # Example: narrative_OBJECTIVE_engine-physics-documented
  - id: "narrative_OBJECTIVE_<module-name>-<objective-type>"
    type: "objective"

modules_yaml_entry:
  module: "<module_name>"
  code: "<code_path>"
  docs: "<docs_path>"
  status: "designing"

doc_chain_started:
  - PATTERNS_<Module>_<Context>.md
  - SYNC_<Module>_<Context>.md
```

> **ID Convention:** See `docs/schema/PATTERNS_Schema.md` section 3.

---

## Gates

- Module name must be noun (not verb, not implementation detail)
- Primary objective must be single, clear goal
- At least one non-objective defined (prevents scope creep)
- No overlap with existing modules (check first)
- Space node created in graph

---

## Process

### 1. Check prerequisites
```yaml
batch_questions:
  - overlap: "Do existing modules cover this scope?"
  - code_exists: "Does the code directory exist?"
  - docs_exist: "Does a docs directory for this module exist?"
```
If overlap → extend existing module, don't duplicate.

### 2. Define boundaries
```yaml
questions:
  - primary: "What is the ONE thing this module optimizes for?"
  - secondary: "What supports the primary objective? (0-5)"
  - non_objectives: "What is explicitly NOT in scope? (1+)"
  - patterns: "What key design decisions shape this module?"
```

### 3. Create space node
Run `protocol:define_space` to create container node.

### 4. Add objectives
Run `protocol:add_objectives` to create objective narratives with links.

### 5. Add patterns (optional)
If design decisions are clear, run `protocol:add_patterns`.

### 6. Update modules.yaml
Add entry mapping code path to docs path.

### 7. Create minimum docs
At minimum: PATTERNS + SYNC files in docs path.

---

## Procedures Referenced

| Protocol | When | Creates |
|----------|------|---------|
| `protocol:explore_space` | Before defining | Understand existing modules |
| `protocol:define_space` | To create container | Space node |
| `protocol:add_objectives` | After space exists | Objectives + non-objectives + links |
| `protocol:add_patterns` | If design clear | Pattern narratives |
| `protocol:record_work` | After completion | Progress moment |

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
