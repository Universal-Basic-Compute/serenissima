# Derive Tasks — Behaviors

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
THIS:            BEHAVIORS.md (you are here)
ALGORITHM:       ./ALGORITHM.md
```

---

## OBSERVABLE BEHAVIORS

### B1: Vision Scan Creates Objectives

**When:** Vision docs exist (OBJECTIVES.md, vision.md, roadmap.md)
**Then:** Each stated goal extracted as vision_objective node
**Observable:** Graph contains vision_objective nodes with source_file links

### B2: Orphan Detection Creates Tasks

**When:** vision_objective has no linked tasks
**Then:** TASK_derive_tasks created for that objective
**Observable:** task_run node created, linked to orphan objective

### B3: Decomposition Produces Concrete Tasks

**When:** Agent processes TASK_derive_tasks
**Then:** Multiple specific, actionable tasks created
**Observable:** New task nodes with `derived_from` links to vision_objective

### B4: Coverage Tracking Updates

**When:** Task completed that links to vision_objective
**Then:** Coverage score recalculated
**Observable:** objective_coverage updated in graph

### B5: Achievement Detection

**When:** All tasks for objective complete AND evidence confirms success
**Then:** Objective marked achieved
**Observable:** vision_objective.status → achieved

---

## INTERACTION PATTERNS

### Pattern: Initial Vision Scan

```
1. Glob for vision docs: **/OBJECTIVES*.md, **/vision*.md, **/roadmap*.md
2. For each doc:
   - Parse markdown for objectives (headers, bullet points)
   - Create vision_objective node for each
   - Link to source file
3. Trigger coverage analysis
```

### Pattern: Gap Analysis

```
1. For each vision_objective:
   - Query graph for linked tasks
   - Check task statuses
   - Calculate coverage score
2. For objectives with coverage < threshold:
   - Create TASK_derive_tasks
```

### Pattern: Task Derivation

```
1. Agent reads vision_objective
2. Agent examines current state:
   - What code exists?
   - What docs exist?
   - What's still missing?
3. Agent decomposes into tasks:
   - Each task is agent-executable
   - Each task has clear completion criteria
   - Each task links back to objective
```

### Pattern: Coverage Update

```
1. Task marked complete
2. Find linked vision_objective
3. Recalculate:
   - completed_tasks / total_tasks
   - Weight by task complexity if available
4. If coverage >= 1.0:
   - Trigger achievement check
```
