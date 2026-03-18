# {Module} — Implementation: Code Architecture and Structure

```
STATUS: {DRAFT | STABLE | DEPRECATED}
CREATED: {DATE}
```

---

## CHAIN

```
OBJECTIVES:      ./OBJECTIVES_{name}.md
BEHAVIORS:      ./BEHAVIORS_{name}.md
PATTERNS:       ./PATTERNS_{name}.md
MECHANISMS:     ./MECHANISMS_{name}.md (if applicable)
ALGORITHM:      ./ALGORITHM_{name}.md
VALIDATION:     ./VALIDATION_{name}.md
THIS:           IMPLEMENTATION_{name}.md
HEALTH:         ./HEALTH_{name}.md
SYNC:           ./SYNC_{name}.md

IMPL:           {path/to/main/source/file.py}
```

> **Contract:** Read docs before modifying. After changes: update IMPL or add TODO to SYNC. Run tests.

---

## CODE STRUCTURE

```
{area}/
├── {module}/
│   ├── __init__.py          # {what this exports}
│   ├── {file}.py             # {responsibility}
│   ├── {file}.py             # {responsibility}
│   └── {submodule}/
│       └── {file}.py         # {responsibility}
```

### File Responsibilities

| File | Purpose | Key Functions/Classes | Lines | Status |
|------|---------|----------------------|-------|--------|
| `{path}` | {what it does} | `{func}`, `{class}` | ~{n} | {OK/WATCH/SPLIT} |
| `{path}` | {what it does} | `{func}`, `{class}` | ~{n} | {OK/WATCH/SPLIT} |

**Size Thresholds:**
- **OK** (<400 lines): Healthy size, easy to understand
- **WATCH** (400-700 lines): Getting large, consider extraction opportunities
- **SPLIT** (>700 lines): Too large, must split before adding more code

> When a file reaches WATCH status, identify extraction candidates in the EXTRACTION CANDIDATES section below.
> When a file reaches SPLIT status, splitting becomes the next task before any feature work.

---

## DESIGN PATTERNS

### Architecture Pattern

**Pattern:** {MVC | Layered | Event-Driven | Pipeline | Repository | etc.}

**Why this pattern:** {rationale for choosing this architecture}

### Code Patterns in Use

| Pattern | Applied To | Purpose |
|---------|------------|---------|
| {Factory} | `{file}:{class}` | {why this pattern here} |
| {Strategy} | `{file}:{class}` | {why this pattern here} |
| {Observer} | `{file}:{class}` | {why this pattern here} |

### Anti-Patterns to Avoid

- **{Anti-pattern}**: {why it's tempting here} → {what to do instead}
- **God Object**: Don't let any single class/file handle too many responsibilities
- **Premature Abstraction**: Don't create helpers until you have 3+ uses

### Boundaries

| Boundary | Inside | Outside | Interface |
|----------|--------|---------|-----------|
| {boundary name} | {what's encapsulated} | {what can't see inside} | `{public API}` |

---

## SCHEMA

### {Data Structure Name}

```yaml
{StructureName}:
  required:
    - {field}: {type}          # {description}
    - {field}: {type}          # {description}
  optional:
    - {field}: {type}          # {description}
  constraints:
    - {constraint description}
```

### {Data Structure Name}

```yaml
{StructureName}:
  required:
    - {field}: {type}
  relationships:
    - {relation}: {target structure}
```

---

## ENTRY POINTS

| Entry Point | File:Line | Triggered By |
|-------------|-----------|--------------|
| {name} | `{file}:{line}` | {what triggers this} |
| {name} | `{file}:{line}` | {what triggers this} |

---

## DATA FLOW AND DOCKING (FLOW-BY-FLOW)

Start with the most important flows to track: those that transform data, cross boundaries, or carry risk (security, money, state, or user-visible output).
Focus on flows that are complex, high-impact, or hard to reason about. Skip trivial pass-through paths.

Each flow should:
- Explain what belongs in this flow and why it matters.
- List concrete steps across files in order.
- Enumerate ALL available docking points in the flow (inputs/outputs).
- Decide which docks are significant enough for HEALTH to select, and why.

### {Flow Name}: {Brief Description}

Explain what this flow covers, what it transforms, and why it matters.
If this flow is low-risk or non-transformative, note why it is still tracked.

```yaml
flow:
  name: {flow_name}
  purpose: {what this flow accomplishes}
  scope: {inputs, outputs, boundaries}
  steps:
    - id: step_1
      description: {what happens in this step}
      file: {path/to/file.py}
      function: {function_or_method}
      input: {type_or_schema}
      output: {type_or_schema}
      trigger: {event_or_call_site}
      side_effects: {state/files/api}
    - id: step_2
      description: {what happens next}
      file: {path/to/file.py}
      function: {function_or_method}
      input: {type_or_schema}
      output: {type_or_schema}
      trigger: {event_or_call_site}
      side_effects: {state/files/api}
  docking_points:
    guidance:
      include_when: {significant, risky, complex, transformative}
      omit_when: {trivial pass-through, redundant, low-impact}
      selection_notes: {how to choose where HEALTH should dock}
    available:
      - id: dock_1
        type: {graph_ops|file|api|event|queue|db|custom}
        direction: {input|output}
        file: {path/to/file.py}
        function: {function_or_method}
        trigger: {event_or_call_site}
        payload: {type_or_schema}
        async_hook: {required|optional|not_applicable}
        needs: {add async hook|add watcher|add interceptor|none}
        notes: {context or risk}
      - id: dock_2
        type: {graph_ops|file|api|event|queue|db|custom}
        direction: {input|output}
        file: {path/to/file.py}
        function: {function_or_method}
        trigger: {event_or_call_site}
        payload: {type_or_schema}
        async_hook: {required|optional|not_applicable}
        needs: {add async hook|add watcher|add interceptor|none}
        notes: {context or risk}
    health_recommended:
      - dock_id: dock_1
        reason: {why this dock is significant}
      - dock_id: dock_2
        reason: {why this dock is significant}

---

## LOGIC CHAINS

### LC1: {Chain Name}

**Purpose:** {what this chain accomplishes}

```
{input}
  → {module_a}.{function}()     # {what it does}
    → {module_b}.{function}()   # {transformation}
      → {module_c}.{function}() # {final step}
        → {output}
```

**Data transformation:**
- Input: `{type}` — {description}
- After step 1: `{type}` — {what changed}
- After step 2: `{type}` — {what changed}
- Output: `{type}` — {final form}

### LC2: {Chain Name}

**Purpose:** {what this chain accomplishes}

```
{flow description}
```

---

## MODULE DEPENDENCIES

### Internal Dependencies

```
{module_a}
    └── imports → {module_b}
    └── imports → {module_c}
        └── imports → {module_d}
```

### External Dependencies

| Package | Used For | Imported By |
|---------|----------|-------------|
| `{package}` | {purpose} | `{file}` |
| `{package}` | {purpose} | `{file}` |

---

## STATE MANAGEMENT

### Where State Lives

| State | Location | Scope | Lifecycle |
|-------|----------|-------|-----------|
| {state name} | `{file}:{var}` | {global/module/instance} | {when created/destroyed} |

### State Transitions

```
{state_a} ──{event}──▶ {state_b} ──{event}──▶ {state_c}
```

---

## RUNTIME BEHAVIOR

### Initialization

```
1. {what happens first}
2. {what happens next}
3. {system ready}
```

### Main Loop / Request Cycle

```
1. {trigger}
2. {processing}
3. {response}
```

### Shutdown

```
1. {cleanup step}
2. {final step}
```

---

## CONCURRENCY MODEL

{If applicable: threads, async, processes}

| Component | Model | Notes |
|-----------|-------|-------|
| {component} | {sync/async/threaded} | {considerations} |

---

## CONFIGURATION

| Config | Location | Default | Description |
|--------|----------|---------|-------------|
| `{key}` | `{file}` | `{value}` | {what it controls} |

---

## BIDIRECTIONAL LINKS

### Code → Docs

Files that reference this documentation:

| File | Line | Reference |
|------|------|-----------|
| `{file}` | {line} | `# DOCS: {path}` |

### Docs → Code

| Doc Section | Implemented In |
|-------------|----------------|
| ALGORITHM step 1 | `{file}:{function}` |
| ALGORITHM step 2 | `{file}:{function}` |
| BEHAVIOR B1 | `{file}:{function}` |
| VALIDATION V1 | `{test_file}:{test}` |

---

## EXTRACTION CANDIDATES

Files approaching WATCH/SPLIT status - identify what can be extracted:

| File | Current | Target | Extract To | What to Move |
|------|---------|--------|------------|--------------|
| `{file}` | ~{n}L | <400L | `{new_file}` | {functions/classes to extract} |

---

## MARKERS

> See PRINCIPLES.md "Feedback Loop" section for marker format and usage.

<!-- @mind:todo {Missing feature or technical debt} -->
<!-- @mind:proposition {Architecture improvement or pattern to apply} -->
<!-- @mind:escalation {Design uncertainty or pattern choice needing decision} -->
