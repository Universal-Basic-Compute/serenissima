---
name: Debug Investigate And Fix Issues With Evidence First
---

# Skill: `mind.debug_investigate_fix_issues`
@mind:id: SKILL.DEBUG.INVESTIGATE_FIX.EVIDENCE_FIRST

## Maps to VIEW

---

## Context

Debug workflow in mind is evidence-first:
1. Observe symptoms (logs, health stream, error messages)
2. Form hypotheses with evidence citations
3. Test hypotheses systematically
4. Fix with minimal change
5. Add regression prevention (test/health signal)
6. Update docs if behavior changed

Health stream: Real-time signals from `mind doctor` or connectome health panel. Use for live observation.

Evidence types:
- Health stream output (live signals)
- Log entries (backend.log, frontend console)
- Stack traces
- Graph state queries
- Test failures

Regression prevention:
- Add test if unit-testable
- Add health signal if runtime-observable
- Update VALIDATION if invariant was missing

---

## Purpose
Investigate and fix issues with evidence-first workflow; update docs and health signals to prevent recurrence.

---

## Inputs
```yaml
module: "<area/module>"           # string
symptom: "<error/log/behavior>"   # string, what was observed
```

## Outputs
```yaml
diagnosis:
  - hypothesis: "<what might be wrong>"
    evidence: "<file:line or log entry>"
fix:
  - "<files changed>"
doc_updates:
  - "<docs updated>"
regression_prevention:
  - type: "test|health_signal"
    location: "<file or signal name>"
```

---

## Gates

- Must cite evidence for each major claim — prevents speculation
- Must add regression prevention where canon expects — prevents recurrence
- Must update docs if behavior changed — keeps docs accurate

---

## Process

### 1. Gather evidence
```yaml
batch_questions:
  - symptom: "What exact error/behavior was observed?"
  - reproduction: "Steps to reproduce?"
  - context: "When did it start? What changed recently?"
  - scope: "Which module/file is likely involved?"
```

### 2. Query current state
- Check health stream for related signals
- Check logs for error patterns
- Query graph for related nodes if applicable

### 3. Form hypotheses
Each hypothesis needs evidence citation:
```yaml
hypothesis: "Tick phase order is wrong"
evidence: "engine/physics/tick.py:45 - decay runs before flow"
```

### 4. Test and fix
Minimal change. Don't refactor during debug.

### 5. Add regression prevention
- If unit-testable → add test
- If runtime-observable → add health signal
- Update VALIDATION if invariant was discovered

### 6. Update docs
If fix changed behavior → update BEHAVIORS.
If fix revealed missing invariant → update VALIDATION.

---

## Procedures Referenced

| Protocol | When | Creates |
|----------|------|---------|
| `protocol:investigate` | To explore issue | investigation moment |
| `protocol:add_health_coverage` | To add signal | health indicator + docks |

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
