# Skill: Decompose Objective

```
SKILL: decompose_objective
CAPABILITY: derive-tasks
```

---

## Purpose

Break down a vision objective into concrete, agent-executable tasks.

---

## Inputs

```yaml
inputs:
  objective: vision_objective
  current_state: state_summary    # What exists already
```

---

## Outputs

```yaml
outputs:
  tasks: derived_task[]
  coverage_estimate: float
```

---

## Gates

### Gate 1: Objective Is Clear

The objective must be understandable.

```yaml
gate: clarity
check: can restate objective in own words
pass: proceed
fail: escalate for clarification
```

### Gate 2: State Assessed

Must know what exists before identifying gaps.

```yaml
gate: state_known
check: current_state is populated
pass: proceed
fail: assess state first
```

---

## Process

### Step 1: Parse Objective

```yaml
step: parse
actions:
  - Identify the core goal
  - List implied sub-goals
  - Note any constraints mentioned
reasoning: Understand what success looks like
```

### Step 2: Assess Reality

```yaml
step: assess
actions:
  - What code exists?
  - What docs exist?
  - What's been attempted?
  - What's working vs broken?
reasoning: Ground the objective in reality
```

### Step 3: Identify Gaps

```yaml
step: gaps
actions:
  - Compare objective to reality
  - List what's missing
  - List what's incomplete
  - List what's broken
reasoning: Gaps become tasks
```

### Step 4: Decompose to Tasks

```yaml
step: decompose
actions:
  - For each gap:
    - Can an agent do this in one session?
    - If not, break down further
  - Each task gets:
    - Clear scope
    - Input requirements
    - Expected outputs
    - Done criteria
reasoning: Agent-executable scope
```

### Step 5: Validate Coverage

```yaml
step: validate
actions:
  - Union of tasks covers objective?
  - Any gaps not addressed?
  - Any overlap/duplication?
reasoning: Ensure completeness
```
