# Skill: Triage Error

```
SKILL: triage_error
CAPABILITY: flag-errors
```

---

## Purpose

Investigate an error, determine root cause, and decide on fix approach.

---

## Inputs

```yaml
inputs:
  fingerprint: string
  message: string
  stack_trace: string | null
  log_path: string
  occurrence_count: int
```

---

## Outputs

```yaml
outputs:
  root_cause: string
  affected_files: path[]
  severity: low | medium | high | critical
  fix_approach: string
  immediate_action: string | null
```

---

## Gates

### Gate 1: Error Is Reproducible

Before investigating deeply, confirm the error is real and recurring.

```yaml
gate: reproducible
check: occurrence_count > 1 OR can_reproduce_manually
pass: proceed to investigation
fail: mark as transient, monitor
```

### Gate 2: Not Duplicate

Ensure this isn't a variant of an already-known error.

```yaml
gate: unique
check: no similar fingerprints in resolved tasks
pass: proceed
fail: link to existing task, close as duplicate
```

### Gate 3: Actionable

The error must be something we can fix, not external dependency.

```yaml
gate: actionable
check: error originates from our code OR our config
pass: proceed
fail: document as external, create workaround task if needed
```

---

## Process

### Step 1: Gather Context

```yaml
step: gather_context
actions:
  - Read full error message and stack trace
  - Find the source file and line number
  - Read surrounding code
  - Check recent commits to that file
reasoning: Understanding what failed and when it started
```

### Step 2: Reproduce

```yaml
step: reproduce
actions:
  - Identify trigger conditions
  - Attempt to reproduce locally
  - Note exact steps to trigger
reasoning: Can't fix what you can't reproduce
```

### Step 3: Identify Root Cause

```yaml
step: root_cause
actions:
  - Trace code path that leads to error
  - Identify the bug or misconfiguration
  - Check if it's a regression (worked before?)
reasoning: Fix the cause, not the symptom
```

### Step 4: Assess Impact

```yaml
step: assess_impact
actions:
  - How many users affected?
  - Is data corrupted?
  - Is there a workaround?
  - What's the blast radius if we do nothing?
reasoning: Severity determines urgency
```

### Step 5: Plan Fix

```yaml
step: plan_fix
actions:
  - Identify files that need changes
  - Design the fix
  - Consider side effects
  - Decide: fix now or create task
reasoning: Right-sized response
```

---

## Uses Procedure

```yaml
procedure: PROCEDURE_investigate_error
```
