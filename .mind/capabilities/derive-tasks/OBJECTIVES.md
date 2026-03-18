# Derive Tasks — Objectives

```
STATUS: CANONICAL
CAPABILITY: derive-tasks
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

Read high-level vision documents and create concrete tasks for what remains to be done.

**Organ metaphor:** Prefrontal cortex — translates abstract goals into actionable plans.

---

## RANKED OBJECTIVES

### O1: Vision-Task Alignment (Priority: Critical)

Every objective in vision docs should have corresponding tasks or be marked complete.

**Measure:** No vision objectives exist without linked tasks or completion evidence.

### O2: Gap Detection (Priority: Critical)

Identify what's stated in vision but missing in implementation.

**Measure:** All gaps between vision and reality are surfaced as tasks.

### O3: Task Actionability (Priority: High)

Generated tasks are concrete, scoped, and executable by an agent.

**Measure:** Tasks have clear inputs, outputs, and completion criteria.

### O4: No Duplication (Priority: High)

Don't create tasks for work already in progress or completed.

**Measure:** Zero duplicate tasks created.

---

## NON-OBJECTIVES

- **NOT vision creation** — Reads existing vision, doesn't invent goals
- **NOT prioritization** — Creates tasks, doesn't decide execution order
- **NOT execution** — Identifies work, doesn't do the work

---

## TRADEOFFS

- When **completeness** conflicts with **precision**, choose precision. Better to create 5 clear tasks than 20 vague ones.
- When **speed** conflicts with **accuracy**, choose accuracy. Missing context leads to bad tasks.
- We accept **fewer tasks** to ensure **each task is actionable**.

---

## SUCCESS SIGNALS

- Vision docs have full task coverage
- New vision additions automatically generate tasks
- Tasks created map cleanly to vision objectives
- `mind doctor` reports no orphan vision objectives
