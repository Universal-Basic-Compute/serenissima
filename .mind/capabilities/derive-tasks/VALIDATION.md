# Derive Tasks — Validation

```
STATUS: CANONICAL
CAPABILITY: derive-tasks
```

---

## CHAIN

```
OBJECTIVES:      ./OBJECTIVES.md
PATTERNS:        ./PATTERNS.md
VOCABULARY:      ./VOCABULARY.md
BEHAVIORS:       ./BEHAVIORS.md
ALGORITHM:       ./ALGORITHM.md
THIS:            VALIDATION.md (you are here)
IMPLEMENTATION:  ./IMPLEMENTATION.md
```

---

## INVARIANTS

### V1: Every Objective Has Node

**Statement:** Every parsed objective exists as a vision_objective node.

**Check:** `count(vision docs objectives) == count(graph vision_objective nodes)`

**Verified by:** Health check after scan

### V2: Tasks Link to Objectives

**Statement:** Every derived task links back to its source objective.

**Check:** `derived_task.links contains derived_from`

**Verified by:** Task creation validation

### V3: No Duplicate Tasks

**Statement:** Same work item from same objective doesn't create multiple tasks.

**Check:** Unique(objective_id + work_item_hash)

**Verified by:** Dedup check before creation

### V4: Coverage Accuracy

**Statement:** Coverage scores reflect actual task states.

**Check:** Recalculate coverage, compare to stored value.

**Verified by:** Periodic health check

### V5: Decomposition Completeness

**Statement:** Derived tasks fully cover the objective's scope.

**Check:** Union of task scopes ≈ objective scope

**Verified by:** Agent review, human verification

---

## ACCEPTANCE CRITERIA

### AC1: Vision Parsing

- Parses OBJECTIVES.md ranked format (O1, O2, ...)
- Parses bullet-point objectives
- Handles multiple vision docs
- Preserves source file links

### AC2: Gap Detection

- Identifies objectives with zero tasks
- Identifies objectives with low coverage
- Identifies stale objectives (no recent activity)
- Doesn't flag achieved objectives

### AC3: Task Creation

- Tasks are concrete and actionable
- Tasks have clear completion criteria
- Tasks link to source objective
- No duplicate tasks created

### AC4: Coverage Tracking

- Updates on task completion
- Accurate score calculation
- Triggers achievement check at 100%

### AC5: Achievement Detection

- Marks objective achieved when all tasks complete
- Requires evidence of success
- Updates objective status in graph
