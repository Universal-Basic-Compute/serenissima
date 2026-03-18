---
name: Update Module Sync State And Record Markers
---

# Skill: `mind.sync_update_module_state`
@mind:id: SKILL.SYNC.UPDATE_STATE.RECORD_MARKERS

## Maps to VIEW
`(always-run; called after each module/task)`

---

## Context

SYNC update in mind = recording current state for handoff.

SYNC files: `docs/<area>/<module>/SYNC_*.md` and `SYNC_Project_State.md`.

SYNC purpose:
- What changed (recent work)
- What was verified (evidence)
- What's next (handoff for next agent/session)
- All markers (TODOs, escalations, propositions)

SYNC is always updated: After every module/task, SYNC must reflect current state. This is the handoff mechanism.

Markers must be collected: All `@mind:TODO`, `@mind:escalation`, `@mind:proposition` from the session.

---

## Purpose
Update SYNC_*.md to record present state: what changed, what verified, what's next, and all markers placed.

---

## Inputs
```yaml
module: "<area/module>"            # string
completed: ["<items done>"]        # list
verification:
  - type: "test|health|manual"
    result: "pass|fail"
    evidence: "<reference>"
markers:
  todos: ["<@mind:TODO text>"]
  escalations: ["<@mind:escalation text>"]
  propositions: ["<@mind:proposition text>"]
```

## Outputs
```yaml
sync_updated: "docs/<area>/<module>/SYNC_*.md"
sections_updated:
  - recent_changes
  - current_state
  - handoff
  - markers
```

---

## Gates

- Must be called after each module/task — no orphan work
- Must capture verification evidence and next actions — handoff is complete

---

## Process

### 1. Collect session work
```yaml
batch_questions:
  - completed: "What was completed this session?"
  - verified: "What was verified and how?"
  - blocked: "What is blocked or needs escalation?"
  - next: "What should the next agent do?"
```

### 2. Collect markers
Scan session output for:
- `@mind:TODO` — future work
- `@mind:escalation` — blockers
- `@mind:proposition` — suggestions

### 3. Update SYNC sections

**Recent Changes:**
```markdown
### <date>: <summary>
- What: <completed items>
- Verified: <verification results>
```

**Current State:**
```markdown
STATUS: <DESIGNING|CANONICAL|etc>
<current situation>
```

**Handoff:**
```markdown
**For next agent:**
- VIEW: <recommended VIEW>
- Focus: <what to work on>
- Blockers: <escalations if any>
```

**Markers:**
```markdown
## Open Markers
- TODO: <list>
- Escalations: <list>
- Propositions: <list>
```

---

## Procedures Referenced

| Protocol | When | Creates |
|----------|------|---------|
| `protocol:record_work` | To record session | progress moment |
| `protocol:update_sync` | To update SYNC node | updated SYNC narrative |

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
