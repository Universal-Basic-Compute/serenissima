# Skill: solve_markers

```
NODE: narrative:skill
STATUS: active
```

---

## Purpose

Agent skill for resolving all marker types: escalations, propositions, legacy markers, and questions.

---

## Gates

Prerequisites before using this skill:

```yaml
gates:
  - Agent can read source code and docs
  - Agent can write to files (remove markers, add comments)
  - Agent has access to git (for age checking)
  - Target file exists and is writable
  - Marker is confirmed present
```

---

## Process

### For ESCALATION

```yaml
process:
  1. Read escalation context
     - Marker text and surrounding 20 lines
     - Related files if referenced
     - SYNC for recent changes

  2. Identify decision needed
     - What question is being asked?
     - What options exist?
     - What are the tradeoffs?

  3. Assess if agent can decide
     - Is this within agent authority?
     - Is confidence > 0.8?
     - Are all facts known?

  4. If can decide:
     - State decision clearly
     - Document rationale
     - Remove marker
     - Add decision record if significant

  5. If cannot decide:
     - Escalate to human
     - Provide analysis and recommendation
     - Mark task as blocked

  6. Update SYNC
```

### For SUGGESTION

```yaml
process:
  1. Read proposition context
     - Marker text and surrounding code
     - Related patterns in codebase

  2. Evaluate proposition
     - Feasibility: Can it be done?
     - Value: Is it worth doing?
     - Effort: How much work?
     - Risk: What could go wrong?

  3. Determine disposition
     - Accept: High value, low effort, low risk
     - Reject: Low value or high risk
     - Defer: Needs more info or not now

  4. If accepting:
     - Create implementation task
     - Add task ID as reference

  5. Document disposition
     - Clear statement: ACCEPTED/REJECTED/DEFERRED
     - Rationale for decision

  6. Remove marker

  7. Update SYNC
```

### For LEGACY_MARKER

```yaml
process:
  1. Read marker context
     - Marker text (TODO/FIXME/HACK/XXX)
     - Surrounding code

  2. Assess relevance
     - Is the issue still present?
     - Has it already been fixed?
     - Is it obsolete due to refactor?

  3. If obsolete:
     - Delete marker
     - Done

  4. If relevant, assess effort:
     - Quick fix (< 30 min)?
     - Larger work?

  5. If quick fix:
     - Apply fix
     - Remove marker
     - Test if applicable

  6. If larger work:
     - Create tracked task with description
     - Remove marker (task tracks work now)

  7. Update SYNC
```

### For UNRESOLVED_QUESTION

```yaml
process:
  1. Read question context
     - Question text
     - Surrounding code/docs

  2. Research answer
     - Search codebase for patterns
     - Check existing documentation
     - Review similar code
     - External research if needed

  3. Assess confidence
     - Is answer definitive?
     - Are there caveats?
     - Could it be wrong?

  4. If confident (> 0.7):
     - Document answer near question
     - Or update relevant docs
     - Remove marker

  5. If uncertain:
     - Escalate to human
     - Provide research findings
     - Suggest possible answers

  6. Update SYNC
```

---

## Tips

- Always read context thoroughly before acting
- Check if marker is still relevant (may be stale)
- Document decisions, not just actions
- When uncertain, escalate rather than guess
- Use graph_query to find related context
- Keep SYNC current with what you did

---

## Executes

```yaml
executes:
  procedure: PROCEDURE_solve_markers
```

---

## Used By

```yaml
used_by:
  tasks:
    - TASK_resolve_escalation
    - TASK_evaluate_proposition
    - TASK_fix_legacy_marker
    - TASK_answer_question
```
