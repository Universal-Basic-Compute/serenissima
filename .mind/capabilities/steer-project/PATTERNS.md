# Steer Project — Patterns

```
STATUS: CANONICAL
CAPABILITY: steer-project
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

Projects drift. Work continues but direction blurs. SYNC files go stale. Escalations pile up. Nobody's looking at the big picture.

Without periodic steering, even active projects lose momentum. They work on what's in front of them, not what matters most.

---

## THE PATTERN

**Periodic strategic review with doc updates and task creation.**

1. Assess current state (read SYNC files, check tasks, review escalations)
2. Compare to vision (are we moving toward goals?)
3. Identify blockers (what's stopping progress?)
4. Update documentation (SYNC files, state tracking)
5. Create/prioritize tasks (what should happen next?)
6. Report findings (transparency for humans)

---

## PRINCIPLES

### Principle 1: Regular Cadence

Weekly review is mandatory. Not when remembered—scheduled.

### Principle 2: Evidence-Based

Don't assume state. Read files, check timestamps, query graph. Ground assessment in data.

### Principle 3: Action-Oriented

Reviews produce actions: tasks created, docs updated, escalations processed. Not just observations.

### Principle 4: Transparency

Assessment findings visible to humans. No hidden steering.

---

## DESIGN DECISIONS

### Why weekly?

Daily is overhead. Monthly is too slow for blockers. Weekly catches problems before they compound.

### Why update docs as part of steering?

Stale docs = false understanding. Steering with wrong info leads wrong direction.

### Why create tasks here?

Strategic tasks (not tactical). "We should refactor X" comes from stepping back, not from being in the weeds.

### Why process escalations?

Escalations are blocked work. Unprocessed escalations mean stalled progress.

---

## SCOPE

### In Scope

- Reading and updating SYNC files
- Processing escalation markers
- Strategic task creation
- Blocker identification
- Progress reporting
- Doc staleness detection

### Out of Scope

- Vision creation (human domain)
- Task execution (other capabilities)
- Code review (different process)
- Day-to-day task management
