# Add Tests — Patterns

```
STATUS: CANONICAL
CAPABILITY: add-tests
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

Code ships without tests. VALIDATION defines invariants that nobody verifies. Health checks fail with no one investigating. Tests exist but aren't linked to what they prove.

---

## THE PATTERN

**Invariant-driven test creation.**

1. System detects untested invariants (HEALTH triggers)
2. Creates task_run to write tests
3. Agent claims task, loads skill
4. Skill guides through procedure
5. Tests written with VALIDATES markers, problem resolved

---

## PRINCIPLES

### Principle 1: Invariants First

Don't write tests for code. Write tests for invariants. VALIDATION.md is the source of truth for what must be tested.

### Principle 2: Linkage Required

Every test must declare what it validates. VALIDATES markers create traceable proof that invariants are covered.

### Principle 3: Health as Trigger

Failed health checks create work. Not alerts to ignore, but tasks to complete.

### Principle 4: Continuous Verification

Tests run on every change. Health checks run continuously. Gaps surface automatically.

---

## DESIGN DECISIONS

### Why VALIDATES markers?

- Traceable coverage: which invariant does this test prove?
- Gap detection: which invariants have no tests?
- Documentation: tests explain their purpose
- Automation: doctor can check coverage automatically

### Why invariant-driven?

Each test should verify something specific:
- V1: Data never loses integrity
- V2: Auth checks always run
- V3: Errors always surface

Not "test this function" but "prove this invariant holds."

### Why health-driven tasks?

- Failed health = broken system = urgent work
- Untested invariant = risk = important work
- Missing tests = gap = scheduled work

Priority from severity, not human judgment.

---

## SCOPE

### In Scope

- Detecting missing tests for modules
- Detecting untested invariants
- Detecting tests without VALIDATES markers
- Responding to health check failures
- Creating tests from invariants

### Out of Scope

- Performance testing
- Integration testing
- Auto-generating test code
- Updating existing tests (separate capability)
