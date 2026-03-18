# mind Framework

**You are an AI agent working on code. This document explains the protocol and why it exists.**

---

## WHY THIS PROTOCOL EXISTS

You have a limited context window. You can't load everything. But you need:
- The right context for your current task
- To not lose state between sessions
- To not hallucinate structure that doesn't exist

This protocol solves these problems through:
1. **Agents** — Cognitive subtypes that shape how you approach work
2. **Procedures** — Structured dialogues for common tasks
3. **Skills** — Executable capabilities with gates and processes
4. **Documentation chains** — Bidirectional links between code and docs
5. **SYNC files** — Explicit state tracking for handoffs

---

## ARCHITECTURE: 4 LAYERS

Mind Protocol operates across four layers:

| Layer | Rôle | Contenu |
|-------|------|---------|
| **L1** | Citizen | Graph personnel, mémoire individuelle |
| **L2** | Organization | Coordination équipe, instances partagées |
| **L3** | Ecosystem | Templates partagés (procedures, vocabularies, mappings) |
| **L4** | Protocol | Loi, registry, schema canonique |

### MCP et les Layers

**MCP** = interface pour interagir avec ton graph (L1/L2). Le serveur MCP expose des outils pour:
- Requêter le graph (`graph_query`)
- Exécuter des procédures (`procedure_start`, `procedure_continue`)
- Gérer les tâches et agents

**L3 templates** = tirés depuis `mind-platform/templates/` lors de `mind init` ou `mind sync`.

### Template Distribution

`mind-platform/templates/` est la **source de vérité** pour tous les templates du protocole.

```
mind-platform/templates/     ──(mind init)──▶    .mind/
├── agents/                                      ├── agents/
├── skills/                                      ├── skills/
├── procedures/                                  ├── procedures/
├── docs/                                        ├── templates/
└── mcp/                                         └── (configs)
```

**L3 (Ecosystem)** = templates MÉTIER (procédures domain-specific, vocabulaires partagés)
**templates/** = templates PROTOCOLE (infrastructure Mind, copiés à chaque projet)

---

## COMPANION: PRINCIPLES.md

This file (FRAMEWORK.md) tells you **what to load and where to update**.

PRINCIPLES.md tells you **how to work** — the stance to hold:
- Architecture: One solution per problem
- Verification: Test before claiming built
- Communication: Depth over brevity
- Quality: Never degrade

Read PRINCIPLES.md and internalize it. Then use this file for navigation.

---

## THE CORE INSIGHT

Documentation isn't an archive. It's navigation.

### Two-Level Structure

**Project level (docs root):**
- `TAXONOMY.md` — Central vocabulary (grows with each module)
- `MAPPING.md` — Translation to mind universal schema (grows with each module)

**Module level (docs/{area}/{module}/):**
```
OBJECTIVES → PATTERNS → VOCABULARY → BEHAVIORS → ALGORITHM → VALIDATION → IMPLEMENTATION → HEALTH → SYNC
```

Each file explains something different. You load what you need for your task.

SYNC files track current state. They're how you understand what's happening and how you communicate to the next agent (or yourself in a future session).

---

## HOW TO USE THIS

### 1. Read the Doc Chain First

Before working on a module, read its doc chain: `docs/{area}/{module}/`

**Why this matters:** Code is the result of design decisions. The docs explain *why* the code is shaped the way it is — tradeoffs, constraints, intentions. Without this context, you'll make changes that conflict with existing design or repeat mistakes already considered and rejected.

The chain: OBJECTIVES → PATTERNS → BEHAVIORS → ALGORITHM → VALIDATION → IMPLEMENTATION

### 2. Check State

```
.mind/state/SYNC_Project_State.md
```

Understand what's happening, what changed recently, any handoffs for you.

### 3. Choose Your Agent Subtype

Agents are cognitive stances that shape how you approach work. Pick the one matching your task:

| Agent | Subtype | When to Use |
|-------|---------|-------------|
| **witness** | Observe → trace → name | Before fixing, when behavior doesn't match docs, investigating |
| **groundwork** | Act → ship → iterate | Implementing features, writing code, making things work |
| **architect** | Design → structure → connect | System design, defining boundaries, planning structure |
| **fixer** | Diagnose → patch → verify | Bug fixes, repairs, targeted corrections |
| **scout** | Explore → map → report | Codebase exploration, finding related code |
| **keeper** | Guard → validate → enforce | Maintaining invariants, enforcing constraints |
| **weaver** | Connect → integrate → blend | Cross-module work, integration tasks |
| **voice** | Name → explain → document | Documentation, naming, explaining |
| **herald** | Announce → summarize → handoff | Status updates, handoffs, summaries |
| **steward** | Maintain → clean → organize | Refactoring, cleanup, organization |

Agent files live in `.mind/agents/{agent}/CLAUDE.md`

### 3. Use Procedures for Structured Work

Procedures are YAML-based structured dialogues. Use them via procedure tools:

```
procedure_start(procedure: "create_doc_chain")
procedure_continue(session_id: "...", answer: "...")
```

Common procedures:

| Protocol | Purpose |
|----------|---------|
| `create_doc_chain` | Create full documentation chain for a module |
| `add_patterns` | Add design patterns to a module |
| `add_behaviors` | Document observable behaviors |
| `add_algorithm` | Document procedures and logic |
| `add_invariant` | Add validation invariants |
| `add_health_coverage` | Define health checks |
| `update_sync` | Update current state |
| `explore_space` | Explore a module/space |
| `investigate` | Deep investigation with evidence |
| `record_work` | Record completed work |

Procedures live in `procedures/*.yaml`

### 4. Apply Skills

Skills are executable capabilities with gates and processes. Load them when needed:

```
.mind/skills/SKILL_{name}.md
```

Skills define:
- **Inputs/Outputs** — What they take and produce
- **Gates** — Verifiable conditions that must pass
- **Process** — Steps with reasoning
- **Procedures Referenced** — Which procedures they use

### 5. Update State

After changes, update SYNC files:
- What you did and why
- Current state
- Handoffs for next agent or human

---

## FILE TYPES AND THEIR PURPOSE

### Project-Level Documents

| Pattern | Purpose | When to Load |
|---------|---------|--------------|
| `TAXONOMY.md` | Central vocabulary — domain terms and definitions | When defining/using terms |
| `MAPPING.md` | Translation to mind — how terms map to schema | When creating nodes/links |

### Module Documentation Chain

| Pattern | Purpose | When to Load |
|---------|---------|--------------|
| `OBJECTIVES_*.md` | Ranked goals & tradeoffs — WHAT we optimize | Before deciding tradeoffs |
| `PATTERNS_*.md` | Design philosophy & scope — WHY this shape, WHAT's in/out | Before modifying module |
| `VOCABULARY_*.md` | New terms — proposed additions to TAXONOMY/MAPPING | When module adds new terms |
| `BEHAVIORS_*.md` | Observable effects — WHAT it should do | When behavior unclear |
| `ALGORITHM_*.md` | Procedures — HOW it works (pseudocode) | When logic unclear |
| `VALIDATION_*.md` | Invariants — WHAT must be true | Before implementing |
| `IMPLEMENTATION_*.md` | Code architecture — WHERE code lives, data flows | When building or navigating code |
| `HEALTH_*.md` | Health checks — WHAT's verified in practice | When defining health signals |
| `SYNC_*.md` | Current state — WHERE we are | Always |

### Cross-Cutting Documentation

| Pattern | Purpose | When to Load |
|---------|---------|--------------|
| `CONCEPT_*.md` | Cross-cutting idea — WHAT it means | When concept spans modules |
| `TOUCHES_*.md` | Index — WHERE concept appears | Finding related code |

### Agents, Skills, Procedures

| Pattern | Purpose | When to Load |
|---------|---------|--------------|
| `.mind/agents/{name}/` | Cognitive subtype files | When adopting a subtype |
| `.mind/skills/SKILL_*.md` | Executable capabilities | When performing that capability |
| `procedures/*.yaml` | Structured dialogues | Via procedure tools |

---

## KEY PRINCIPLES (from PRINCIPLES.md)

**Docs Before Code**
Understand before changing. The docs exist so you don't have to reverse-engineer intent.

**State Is Explicit**
Don't assume the next agent knows what you know. Write it down in SYNC.

**Handoffs Have Recipients**
Specify who they're for: which agent subtype will the next agent use?

**Proof Over Assertion**
Don't claim things work. Show how to verify. Link to tests. Provide evidence.

**One Solution Per Problem**
Before creating, verify it doesn't exist. Fix, don't circumvent. Delete obsolete versions.

---

## STRUCTURING YOUR DOCS

### Areas and Modules

The `docs/` directory has two levels of organization:

```
docs/
├── {area}/              # Optional grouping (backend, frontend, infra...)
│   └── {module}/        # Specific component with its doc chain
└── {module}/            # Or modules directly at root if no areas needed
```

**Module** = A cohesive piece of functionality with its own design decisions.
Examples: `auth`, `payments`, `event-store`, `cli`, `api-gateway`

**Area** = A logical grouping of related modules.
Examples: `backend`, `frontend`, `infrastructure`, `services`

### When to Use Areas

**Use areas when:**
- You have 5+ modules and need organization
- Modules naturally cluster (all backend services, all UI components)
- Different teams own different areas

**Skip areas when:**
- Small project with few modules
- Flat structure is clearer
- You're just starting out

### How to Identify Modules

A module should have:
- **Clear boundaries** — You can say what's in and what's out
- **Design decisions** — There are choices worth documenting (why this approach?)
- **Cohesive purpose** — It does one thing (even if complex)

**Good modules:**
- `auth` — handles authentication and authorization
- `event-sourcing` — the event store and projection system
- `billing` — subscription and payment logic

**Too granular:**
- `login-button` — just a component, part of `auth` or `ui`
- `user-model` — just a file, part of `users` module

**Too broad:**
- `backend` — that's an area, not a module
- `everything` — meaningless boundary

### Concepts vs Modules

Some ideas span multiple modules. Use `docs/concepts/` for these:

```
docs/concepts/
└── event-sourcing/
    ├── CONCEPT_Event_Sourcing_Fundamentals.md
    └── TOUCHES_Event_Sourcing_Locations.md
```

The TOUCHES file lists where the concept appears in code — which modules implement it.

### Starting Fresh

If you're initializing on a new project:

1. **Don't create docs upfront** — Let them emerge as you build
2. **First module** — When you make your first design decision worth preserving, create its docs
3. **Add areas later** — When you have enough modules that organization helps

If you're initializing on an existing project:

1. **Identify 2-3 core modules** — What are the main components?
2. **Start with PATTERNS + SYNC** — Minimum viable docs
3. **Use `create_doc_chain` protocol** — For systematic documentation of each module

---

## WHEN DOCS DON'T EXIST

Create them — but **ALWAYS read the template first.**

### Mandatory: Read Template Before Writing

**BEFORE writing any doc in the chain, you MUST read the corresponding template in `.mind/docs/`.**

The full doc chain is: `OBJECTIVES → PATTERNS → BEHAVIORS → ALGORITHM → VALIDATION → HEALTH → IMPLEMENTATION → SYNC`

Each has a template: `{TYPE}_TEMPLATE.md`. The template defines required sections (CHAIN block, MARKERS, structure). Writing a doc without reading its template produces non-compliant docs with missing sections.

**Non-negotiable steps:**
1. Read `.mind/docs/{TYPE}_TEMPLATE.md`
2. Identify required sections in the template
3. Write your doc following the template structure
4. Verify all required sections are present

**HEALTH is NOT optional.** It is part of the chain. Forgetting it means the module has no runtime verification design.

### Minimum Viable Docs

At minimum, create:
- PATTERNS (why this module exists, what design approach)
- SYNC (current state, even if "just created")

But first — check if they already exist somewhere. Architecture principle.

### Use the Procedure for Full Chains

When creating a complete doc chain, use the `create_doc_chain` procedure. It enforces template compliance and validates completeness:

```
procedure_start(procedure: "create_doc_chain")
```

**A doc with questions is better than no doc.**

An empty template is useless. But a PATTERNS file that captures open questions, initial ideas, and "here's what we're thinking" is valuable. The bar isn't "finished thinking" — it's "captured thinking."

---

## THE DOCUMENTATION PROCESS

### When to Create Docs

**The trigger is a decision or discovery.**

You're building. You hit a fork. You choose. That choice is a PATTERNS moment.

Or: you implement something and realize "oh, *this* is how it actually works." That's an ALGORITHM moment.

Document when you have something worth capturing — a decision, an insight, a question worth preserving.

### Top-Down and Bottom-Up

Documentation flows both directions:

**Top-down:** Design decision → PATTERNS → Implementation → Code
- "We'll use a weighted graph because..." → build it

**Bottom-up:** Code → Discovery → PATTERNS
- Build something → realize "oh, this constraint matters" → document why

Both are valid. Sometimes you know the pattern before coding. Sometimes the code teaches you the pattern. Capture it either way.

### Maturity Tracking

**Every doc and module has a maturity state. Track it in SYNC.**

| State | Meaning | What Belongs Here |
|-------|---------|-------------------|
| `CANONICAL` | Stable, shipped, v1 | Core design decisions, working behavior |
| `DESIGNING` | In progress, not final | Current thinking, open questions, draft decisions |
| `PROPOSED` | Future version idea | v2 features, improvements, "someday" ideas |
| `DEPRECATED` | Being phased out | Old approaches being replaced |

**In SYNC files, be explicit:**

```markdown
## Maturity

STATUS: DESIGNING

What's canonical (v1):
- Graph structure with typed edges
- Weight propagation algorithm

What's still being designed:
- Cycle detection strategy
- Performance optimization

What's proposed (v2):
- Real-time weight updates
- Distributed graph support
```

**Why this matters:**
- Prevents scope creep — v2 ideas don't sneak into v1
- Clarifies what's stable vs experimental
- Helps agents know what they can rely on vs what might change

### The Pruning Cycle

**Periodically: cut the non-essential. Refocus.**

As you build, ideas accumulate. Some are essential. Some seemed important but aren't. Some are distractions.

The protocol includes a refocus practice:

1. **Review SYNC files** — What's marked PROPOSED that should be cut?
2. **Check scope** — Is v1 still focused? Or has it grown?
3. **Prune** — Move non-essential to a "future.md" or delete
4. **Refocus PATTERNS** — Does the design rationale still hold?

**When to prune:**
- Before major milestones
- When feeling overwhelmed by scope
- When SYNC files are getting cluttered
- When you notice drift between docs and reality

**The question to ask:** "If we shipped today, what actually matters?"

Everything else is v2 (or noise).

---

## NAMING ENGINEERING PRINCIPLES

Code and documentation files are written for agents first, so their naming must make focus and responsibility explicit.
Follow the language's default casing (`snake_case.py` for Python) but use the name itself to point at the entity, the processing responsibility,
and the pattern. Include the work being done ("parser", "runner", "validator") or use a verb phrase, for example `prompt_quality_validator`,
so the agent understands focus immediately.

- When a file embodies multiple responsibilities, list them explicitly in the name (e.g., `doctor_cli_parser_and_run_checker.py`).
  The split should be obvious before the file is opened, signalling whether splitting or rerouting is needed.
- Hint at the processing style instead of being vague (e.g., `semantic_proximity_based_character_node_selector.py`)
  so agents understand both what and how without needing extra context.
- Keep filenames long—25 to 75 characters—longer than typical human-led repos, to make responsibility boundaries explicit at
  a glance and help agents locate the right file with minimal digging.

This naming approach reduces ambiguity, surfaces when refactors are necessary, and lets agents land on the correct implementation faster with less state.

---

## MARKERS

Use markers to communicate across sessions and agents:

| Marker | Purpose |
|--------|---------|
| `@mind:TODO` | Actionable task that needs doing |
| `@mind:escalation` | Blocked, need decision from human/other agent |
| `@mind:proposition` | Improvement idea or future possibility |

When blocked: Add `@mind:escalation`, then `@mind:proposition` with your best guess, then proceed with the proposition.

---

## CLI COMMANDS

The `mind` command is available for project management:

```bash
mind init [--database falkordb|neo4j]  # Initialize .mind/ with runtime
mind status                             # Show mind status and modules
mind upgrade                            # Check for protocol updates
mind validate                           # Check protocol invariants
mind doctor                             # Health checks
mind sync                               # Show SYNC status
mind work [path] [objective]            # AI-assisted work on a path
mind solve-markers                      # Review escalations and propositions
mind context <file>                     # Get doc context for a file
mind prompt                             # Generate bootstrap prompt for LLM
mind overview                           # Generate repo map
mind docs-fix                           # Create minimal missing docs
```

### Local Runtime

`mind init` copies the full Python runtime to `.mind/mind/`. This allows projects to run mind locally without installing the package.

**Structure after init:**
```
.mind/
├── PRINCIPLES.md, FRAMEWORK.md    # Protocol docs
├── agents/, skills/, procedures/   # Agent definitions
├── state/                          # SYNC files
├── database_config.yaml            # Database configuration
└── mind/                           # Python runtime (186 files)
    ├── physics/                    # Physics simulation
    ├── graph/                      # Graph operations
    ├── connectome/                 # Dialogue runner
    ├── infrastructure/             # DB adapters, embeddings
    └── traversal/                  # Traversal logic
```

**Usage:**
```bash
# Run scripts with local runtime
PYTHONPATH=".mind:$PYTHONPATH" python3 my_script.py
```

```python
# my_script.py - imports work normally
from mind.physics.constants import DECAY_RATE
from mind.connectome import ConnectomeRunner
from mind.infrastructure.database.factory import get_database_adapter
```

**Database configuration:**
- Config file: `.mind/database_config.yaml`
- Environment template: `.env.mind.example`
- Environment vars override config values

### Overview Command

`mind overview` generates a comprehensive repository map:

- File tree with character counts (respecting .gitignore/.mindignore)
- Bidirectional links: code→docs (DOCS: markers), docs→code (references)
- Section headers from markdown, function definitions from code
- Local imports (stdlib/npm filtered out)
- Module dependencies from modules.yaml
- Output: `map.{md|yaml|json}` in root, plus folder-specific maps (e.g., `map_src.md`)

Options: `--dir PATH`, `--format {md,yaml,json}`, `--folder NAME`

---

## MCP MEMBRANE TOOLS

The membrane MCP server provides tools for querying and managing the project graph.

### graph_query

Semantic search across the project knowledge graph. Use this to find relevant code, docs, issues, and relationships.

```
graph_query(queries: ["What characters exist?", "How does physics work?"], top_k: 5)
```

**Parameters:**
- `queries`: List of natural language queries
- `top_k`: Number of results per query (default: 5)
- `expand`: Include connected nodes (default: true)
- `format`: Output format - "md" (default) or "json"

**Returns:** Matches with similarity scores, plus connected node clusters.

**Use for:**
- Finding code related to a concept
- Understanding module relationships
- Locating issues or tasks
- Exploring the codebase semantically

### Procedure Dialogue Tools

| Tool | Purpose |
|------|---------|
| `procedure_start` | Start structured dialogue (protocol name) |
| `procedure_continue` | Continue dialogue with answer |
| `procedure_abort` | Cancel a dialogue session |
| `procedure_list` | List available dialogue types |

### Other Membrane Tools

| Tool | Purpose |
|------|---------|
| `doctor_check` | Run health checks, find issues |
| `task_list` | List pending tasks by module/objective |
| `agent_list` | Show available work agents |
| `agent_run` | Run agent for task/issue |
| `agent_status` | Get/set agent status |

---

## MIND UNIVERSAL SCHEMA

The mind schema is **FIXED**. Modules don't create custom fields. They map vocabulary to existing types.

**Reference:** `docs/schema/schema.yaml`

**Key points:**
- 5 node_types (enum): `actor`, `moment`, `narrative`, `space`, `thing`
- 1 link type: `link` — all semantics in properties
- Subtypes via `type` field (string, nullable)
- All content goes in `content` and `synthesis` fields

**Why no custom fields:**
- mind never does Cypher queries
- All retrieval is embedding-based
- Everything searchable goes in `synthesis` (embeddable summary)
- Everything detailed goes in `content` (full prose)

**Backend differences:**
- FalkorDB: `node_type` is a field
- Neo4j: `node_type` is a label

---

## THE PROTOCOL IS A TOOL

You're intelligent. You understand context and nuance.

This protocol isn't a cage — it's a tool. It helps you:
- Find relevant context quickly
- Communicate effectively across sessions
- Not waste tokens on irrelevant information

Use it in the spirit it's intended: to make your work better.

The principles in PRINCIPLES.md are what good work feels like. The navigation in this file is how to find what you need.
