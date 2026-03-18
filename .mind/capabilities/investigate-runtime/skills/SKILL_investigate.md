# Skill: investigate

```
NODE: narrative:skill
STATUS: active
```

---

## Purpose

Agent skill for investigating runtime issues — errors and undocumented components.

---

## Gates

Prerequisites before using this skill:

```yaml
gates:
  - Agent can read log files
  - Agent can read source code
  - Agent can form and verify hypotheses
  - Agent can write documentation
```

---

## Process

```yaml
process:
  For LOG_ERROR:

  1. Gather context
     - Read error log entry and surrounding lines
     - Read stack trace if available
     - Identify time window (5 min before/after)
     - Check related log files for correlated events

  2. Form hypotheses
     - List possible root causes
     - For each: supporting evidence, counter-evidence
     - Rank by confidence

  3. Verify top hypothesis
     - Find evidence that confirms/denies
     - Check code at error location
     - Look for similar past errors

  4. Produce diagnosis
     - Root cause (WHY, not just WHAT)
     - Evidence supporting diagnosis
     - Recommended action
     - Create follow-up task if fix needed

  For HOOK_UNDOC:

  1. Read hook code
     - Understand what script does
     - Identify trigger (pre-commit, post-deploy, etc.)

  2. Analyze behavior
     - What does it check/modify?
     - What are side effects?
     - What happens on failure?

  3. Document in BEHAVIORS.md
     - Use standard format
     - Include all required sections

  4. Validate documentation
     - All fields present
     - Hook path linked
```

---

## Tips

- Start with the error message, then expand context
- Look for correlation, not just causation
- If hypothesis can't be verified, say so — escalate
- For hooks, test if possible before documenting
- Be concrete: cite line numbers, timestamps, values

---

## Executes

```yaml
executes:
  procedure: PROCEDURE_investigate
```

---

## Used By

```yaml
used_by:
  tasks:
    - TASK_investigate_error
    - TASK_document_hook
```
