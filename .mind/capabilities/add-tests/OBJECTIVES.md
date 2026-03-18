# Add Tests — Objectives

```
STATUS: CANONICAL
CAPABILITY: add-tests
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

Ensure all modules have test coverage that validates documented invariants.

**Organ metaphor:** Immune system — protects integrity through continuous verification.

---

## RANKED OBJECTIVES

### O1: Invariant Coverage (Priority: Critical)

Every invariant in VALIDATION.md must have a corresponding test with VALIDATES marker.

**Measure:** No VALIDATION invariant exists without a linked test.

### O2: Test Existence (Priority: Critical)

Every module must have test files. No code ships without verification.

**Measure:** All modules have tests/ directory with active test files.

### O3: Health Check Reliability (Priority: High)

Health checks must pass. Failures indicate system degradation requiring immediate attention.

**Measure:** All health checks return healthy or have active fix tasks.

### O4: Test-Invariant Linkage (Priority: High)

Tests must declare what they validate. VALIDATES markers connect tests to invariants.

**Measure:** All test functions have VALIDATES markers pointing to valid invariant IDs.

---

## NON-OBJECTIVES

- **NOT exhaustive coverage** — We test invariants, not every code path
- **NOT performance testing** — Separate capability for benchmarks
- **NOT integration testing** — Focus on unit/invariant tests first
- **NOT test generation** — We guide creation, not auto-generate

---

## TRADEOFFS

- When **coverage** conflicts with **speed**, choose coverage for critical paths.
- When **completeness** conflicts with **clarity**, choose clarity in test structure.
- We accept **more test files** to preserve **one invariant per test**.

---

## SUCCESS SIGNALS

- `mind doctor` reports no MISSING_TESTS or INVARIANT_UNTESTED problems
- New invariants trigger test creation tasks automatically
- Agents can verify any invariant by running its linked test
