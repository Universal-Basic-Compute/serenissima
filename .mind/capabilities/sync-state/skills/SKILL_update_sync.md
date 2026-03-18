# Skill: update_sync

```
NODE: narrative:skill
STATUS: active
```

---

## Purpose

Agent skill for updating SYNC files with current module state.

---

## Context

SYNC files are the heartbeat of module documentation. They record:
- Current status (DESIGNING, CANONICAL, BLOCKED, etc.)
- Recent changes
- Handoff notes for next agent
- Known issues and blockers

A stale SYNC means the documented state may not match reality. Updating requires reading actual changes and synthesizing meaningful content.

---

## Gates

Prerequisites before using this skill:

```yaml
gates:
  - SYNC file exists at target path
  - Agent can read git log for recent changes
  - Agent can write markdown
  - Agent understands module context (or can read it)
```

---

## Process

```yaml
process:
  1. Read current SYNC file
     - Understand existing state
     - Note what sections need updating

  2. Check git log for module
     - What files changed since LAST_UPDATED?
     - What commits touched this module?
     - Summarize: what work was done?

  3. Update STATUS if needed
     - DESIGNING: still in progress
     - CANONICAL: stable, ready
     - PROPOSED: future work
     - DEPRECATED: being phased out
     - BLOCKED: can't proceed (rare - usually shouldn't leave this status)

  4. Update RECENT_CHANGES section
     - Date, what changed, why
     - Files affected
     - Who made the changes

  5. Update HANDOFF section
     - What should next agent know?
     - Where did you stop?
     - What's the next logical step?

  6. Update LAST_UPDATED to today
     - Format: YYYY-MM-DD
     - Also update UPDATED_BY if present

  7. Verify content quality
     - No placeholders remain
     - Sections are meaningful, not empty
     - Handoff is actionable
```

---

## Tips

- Read existing content before overwriting
- Be specific in RECENT_CHANGES (what, not just "did work")
- HANDOFF should enable continuity — what would you want to know?
- Check if STATUS should change based on current state
- Don't just bump the date — add real value

---

## Quality Checklist

Before marking SYNC update complete:

- [ ] LAST_UPDATED is today
- [ ] STATUS reflects current reality
- [ ] RECENT_CHANGES has specific, dated entries
- [ ] HANDOFF tells next agent what they need
- [ ] No placeholder text remains
- [ ] Content adds value (not just date bump)

---

## Executes

```yaml
executes:
  procedure: PROCEDURE_update_sync
```

---

## Used By

```yaml
used_by:
  tasks:
    - TASK_update_sync
```

---

## Common Mistakes

| Mistake | Why Bad | Instead |
|---------|---------|---------|
| Just bump date | No value added | Summarize actual changes |
| Copy old handoff | Stale context | Write fresh handoff |
| Leave STATUS as-is | May be wrong now | Check if status changed |
| Generic changes | "Did work" | Specific: "Implemented X" |
| Skip git log | Miss what happened | Always check recent commits |
