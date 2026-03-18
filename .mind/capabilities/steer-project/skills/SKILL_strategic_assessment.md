# Skill: Strategic Assessment

```
SKILL: strategic_assessment
CAPABILITY: steer-project
```

---

## Purpose

Assess project state and identify strategic priorities.

---

## Inputs

```yaml
inputs:
  sync_files: path[]
  escalations: marker[]
  active_tasks: task[]
  recent_commits: commit[]
```

---

## Outputs

```yaml
outputs:
  findings: finding[]
  priorities: priority[]
  blockers: blocker[]
  recommendations: string[]
```

---

## Gates

### Gate 1: State Gathered

Must have current state before assessing.

```yaml
gate: state_complete
check: all inputs populated
pass: proceed
fail: gather more state
```

---

## Process

### Step 1: Review Progress

```yaml
step: progress
actions:
  - What shipped since last review?
  - What tasks completed?
  - What moved forward?
reasoning: Understand momentum
```

### Step 2: Identify Blockers

```yaml
step: blockers
actions:
  - What tasks are stuck?
  - What escalations exist?
  - What decisions are pending?
  - What external dependencies?
reasoning: Blockers kill velocity
```

### Step 3: Check Alignment

```yaml
step: alignment
actions:
  - Is current work aligned with vision?
  - Any drift into tangents?
  - Any forgotten priorities?
reasoning: Easy to lose strategic focus
```

### Step 4: Assess Doc Health

```yaml
step: doc_health
actions:
  - Which SYNC files are stale?
  - Any missing documentation?
  - Any contradictions?
reasoning: Bad docs lead to bad decisions
```

### Step 5: Prioritize

```yaml
step: prioritize
actions:
  - What's most important now?
  - What's blocking the most?
  - What has highest impact?
reasoning: Can't do everything, pick wisely
```

### Step 6: Recommend

```yaml
step: recommend
actions:
  - What should happen next?
  - What tasks to create?
  - What to escalate to humans?
reasoning: Actionable output
```
