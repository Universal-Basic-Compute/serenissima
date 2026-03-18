# Implement Code — Objectives

```
STATUS: CANONICAL
CAPABILITY: implement-code
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

Implement code that exists as stubs, complete partial implementations, and ensure code-to-docs synchronization.

**Organ metaphor:** Muscle — transforms intent into action, turns specifications into working code.

---

## RANKED OBJECTIVES

### O1: No Stub Functions (Priority: Critical)

Every function defined must have a real implementation, not pass/NotImplementedError.

**Measure:** No functions contain only `pass`, `...`, or `raise NotImplementedError`.

### O2: No Incomplete Code (Priority: Critical)

All TODO/FIXME markers represent tracked work, not abandoned functionality.

**Measure:** Every TODO/FIXME is either resolved or has a corresponding task.

### O3: Algorithm Documentation (Priority: High)

Every IMPLEMENTATION.md has a corresponding ALGORITHM.md explaining how the code works.

**Measure:** ALGORITHM.md exists for all modules with IMPLEMENTATION.md.

### O4: Docs-Code Synchronization (Priority: High)

Documentation reflects current code behavior. No stale descriptions.

**Measure:** Code changes trigger doc updates; LAST_UPDATED within 7 days of code change.

---

## NON-OBJECTIVES

- **NOT code generation from scratch** — We implement specified designs, not invent
- **NOT refactoring** — Focus on completion, not restructuring
- **NOT test writing** — Separate capability handles test coverage

---

## TRADEOFFS

- When **speed** conflicts with **correctness**, choose correctness.
- When **implementation freedom** conflicts with **ALGORITHM spec**, follow spec.
- We accept **longer implementations** to preserve **clarity**.

---

## SUCCESS SIGNALS

- `mind doctor` reports no STUB_IMPL or INCOMPLETE_IMPL problems
- Every IMPLEMENTATION.md has linked ALGORITHM.md
- Code changes auto-trigger doc sync checks
- Agents can understand code by reading ALGORITHM first
