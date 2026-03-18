---
name: Onboard Understand Existing Module Codebase And Confirm Canon
---

# Skill: `mind.onboard_understand_module_codebase`
@mind:id: SKILL.ONBOARD.UNDERSTAND_EXISTING_CODEBASE.CONFIRM_CANON

## Maps to VIEW

---

## Context

Onboarding in mind = understanding existing module before working on it.

Canonical surfaces: The authoritative code locations for a module. Defined in IMPLEMENTATION docking points.

Canon terms: Terminology defined in PATTERNS/CONCEPT. Use these terms, don't invent new ones.

Dataflow: How data moves through the module. Key for understanding behavior.

Onboarding outputs:
- Canonical surfaces (file:symbol pairs)
- Dataflow notes (how data moves)
- Naming terms (from PATTERNS/CONCEPT)
- Updated IMPLEMENTATION with discovered docking points

Why onboard first: Working without understanding leads to:
- Duplicate implementations
- Inconsistent naming
- Broken invariants
- Misaligned structure

---

## Purpose
Identify canonical paths/symbols/dataflow and confirm naming/comment/monitoring expectations for the module.

---

## Inputs
```yaml
module: "<area/module>"       # string
code_roots: ["<paths>"]       # list of directories to explore
```

## Outputs
```yaml
canonical_surfaces:
  - file: "<path>"
    symbols: ["<function|class>"]
    role: "<what this does>"
dataflow_notes:
  - "<key flow description>"
naming_terms:
  - term: "<canonical term>"
    defined_in: "<PATTERNS or CONCEPT path>"
implementation_updates:
  - "<docking points added to IMPLEMENTATION>"
```

---

## Gates

- If canonical surface unclear → `@mind:escalation`, proceed with other modules — don't guess
- Must update IMPLEMENTATION with discovered surfaces/docking points — track what's found

---

## Process

### 1. Load existing docs
```yaml
batch_questions:
  - patterns: "What PATTERNS exist for this module?"
  - implementation: "What IMPLEMENTATION docking points exist?"
  - concept: "Any CONCEPT docs for cross-cutting terms?"
  - sync: "What's the current state per SYNC?"
```

### 2. Explore code
Walk code_roots. Identify:
- Entry points (main functions, API handlers)
- Core logic (algorithms, business rules)
- Data structures (models, types)
- Integration points (calls to other modules)

### 3. Map to docs
Match discovered code to doc chain:
- Does IMPLEMENTATION list these surfaces?
- Are terms consistent with PATTERNS?
- Are dataflows documented in ALGORITHM?

### 4. Update IMPLEMENTATION
Add missing docking points for discovered surfaces.

### 5. Note gaps
If canonical surface unclear, log `@mind:escalation`.
If terminology inconsistent, log `@mind:proposition`.

---

## Procedures Referenced

| Protocol | When | Creates |
|----------|------|---------|
| `protocol:explore_space` | To explore module | exploration moment |
| `protocol:add_implementation` | If docking points missing | IMPLEMENTATION narrative + docks |

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
