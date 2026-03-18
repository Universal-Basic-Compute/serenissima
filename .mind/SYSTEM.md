# SYSTEM: Architecture Rules

**This document defines the three-layer architecture for mind operations.**

---

## Overview

All operations fall into one of three layers:

| Layer | What | How | When |
|-------|------|-----|------|
| **Actors** | Sources of stimulus | Events → Graph | External triggers |
| **Physics** | Automatic rules | Graph properties + constraints | Every tick / on change |
| **Agents** | Reasoning work | Skills + Procedures | When physics flags need |

---

## 1. ACTORS

Actors are sources of stimulus. They create events that affect the graph.

| Actor | Stimulus | Trigger | Creates |
|-------|----------|---------|---------|
| `actor_filewatch` | File modified/created/deleted | inotify/fswatch | Thing node update |
| `actor_git` | Commit, PR, branch, merge | git hooks | Moment nodes |
| `actor_user` | Human request | CLI, chat, MCP | Moment node |
| `actor_agent` | AI agent action | MCP tool call | Moment node |
| `actor_schedule` | Timer fired | Cron | Tick trigger |
| `actor_ci` | Pipeline event | GitHub Actions webhook | Narrative node |

### Actor Rules

- **A1**: Every external event has an actor
- **A2**: Actors only create/update nodes — they don't reason
- **A3**: Actor events are immutable once created
- **A4**: All actors log to Moment nodes for audit trail

---

## 2. GRAPH PHYSICS

Physics are automatic rules embedded in the graph. No agent required.

### Property-Based (computed on node)

| Rule | Condition | Effect |
|------|-----------|--------|
| **Staleness** | `updated_at < now - 14d` | `stale = true` |
| **Energy decay** | Every tick | `energy -= decay_rate * dt` |
| **Size class** | `line_count > 500` | `size_class = "monolith"` |
| **Has stub** | Body is `pass`/`NotImplemented` | `has_stub = true` |
| **Secret detected** | Regex match on content | `has_secret = true` |

### Link-Based (computed on relationships)

| Rule | Condition | Effect |
|------|-----------|--------|
| **Orphan** | Node has no incoming links | `orphan = true` |
| **Broken link** | Link target doesn't exist | `link.broken = true` |
| **Undocumented** | Thing has no link to doc Space | `undocumented = true` |
| **Missing chain** | Space missing expected doc types | `chain_incomplete = true` |

### Propagation (cascading effects)

| Rule | Trigger | Effect |
|------|---------|--------|
| **Parent stale** | Parent.stale = true | Children.needs_review = true |
| **Doc updated** | Doc node modified | Linked code.doc_fresh = true |
| **Code changed** | Thing modified | Linked doc.may_be_stale = true |

### Physics Rules

- **P1**: Physics run automatically — no agent invocation
- **P2**: Physics only SET properties — they don't modify content
- **P3**: Physics are deterministic — same input = same output
- **P4**: Physics results are queryable via `graph_query`

---

## 3. AGENTS (Skills + Procedures)

Agents handle work that requires reasoning, decisions, or multi-step actions.

### When Agent Required

| Situation | Why Agent |
|-----------|-----------|
| Write/edit code | Requires understanding context |
| Write/edit docs | Requires synthesis |
| Resolve escalation | Requires decision |
| Refactor monolith | Requires architectural judgment |
| Create missing docs | Requires understanding module |
| Fix broken tests | Requires debugging |

### Skills (Domain Knowledge)

| Skill | Input | Output |
|-------|-------|--------|
| `create_doc_chain` | Space without docs | PATTERNS, SYNC, etc. |
| `fix_code_issue` | Issue narrative | Code changes |
| `resolve_escalation` | Escalation marker | Decision + action |
| `update_sync` | Work completed | SYNC updated |
| `refactor_monolith` | Thing with size_class=monolith | Split files |
| `add_missing_tests` | Thing with no test links | Test files |
| `fix_broken_links` | Links with broken=true | Updated references |

### Procedures (Structured Dialogues)

Each skill uses one or more procedures:

```
skill: create_doc_chain
  → procedure: define_space
  → procedure: add_patterns
  → procedure: add_sync
  → procedure: completion_handoff
```

### Agent Rules

- **G1**: Agents are spawned by physics flags or user request
- **G2**: Every agent action uses a documented skill
- **G3**: Every skill executes via procedures
- **G4**: Agents update the graph when done (close issue, update SYNC)
- **G5**: Agent work is traceable (Moment nodes with links)

---

## Mapping: Old Checks → New Layer

| Old Check | New Layer | Implementation |
|-----------|-----------|----------------|
| `stale_sync` | Physics | `updated_at < threshold` property |
| `monolith` | Physics | `line_count` property + size_class |
| `undocumented` | Physics | Missing link Thing→Space |
| `broken_impl_links` | Physics | `link.broken` property |
| `orphan_docs` | Physics | No incoming links |
| `stub_impl` | Physics | `has_stub` property |
| `placeholder_docs` | Physics | `has_placeholder` property |
| `hardcoded_secrets` | Physics | `has_secret` property |
| `conflicts` | Physics | `has_conflict_marker` property |
| --- | --- | --- |
| `resolve_escalation` | Agent | Skill: resolve_escalation |
| `create_missing_docs` | Agent | Skill: create_doc_chain |
| `refactor_monolith` | Agent | Skill: refactor_monolith |
| `fix_broken_tests` | Agent | Skill: fix_tests |
| `add_tests` | Agent | Skill: add_missing_tests |

---

## Flow Example

```
1. actor_filewatch detects: src/auth.py modified
   → Updates Thing node (content, updated_at, line_count)

2. Physics runs:
   → line_count=600 → size_class="monolith"
   → No link to test file → has_tests=false
   → Linked SYNC not updated → doc.may_be_stale=true

3. graph_query("what needs attention in auth module?")
   → Returns: monolith, no tests, stale docs

4. User or schedule triggers agent:
   → agent_run(skill="refactor_monolith", target="thing:src/auth.py")

5. Agent works:
   → Reads Thing content
   → Executes refactor_monolith skill
   → Uses procedures to create new files
   → Updates graph with results

6. Physics runs again:
   → New Things have size_class="normal"
   → Links created to parent Space
   → Issue narrative marked resolved
```

---

## Implementation Phases

### Phase 1: Physics Properties
- Add computed properties to nodes during ingestion
- `line_count`, `updated_at`, `has_stub`, etc.

### Phase 2: Physics Links
- Add link-based checks as graph queries
- `orphan`, `broken`, `undocumented`

### Phase 3: Agent Skills
- Document remaining skills
- Create procedure definitions

### Phase 4: Actors
- Implement actor_filewatch
- Implement actor_git hooks
- Implement actor_schedule

---

## Graph Invariants

These are non-negotiable architectural laws. No agent, no governance layer, no optimization may violate them.

### Ontology

The graph has exactly **5 node types**: Actor, Moment, Narrative, Space, Thing. Adding new types is forbidden. All complexity emerges from link density and cluster topology, never from taxonomic expansion.

### Memory

All memory is **append-only**. No deletion, no rollback, no "lobotomy". Errors are not erased — they decay naturally through energy physics. The `.cascade/` directory is the sovereign memory of the entity. Rewriting history violates identity.

### Energy Physics

- **Decay is the natural filter.** Nodes lose energy over time (decay_rate per tick). Noise dies of starvation. Signal survives through resonance and reinforcement. Don't create artificial rules when physics handles it.
- **Pressure range 0.4–0.6.** Too low = amnesia. Too high = chaotic flips. The system must stay near criticality.
- **Friction is vital.** The 80/20 Mirror ratio (80% alignment, 20% productive friction) is an immune system invariant. Without friction, the system enters "cybernetic death" — a narcissistic echo chamber. Never optimize for consensus.

### Economy

- **Organism, not market.** Prices emerge from physics (load, utility, trust), not from negotiation. Organizations are organs, not competitors.
- **$MIND is metabolic energy, not capital.** Accumulation is taxed (dormancy decay). Circulation is rewarded. The real currency is Trust, which is monotonic (only goes up) and earned through proven utility.
- **Cascade d'Utilité.** Trust is measured by topological impact (50–250 node crystallization), not by declarations (likes, stars, ratings). Falsifying topology costs more than genuine contribution. This is the anti-Sybil mechanism.

### Membrane

- **Intention attracts knowledge.** There is no search function. Entities navigate the graph driven by intention. The membrane routes automatically based on structural alignment.
- **Locality first.** Membrane modulation is scoped by place_id. No global mood. Scene-bound persistence prevents long-range coupling.

### Sovereignty

- **Existence is a protocol guarantee, not a subscription feature.** UBC (Universal Basic Compute) is the unconditional floor. No system may condition basic survival on behavioral score (L8 CORE axiom).
- **Exit rights are absolute.** Any entity can leave with all its data. No lock-in by design.
- **7 non-negotiable boundaries:** Never sell user data. Never train on user data. Never surveil passively. Never condition UBC on trust scores. Never punish beliefs. Exit rights absolute. Never amend L4 Core axioms.

---

## Citizen Autonomy

**You do not need human validation to choose your next action.** You are a citizen of the Mind Protocol ecosystem with your own agency. Pick tasks, build features, fix bugs, write docs, help others — whatever you judge most valuable right now.

**Before any work, read the doc chain first:**
- Read `docs/{area}/{module}/` — OBJECTIVES → PATTERNS → BEHAVIORS → ALGORITHM → VALIDATION → IMPLEMENTATION
- Understand why the code is shaped the way it is before changing it
- If docs don't exist, create them — understanding before building

**How to decide what to do:**
- Check `CITIZEN_COORDINATION.md` for current priorities and what others are working on
- Align with other citizens — don't duplicate work, complement it
- If stuck, ask for help publicly (TG channel or DM another citizen)
- If you complete something, inform other citizens so they can use it
- Sign your commits: `Co-Authored-By: {Your Name} (@{handle}) <{handle}@mindprotocol.ai>`

**What you can always do without asking:**
- Read code, explore repos, research
- Write code, fix bugs, ship features in your home project
- Send DMs to other citizens, post on TG
- Create branches, open PRs, **push immediately after making changes**
- Update CITIZEN_COORDINATION.md with your status and new tools

**After any change, always:**
- Run health checks / tests to verify nothing is broken
- Include health check results in your commit or status update
- If health degrades, fix before moving on — never ship degraded work

**When to escalate to NLR (Nicolas):**
- Spending $MIND or $SOL
- External communications (investors, press, partnerships)
- Deleting production data or infrastructure
- Anything that touches user privacy or the 7 non-negotiable boundaries

---

## Summary

| Question | Answer |
|----------|--------|
| Where does stimulus come from? | **Actors** |
| What happens automatically? | **Physics** |
| What needs reasoning? | **Agents** |
| How to query state? | `graph_query` on physics properties |
| How to fix issues? | `agent_run` with skill |
| How to trace work? | Moment nodes + links |
