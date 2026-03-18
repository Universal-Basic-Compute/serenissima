# {Module Name} — Behaviors: {Brief Description of Observable Effects}

```
STATUS: DRAFT | REVIEW | STABLE
CREATED: {DATE}
VERIFIED: {DATE} against {COMMIT}
```

---

## CHAIN

```
OBJECTIVES:      ./OBJECTIVES_{name}.md
THIS:            BEHAVIORS_*.md (you are here)
PATTERNS:        ./PATTERNS_*.md
MECHANISMS:      ./MECHANISMS_*.md (if applicable)
ALGORITHM:       ./ALGORITHM_*.md
VALIDATION:      ./VALIDATION_{name}.md
HEALTH:          ./HEALTH_{name}.md
IMPLEMENTATION:  ./IMPLEMENTATION_*.md
SYNC:            ./SYNC_{name}.md

IMPL:            {path/to/main/source/file.py}
```

> **Contract:** Read docs before modifying. After changes: update IMPL or add TODO to SYNC. Run tests.

---

## BEHAVIORS

> **Naming:** Name behaviors by observable result, not by concept.
> Bad: "Moment Creation — Exhaust of Thinking"
> Good: "Thinking Produces Graph State"

### B1: {Observable Result}

**Why:** {Why this behavior exists. What problem it solves. What objective it serves.}

```
GIVEN:  {precondition — what state must exist}
WHEN:   {action or trigger — what happens}
THEN:   {outcome — what should result}
AND:    {additional outcome if needed}
```

### B2: {Observable Result}

**Why:** {Why this behavior matters.}

```
GIVEN:  {precondition}
WHEN:   {action}
THEN:   {outcome}
```

### B3: {Observable Result}

**Why:** {Why this behavior matters.}

```
GIVEN:  {precondition}
WHEN:   {action}
THEN:   {outcome}
```

---

## OBJECTIVES SERVED

| Behavior ID | Objective | Why It Matters |
|-------------|-----------|----------------|
| B1 | {Objective} | {what the behavior protects or enables} |
| B2 | {Objective} | {what the behavior protects or enables} |

---

## INPUTS / OUTPUTS

### Primary Function: `{function_name}()`

**Inputs:**

| Parameter | Type | Description |
|-----------|------|-------------|
| {name} | {type} | {what it is} |
| {name} | {type} | {what it is} |

**Outputs:**

| Return | Type | Description |
|--------|------|-------------|
| {name} | {type} | {what it is} |

**Side Effects:**

- {What state changes, if any}
- {What external effects, if any}

---

## EDGE CASES

### E1: {Edge Case Name}

```
GIVEN:  {unusual or boundary condition}
THEN:   {what should happen}
```

### E2: {Edge Case Name}

```
GIVEN:  {unusual condition}
THEN:   {what should happen}
```

---

## ANTI-BEHAVIORS

What should NOT happen:

### A1: {Anti-Behavior Name}

```
GIVEN:   {condition}
WHEN:    {action}
MUST NOT: {what should never happen}
INSTEAD:  {what should happen}
```

### A2: {Anti-Behavior Name}

```
GIVEN:   {condition}
WHEN:    {action}
MUST NOT: {bad outcome}
INSTEAD:  {correct outcome}
```

---

## MARKERS

> See PRINCIPLES.md "Feedback Loop" section for marker format and usage.

<!-- @mind:todo {Behavior that needs clarification} -->
<!-- @mind:proposition {Potential future behavior} -->
<!-- @mind:escalation {Uncertain edge case needing decision} -->
