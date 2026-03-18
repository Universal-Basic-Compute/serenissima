# Solve Markers — Patterns

```
STATUS: CANONICAL
CAPABILITY: solve-markers
```

---

## CHAIN

```
OBJECTIVES:      ./OBJECTIVES.md
THIS:            PATTERNS.md (you are here)
VOCABULARY:      ./VOCABULARY.md
BEHAVIORS:       ./BEHAVIORS.md
ALGORITHM:       ./ALGORITHM.md
```

---

## THE PROBLEM

Markers accumulate. @mind:escalation blocks work. @mind:proposition ideas get lost. TODO comments rot. Questions stay unanswered. Technical debt becomes invisible.

---

## THE PATTERN

**Marker-driven workflow routing.**

1. System detects markers (HEALTH triggers)
2. Classifies by type (escalation, proposition, legacy, question)
3. Creates appropriate task_run
4. Routes to capable agent
5. Agent resolves, documents decision
6. Marker removed, decision recorded

---

## PRINCIPLES

### Principle 1: Markers Are Signals

Every marker represents unfinished work or uncertainty. They're not decoration — they're work items.

### Principle 2: Type Determines Workflow

- Escalations need decisions from architects
- Propositions need evaluation
- Legacy markers need triage
- Questions need research

### Principle 3: Resolution Must Be Documented

Don't just remove markers. Record what was decided and why.

### Principle 4: Staleness Is Failure

Old markers indicate process breakdown. Freshness matters.

---

## DESIGN DECISIONS

### Why separate from doc-chain?

Different problem domain. Doc-chain creates structure. Solve-markers resolves friction.

### Why four problem types?

Each has different resolution workflow:
- ESCALATION: Decision required, blocking
- SUGGESTION: Evaluation required, non-blocking
- LEGACY_MARKER: Triage required, debt
- UNRESOLVED_QUESTION: Research required, uncertainty

### Why age thresholds?

Markers become stale. Fresh markers are being worked. Old markers are forgotten.

---

## SCOPE

### In Scope

- Detecting marker patterns
- Routing to appropriate agent
- Tracking resolution
- Documenting decisions

### Out of Scope

- Actually writing code to fix issues
- Making architectural decisions (escalates to human)
- Implementing accepted propositions (separate task)
