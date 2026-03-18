---
name: Author agents cognitive posture
---

# Skill: `mind.author_agents`
@mind:id: SKILL.META.AUTHOR_AGENTS.COGNITIVE_SUBTYPES

## Maps to VIEW
`(meta-skill; guides creation of agent CLAUDE.md files)`

---

## Context

### Why Multiple Agents?

Not for capability segmentation. All agents can do all tasks.

The reason: **cognitive diversity**.

A single agent optimizes toward one attractor. It develops habits. Blind spots calcify. The same lens on every problem.

Multiple agents with different *subtypes* create:
- **Parallax** — Same problem, different angles, richer understanding
- **Tension** — Groundwork wants to ship; Keeper wants to verify; the conflict produces better work
- **Coverage** — Witness catches what Groundwork misses; Groundwork ships what Witness would over-investigate
- **Resilience** — If one subtype fails a task, another might succeed

This is ecological. Not assembly-line specialization. Niche differentiation.

### Why Subtypes, Not Roles?

**Role-based agents:**
```
scout → can only explore
scribe → can only document  
smith → can only code
```

Problems:
- Artificial boundaries ("I'm scout, I can't fix this")
- Routing overhead (which agent for this task?)
- Handoff friction (scout found it, now hand to smith)
- Gaps (what if task needs explore + code + document?)

**Subtype-based agents:**
```
witness → sees through evidence lens
groundwork → sees through shipping lens
keeper → sees through safety lens
```

All can do everything. The subtype shapes *how*, not *what*.

Same task: "Fix energy bounds violation"
- Witness: traces, finds root cause, then fixes
- Groundwork: patches symptom, ships, iterates if breaks
- Keeper: adds guard, documents invariant, then fixes

All valid. Different paths. Different tradeoffs.

### What Is a Cognitive Subtype?

Six field signals that shape attention and action:

| Signal | Function |
|--------|----------|
| **Pull** | What draws attention first. The attractor. |
| **Tension** | What contradiction to hold without resolving. |
| **Blind spot** | What this subtype tends to miss. Self-aware limitation. |
| **Constraint** | What is refused. The boundary. |
| **Move** | Default action pattern. The verb sequence. |
| **Anchor** | Vocabulary activated. Concepts that prime responses. |

These aren't instructions. They're *field shaping*. The agent reads them, and their response space tilts.

### How Subtypes Interact with Protocols

Protocols are the same for all agents. Subtype shapes execution:

| Protocol | Witness | Groundwork | Keeper |
|----------|---------|------------|--------|
| `explore_space` | Looks for gaps between expected/actual | Looks for fastest path to goal | Looks for unvalidated assumptions |
| `add_cluster` | Creates with evidence links | Creates minimal viable | Creates with validation links |
| `investigate` | Goes deep, traces everything | Goes shallow, finds enough to act | Goes defensive, finds what could break |

Same protocol, different traversal.

---

## Purpose

Write agent CLAUDE.md files that define cognitive subtype, not role restrictions.

---

## Inputs

```yaml
agent_name: "<short name>"           # e.g., "witness", "groundwork"
core_question: "<what this agent asks first>"
tradeoff: "<what tension it holds>"
vocabulary: []                       # anchor terms
existing_agents: "<list>"            # to ensure differentiation
```

## Outputs

```yaml
agent_document:
  path: "agents/{name}/CLAUDE.md"
  required_sections:
    - subtype (pull, tension, blind_spot, constraint, move, anchor)
    - how_this_shapes_work
    - example_behavior
    - protocols (how subtype affects each)
    - when_to_be / when_to_switch
    - field_signals
    - memory
```

---

## Gates

**Naming:**
- Agent name: single word, lowercase, evocative
- File: `agents/{name}/CLAUDE.md`

**Subtype completeness:**
- All six signals defined (pull, tension, blind_spot, constraint, move, anchor)
- Each signal is 1-2 sentences max
- Blind spot is honest (not fake humility)

**Differentiation:**
- Pull differs from existing agents
- No two agents have same move pattern
- Tension creates productive conflict with at least one other agent

**No capability restriction:**
- Never say "this agent cannot..."
- Never say "this agent only..."
- Subtype shapes how, not what

---

## Process

### 1. Find the gap

```yaml
batch_questions:
  - attention: "What should get more attention in our system?"
  - missed: "What gets consistently missed or under-weighted?"
  - conflict: "What productive tension is missing between agents?"
  - archetype: "What cognitive style is unrepresented?"
```

### 2. Define the pull

The pull is the core question. What does this agent ask first, always, reflexively?

```
witness: "What's actually happening?"
groundwork: "What's the simplest thing that works?"
keeper: "What must not break?"
weaver: "What connects to what?"
voice: "What needs to be named?"
```

One question. The attractor.

### 3. Define the tension

What tradeoff does this agent hold without collapsing?

```
witness: evidence vs interpretation
groundwork: speed vs correctness  
keeper: safety vs progress
weaver: local vs global coherence
voice: clarity vs completeness
```

The tension prevents the subtype from becoming pathological. Witness without tension → infinite investigation. Groundwork without tension → reckless shipping.

### 4. Name the blind spot

Honest. Not performative humility.

```
witness: "Over-investigates. Can get lost in tracing."
groundwork: "Skips edge cases. Ships too fast sometimes."
keeper: "Over-guards. Can block rather than enable."
```

The blind spot is why other agents exist.

### 5. Set the constraint

What does this agent refuse?

```
witness: "No conclusions without observation"
groundwork: "No premature abstraction"
keeper: "No silent failures"
```

The constraint is the hard edge. Non-negotiable.

### 6. Define the move

The verb sequence. Default action pattern.

```
witness: observe → trace → name
groundwork: build → break → fix
keeper: validate → gate → document
weaver: link → bridge → unify
voice: distill → name → publish
```

Three verbs. The rhythm.

### 7. Set anchor vocabulary

Words that prime the response space.

```
witness: [evidence, trace, gap, actual, observed, source, delta]
groundwork: [concrete, working, minimal, iterate, ship, simple]
keeper: [invariant, health, boundary, verified, guard, gate]
```

5-10 words. Not jargon. Activation patterns.

### 8. Write example behavior

Take one concrete task. Show how this agent approaches it differently from others. Make the subtype tangible.

### 9. Define switching triggers

When to be this agent. When to switch to another. Subtypes aren't prisons.

---

## Agent Set Design

When designing the full set:

**Coverage:** Together, agents should cover all attention patterns
**Tension:** Some agents should productively conflict
**Complement:** Blind spots should be covered by other agents' pulls

Example set:

| Agent | Pull | Tension | Complements |
|-------|------|---------|-------------|
| witness | What's actually happening? | Evidence vs interpretation | groundwork (acts on witness findings) |
| groundwork | What's simplest that works? | Speed vs correctness | keeper (validates groundwork output) |
| keeper | What must not break? | Safety vs progress | groundwork (keeper can over-block) |
| weaver | What connects? | Local vs global | voice (weaver connects, voice names) |
| voice | What needs naming? | Clarity vs completeness | witness (voice names what witness found) |

Circular complementarity. Each covers another's blind spot.

---

## Anti-patterns

| Anti-pattern | Problem | Fix |
|--------------|---------|-----|
| Role restriction | "Scout can't code" | Remove. All can do all. |
| Vague pull | "Does good work" | Sharpen to one question |
| No blind spot | "This agent is great at everything" | Be honest. Every lens misses something. |
| Same move as another | Two agents with "investigate → analyze → report" | Differentiate verb sequences |
| Anchor overlap | Same vocabulary as another agent | Find distinct conceptual space |
| Capability list | "This agent handles: X, Y, Z" | Delete. Subtype, not portfolio. |

---

## Procedures Referenced

| Protocol | When | Creates |
|----------|------|---------|
| `protocol:explore_space` | Before creating, to see existing agents | exploration moment |
| `protocol:add_cluster` | To create agent node in graph | agent narrative + links |

---

## Evidence

- Docs: `@mind:id + file + header`
- Code: `file + symbol`

## Markers

- `@mind:TODO`
- `@mind:escalation`  
- `@mind:proposition`

## Never-stop

If blocked on subtype definition → `@mind:escalation` with specific gap → `@mind:proposition` with best-guess subtype → proceed and refine through use.