---
name: Review Evaluate Changes And Produce Auditable Report
---

# Skill: `mind.review_evaluate_changes`
@mind:id: SKILL.REVIEW.EVALUATE.PRODUCE_AUDITABLE_REPORT

## Maps to VIEW

---

## Context

Review in mind = producing auditable report with stable references.

Stable references:
- Docs: `@mind:id + file + header path`
- Code: `file:symbol`

Auditable = every claim can be traced to evidence. No assertions without references.

Report structure:
- Evidence: What docs/code support the claims
- Summary: What changed
- Verification: What was tested/checked
- Remaining gaps: Open TODOs, escalations, propositions

Review is not approval. Review produces the report; human/manager approves.

---

## Purpose
Produce a review-ready report with stable references and explicit remaining gaps.

---

## Inputs
```yaml
module: "<area/module>"        # string
changes: ["<files changed>"]   # list
```

## Outputs
```yaml
report:
  evidence:
    docs: ["<@mind:id + file + header>"]
    code: ["<file:symbol>"]
  summary:
    - "<what changed>"
  verification:
    - type: "test|health|manual"
      result: "pass|fail"
      evidence: "<reference>"
  remaining_gaps:
    todos: ["<open TODOs>"]
    escalations: ["<open escalations>"]
    propositions: ["<open propositions>"]
```

---

## Gates

- Must include stable references for non-trivial claims — auditable
- Must list remaining TODOs/escalations/propositions explicitly — no hidden work

---

## Process

### 1. Gather change scope
```yaml
batch_questions:
  - files: "What files were changed?"
  - docs: "What docs were updated?"
  - purpose: "What was the goal of these changes?"
```

### 2. Collect evidence
For each change:
- Code reference: `file:symbol`
- Doc reference: `@mind:id + file + header`

### 3. Document verification
What was tested? What passed/failed?
Include evidence (test output, health stream, manual check notes).

### 4. List remaining gaps
Scan for:
- `@mind:TODO` in changed files/docs
- `@mind:escalation` in SYNC
- `@mind:proposition` in SYNC

### 5. Produce report
Structured output with all sections filled.

---

## Procedures Referenced

| Protocol | When | Creates |
|----------|------|---------|
| `protocol:explore_space` | To gather context | exploration moment |
| `protocol:record_work` | To document review | progress moment |

---

## Evidence
- Docs: `@mind:id + file + header`
- Code: `file + symbol`

## Markers
- `@mind:TODO`
- `@mind:escalation`
- `@mind:proposition`

## Never-stop
If blocked → `@mind:escalation` + `@mind:proposition` → proceed with proposition.
