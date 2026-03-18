# Solve Markers — Objectives

```
STATUS: CANONICAL
CAPABILITY: solve-markers
```

---

## CHAIN

```
THIS:            OBJECTIVES.md (you are here)
PATTERNS:        ./PATTERNS.md
VOCABULARY:      ./VOCABULARY.md
BEHAVIORS:       ./BEHAVIORS.md
ALGORITHM:       ./ALGORITHM.md
VALIDATION:      ./VALIDATION.md
IMPLEMENTATION:  ./IMPLEMENTATION.md
HEALTH:          ./HEALTH.md
SYNC:            ./SYNC.md
```

---

## PURPOSE

Resolve markers that indicate blocked work, improvement ideas, technical debt, or unanswered questions.

**Organ metaphor:** Attention — focuses consciousness on unresolved friction points.

---

## RANKED OBJECTIVES

### O1: Escalation Resolution (Priority: Critical)

@mind:escalation markers must not block work indefinitely. Each escalation needs a decision.

**Measure:** No escalation older than 48 hours without resolution or explicit deferral.

### O2: Proposition Evaluation (Priority: High)

@mind:proposition markers capture improvement ideas. Each needs evaluation and disposition.

**Measure:** Every proposition evaluated within 7 days — accepted, rejected, or deferred.

### O3: Legacy Marker Cleanup (Priority: Medium)

TODO, FIXME, HACK, XXX markers represent technical debt. Track or resolve them.

**Measure:** No legacy marker older than 30 days without conversion to tracked task.

### O4: Question Resolution (Priority: Medium)

Unanswered questions indicate uncertainty. Each needs research and documentation.

**Measure:** No question marker without answer after 14 days.

---

## NON-OBJECTIVES

- **NOT code quality enforcement** — That's linting, not marker solving
- **NOT automatic fixing** — Markers need judgment, not scripts
- **NOT prioritization** — We surface; humans/architects decide priority

---

## TRADEOFFS

- When **speed** conflicts with **thoroughness**, choose thoroughness for escalations, speed for legacy markers.
- When **autonomy** conflicts with **approval**, escalations require approval, propositions can be autonomous.
- We accept **deferred items** to preserve **decision quality**.

---

## SUCCESS SIGNALS

- `mind doctor` reports no stale markers
- Escalations surface in agent task lists
- Propositions become tracked tasks or documented rejections
- Legacy TODOs either fixed or converted to proper tasks
