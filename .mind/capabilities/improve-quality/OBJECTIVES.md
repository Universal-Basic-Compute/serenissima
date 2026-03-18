# Improve Quality — Objectives

```
STATUS: CANONICAL
CAPABILITY: improve-quality
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

Detect and fix code quality issues: monolithic files, magic values, hardcoded secrets, long prompts, complex SQL, and naming violations.

**Organ metaphor:** Immune system — detects and repairs structural damage before it spreads.

---

## RANKED OBJECTIVES

### O1: Security (Priority: Critical)

Hardcoded secrets must be detected and removed immediately.

**Measure:** No secrets in committed code. Zero tolerance.

### O2: Maintainability (Priority: Critical)

Code must be readable and modular. Monoliths must be split.

**Measure:** No code file exceeds 500 lines.

### O3: Consistency (Priority: High)

All code follows project naming conventions.

**Measure:** All names pass convention checks.

### O4: Clarity (Priority: High)

No magic values — all literals are named constants.

**Measure:** No hardcoded literals outside constant definitions.

### O5: Efficiency (Priority: Medium)

Prompts and SQL queries are optimized for size and complexity.

**Measure:** Prompts under 4000 chars, SQL under complexity threshold.

---

## NON-OBJECTIVES

- **NOT style formatting** — That's linter work
- **NOT logic correctness** — That's testing
- **NOT architecture** — That's design review
- **NOT performance optimization** — That's profiling

---

## TRADEOFFS

- When **speed** conflicts with **thoroughness**, choose thoroughness for secrets.
- When **refactoring risk** conflicts with **quality**, prefer incremental fixes.
- We accept **more files** to avoid **monoliths**.
- We accept **more constants** to avoid **magic values**.

---

## SUCCESS SIGNALS

- `mind doctor` reports no quality problems
- New code automatically checked on commit
- Security scans pass in CI
- Agents can navigate code without confusion
