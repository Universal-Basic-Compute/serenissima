# Create Doc Chain — Patterns

```
STATUS: CANONICAL
CAPABILITY: create-doc-chain
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

Code exists. Documentation doesn't. Agents arrive and can't understand the system. Knowledge locked in code, inaccessible without deep reading.

---

## THE PATTERN

**Detection-driven documentation creation.**

1. System detects missing docs (HEALTH triggers)
2. Creates task_run to fix gap
3. Agent claims task, loads skill
4. Skill guides through procedure
5. Docs created, validated, problem resolved

---

## PRINCIPLES

### Principle 1: Code-First Detection

Don't wait for humans. Scan for code, check for docs, flag gaps automatically.

### Principle 2: Template-Driven

Never create from scratch. Always start from templates. Ensures consistency.

### Principle 3: Verification Required

Docs aren't done until verified against code. VERIFIED field must reference commit.

### Principle 4: Chain Integrity

Partial chain is worse than none — creates false confidence. Complete or don't start.

---

## DESIGN DECISIONS

### Why full chains?

Each doc answers different questions:
- OBJECTIVES: Why?
- PATTERNS: What approach?
- VOCABULARY: What terms?
- BEHAVIORS: What does it do?
- ALGORITHM: How?
- VALIDATION: What must be true?
- IMPLEMENTATION: Where's code?
- HEALTH: How to monitor?
- SYNC: Current state?

### Why templates?

- Consistent structure
- No forgotten sections
- Predictable locations
- Agent-scannable

### Why automated detection?

Humans forget. Systems don't.

---

## SCOPE

### In Scope

- Detecting missing doc chains
- Creating from templates
- Validating against templates
- Verifying against code

### Out of Scope

- Writing code
- Updating existing docs (sync-state capability)
- Translating docs
