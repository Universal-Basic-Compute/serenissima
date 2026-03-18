# {Module Name} — Algorithm: {Brief Description of Procedures and Logic}

```
STATUS: DRAFT | REVIEW | STABLE
CREATED: {DATE}
VERIFIED: {DATE} against {COMMIT}
```

---

## CHAIN

```
OBJECTIVES:      ./OBJECTIVES_{name}.md
BEHAVIORS:       ./BEHAVIORS_*.md
PATTERNS:        ./PATTERNS_*.md
MECHANISMS:     ./MECHANISMS_*.md (if applicable)
THIS:            ALGORITHM_*.md (you are here)
VALIDATION:      ./VALIDATION_{name}.md
HEALTH:          ./HEALTH_{name}.md
IMPLEMENTATION:  ./IMPLEMENTATION_{name}.md
SYNC:            ./SYNC_{name}.md

IMPL:            {path/to/main/source/file.py}
```

> **Contract:** Read docs before modifying. After changes: update IMPL or add TODO to SYNC. Run tests.

---

## OVERVIEW

{High-level description of what this algorithm does}
{One paragraph summary of the approach}

---

## OBJECTIVES AND BEHAVIORS

| Objective | Behaviors Supported | Why This Algorithm Matters |
|-----------|---------------------|----------------------------|
| {Objective} | {Behavior IDs} | {what this algorithm guarantees} |

---

## DATA STRUCTURES

### {Structure Name}

```
{Description of the data structure}
{Fields, types, constraints}
```

### {Structure Name}

```
{Description}
```

---

## ALGORITHM: {Primary Function Name}

### Step 1: {Step Name}

{What happens in this step}
{Why this step exists}

```
{pseudocode if helpful}
```

### Step 2: {Step Name}

{What happens}
{Key decisions or branches}

### Step 3: {Step Name}

{What happens}
{How results are assembled}

---

## KEY DECISIONS

### D1: {Decision Point}

```
IF {condition}:
    {what happens — path A}
    {why this path}
ELSE:
    {what happens — path B}
    {why this path}
```

### D2: {Decision Point}

```
IF {condition}:
    {path A}
ELSE:
    {path B}
```

---

## DATA FLOW

```
{input}
    ↓
{transformation 1}
    ↓
{transformation 2}
    ↓
{output}
```

---

## COMPLEXITY

**Time:** O({complexity}) — {explanation}

**Space:** O({complexity}) — {explanation}

**Bottlenecks:**
- {Where might this be slow?}
- {What could cause performance issues?}

---

## HELPER FUNCTIONS

### `{helper_name}()`

**Purpose:** {what it does}

**Logic:** {brief description}

### `{helper_name}()`

**Purpose:** {what it does}

**Logic:** {brief description}

---

## INTERACTIONS

| Module | What We Call | What We Get |
|--------|--------------|-------------|
| {path} | {function} | {result} |
| {path} | {function} | {result} |

---

## MARKERS

> See PRINCIPLES.md "Feedback Loop" section for marker format and usage.

<!-- @mind:todo {Algorithm improvement to consider} -->
<!-- @mind:proposition {Optimization opportunity or alternative approach} -->
<!-- @mind:escalation {Design question needing decision} -->
