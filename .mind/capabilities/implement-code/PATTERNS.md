# Implement Code — Patterns

```
STATUS: CANONICAL
CAPABILITY: implement-code
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

Code exists in incomplete states: stubs defined but not implemented, TODOs marking unfinished work, implementations that have diverged from their documentation. Agents encounter these gaps and can't proceed or produce incorrect results.

---

## THE PATTERN

**Spec-driven implementation with doc sync.**

1. System detects implementation gaps (HEALTH triggers)
2. Creates task_run to fix gap
3. Agent claims task, loads skill
4. Skill guides implementation from ALGORITHM spec
5. Code completed, docs updated, problem resolved

---

## PRINCIPLES

### Principle 1: ALGORITHM First

Before implementing, read ALGORITHM.md. It specifies what the code should do. Implementation follows specification.

### Principle 2: Stub Detection

Stubs are technical debt. Detect them automatically: `pass`, `...`, `NotImplementedError`. Flag for immediate action.

### Principle 3: TODO Tracking

Every TODO in code must have a corresponding task or be resolved. Orphan TODOs are invisible debt.

### Principle 4: Doc Sync Required

When code changes, docs must update. Stale docs are worse than no docs — they mislead.

---

## DESIGN DECISIONS

### Why ALGORITHM before code?

ALGORITHM.md is the spec. Code is the implementation of that spec. Reading the spec first ensures implementation matches intent, not just "what compiles."

### Why detect stubs automatically?

Stubs are often created with intent to implement later. "Later" becomes "never." Automated detection forces resolution.

### Why sync docs with code?

Docs and code represent the same truth. When they diverge, agents (and humans) receive conflicting information. Synchronization maintains coherence.

### Why separate tasks per problem?

Each problem type requires different skills:
- STUB_IMPL: Implement from spec
- INCOMPLETE_IMPL: Complete partially done work
- UNDOC_IMPL: Write algorithm documentation
- STALE_IMPL: Update existing docs

---

## SCOPE

### In Scope

- Detecting stub implementations
- Detecting incomplete code (TODO/FIXME)
- Detecting missing ALGORITHM.md
- Detecting stale docs
- Implementing code from ALGORITHM spec
- Completing partial implementations
- Writing ALGORITHM.md from code analysis
- Updating docs after code changes

### Out of Scope

- Code generation from requirements (needs design first)
- Refactoring existing implementations
- Writing tests for implementations
- Performance optimization
