# Improve Quality — Patterns

```
STATUS: CANONICAL
CAPABILITY: improve-quality
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

Code degrades over time. Files grow into monoliths. Magic numbers accumulate. Secrets slip into commits. SQL queries become unreadable. Naming drifts from conventions. Without continuous vigilance, technical debt compounds.

---

## THE PATTERN

**Detection-driven refactoring.**

1. System detects quality issues (HEALTH triggers)
2. Creates task_run to fix issue
3. Agent claims task, loads skill
4. Skill guides through refactoring procedure
5. Code improved, validated, problem resolved

---

## PRINCIPLES

### Principle 1: Secrets First

Security trumps all. Hardcoded secrets are critical severity, always.

### Principle 2: Incremental Refactoring

Split one file at a time. Extract one constant at a time. Small, verifiable changes.

### Principle 3: Script When Possible

Magic values and secrets can be extracted by script. Monolith splitting needs agent judgment.

### Principle 4: Preserve Behavior

Refactoring changes structure, not behavior. Tests must pass before and after.

---

## DESIGN DECISIONS

### Why 500 lines for monolith?

Research suggests 200-500 as cognitive limit for file comprehension. We choose 500 as pragmatic threshold — enough to allow necessary complexity, not so much that files become unmaintainable.

### Why 4000 chars for prompts?

4000 characters is approximately 1000 tokens. Beyond this, prompts become expensive and risk hitting context limits. Forces compression and modularization.

### Why separate tasks per problem type?

Each problem has different resolution strategy:
- MONOLITH: Agent decision on split boundaries
- MAGIC_VALUES: Script extraction
- HARDCODED_SECRET: Script extraction + rotation
- LONG_PROMPT: Agent compression
- LONG_SQL: Agent refactoring
- NAMING_CONVENTION: Script rename

### Why both script and agent methods?

Scripts are faster and more consistent for mechanical transformations. Agents are needed for decisions requiring understanding (where to split a file, how to compress a prompt).

---

## SCOPE

### In Scope

- Detecting quality problems automatically
- Creating tasks for detected problems
- Guiding refactoring through procedures
- Validating fixes

### Out of Scope

- Style formatting (use linters)
- Logic bugs (use tests)
- Architecture decisions (use architect agent)
- Performance tuning (use profiler)
