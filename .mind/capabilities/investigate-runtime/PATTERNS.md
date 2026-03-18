# Investigate Runtime — Patterns

```
STATUS: CANONICAL
CAPABILITY: investigate-runtime
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

Runtime failures happen. Logs fill with errors. Hooks exist that no one understands. Without systematic investigation, these issues persist — causing confusion, repeated failures, and accumulating technical debt.

---

## THE PATTERN

**Evidence-first investigation.**

1. System detects anomaly (log error, undocumented hook)
2. Creates task_run to investigate
3. Agent claims task, loads investigation skill
4. Agent follows structured procedure: observe → hypothesize → verify
5. Produces diagnosis with evidence, creates follow-up work

---

## PRINCIPLES

### Principle 1: Observe Before Hypothesizing

Don't jump to conclusions. Gather evidence first. Read logs, trace flows, check state.

### Principle 2: Evidence Over Intuition

Every claim needs evidence. "I think X" becomes "X because [evidence]".

### Principle 3: Root Cause Over Symptoms

Don't fix the symptom. Find the root cause. If database errors appear, understand why — don't just retry.

### Principle 4: Documented Output

Investigation without documentation is wasted work. Record what you found, even if negative.

---

## DESIGN DECISIONS

### Why structured investigation?

Ad-hoc debugging leads to:
- Inconsistent depth
- Lost findings
- Repeated investigation of same issues

Structured approach ensures completeness.

### Why separate error vs hook tasks?

Different artifacts, different agents:
- Errors → fixer/witness agents, produces diagnosis
- Hooks → voice agent, produces documentation

### Why evidence requirements?

Without evidence:
- Misdiagnosis
- Wasted fixes
- False confidence

---

## SCOPE

### In Scope

- Detecting log errors and surfacing them
- Detecting undocumented hooks
- Guided investigation procedure
- Producing diagnosis or documentation

### Out of Scope

- Implementing fixes (that's groundwork/fixer)
- Log storage/aggregation
- Performance monitoring
- Security scanning
