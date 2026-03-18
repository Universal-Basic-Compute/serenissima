# {Module Name} — Validation: What Must Be True

```
STATUS: DRAFT | DESIGNING | CANONICAL
CREATED: {DATE}
```

---

## CHAIN

```
OBJECTIVES:      ./OBJECTIVES_{name}.md
PATTERNS:        ./PATTERNS_*.md
BEHAVIORS:       ./BEHAVIORS_*.md
THIS:            VALIDATION_*.md (you are here)
ALGORITHM:       ./ALGORITHM_*.md (HOW — mechanisms go here)
IMPLEMENTATION:  ./IMPLEMENTATION_{name}.md
HEALTH:          ./HEALTH_{name}.md
SYNC:            ./SYNC_{name}.md
```

---

## PURPOSE

**Validation = what we care about being true.**

Not mechanisms. Not test paths. Not how things work.

What properties, if violated, would mean the system has failed its purpose?

These are the value-producing invariants — the things that make the module worth building.

---

## INVARIANTS

> **Naming:** Name by the value protected, not the mechanism.
> Bad: "Energy decay runs each tick"
> Good: "Attention fades without reinforcement"

### V1: {Value Protected}

**Why we care:** {What breaks or what value is lost if this invariant fails}

```
MUST:   {What must be true}
NEVER:  {What must never happen}
```

### V2: {Value Protected}

**Why we care:** {Consequence of violation}

```
MUST:   {What must be true}
NEVER:  {What must never happen}
```

### V3: {Value Protected}

**Why we care:** {Consequence of violation}

```
MUST:   {What must be true}
NEVER:  {What must never happen}
```

---

## PRIORITY

| Priority | Meaning | If Violated |
|----------|---------|-------------|
| **CRITICAL** | System purpose fails | Unusable |
| **HIGH** | Major value lost | Degraded severely |
| **MEDIUM** | Partial value lost | Works but worse |

---

## INVARIANT INDEX

| ID | Value Protected | Priority |
|----|-----------------|----------|
| V1 | {value} | CRITICAL |
| V2 | {value} | HIGH |
| V3 | {value} | MEDIUM |

---

## MARKERS

<!-- @mind:todo {Invariant that needs clarification} -->
<!-- @mind:proposition {Additional invariant to consider} -->
<!-- @mind:escalation {Unclear whether this is actually critical} -->
