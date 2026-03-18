---
name: Implement Write Or Modify Code With Doc Chain Coupling
---

# Skill: `mind.implement_write_or_modify_code`
@mind:id: SKILL.IMPLEMENT.WRITE_OR_MODIFY.DOC_CHAIN_COUPLING

## Maps to VIEW

---

## Context

Code-doc coupling in mind:
- Every meaningful code change requires doc chain update
- Docs reference code: docking points in IMPLEMENTATION
- Code references docs: `# DOCS: path/to/PATTERNS.md` comments

Canon naming: Use terms from PATTERNS/CONCEPT. Don't invent new terminology without updating canon.

Verification requirement: Don't claim "done" without evidence. Run tests, check health stream, verify behavior.

Doc chain coupling flow:
```
Code change → Check VALIDATION (still holds?) → Update BEHAVIORS (if observable effect changed)
           → Update IMPLEMENTATION (if structure changed) → Update HEALTH (if verification needed)
           → Update SYNC (always, for handoff)
```

---

## Purpose
Perform code edits while coupling implementation changes to doc chain updates and preserving canon naming and verification expectations.

---

## Inputs
```yaml
module: "<area/module>"    # string
task: "<what to change>"   # string
```

## Outputs
```yaml
code_changes:
  - "<files modified>"
doc_updates:
  - "<docs updated>"
verification:
  - type: "test|health|manual"
    result: "pass|fail"
    evidence: "<output or reference>"
```

---

## Gates

- Update doc chain for every meaningful code change — no orphan changes
- No new terms without canon support — use PATTERNS/CONCEPT terminology
- Verify before claiming done — evidence required

---

## Process

### 1. Load context before coding
```yaml
batch_questions:
  - patterns: "What design decisions govern this module?"
  - implementation: "Where does code live, what's the structure?"
  - validation: "What invariants must hold?"
  - current_sync: "What's the current state, any handoffs?"
```

### 2. Make code changes
Follow canon naming. Use existing patterns from IMPLEMENTATION.

### 3. Update doc chain
| Change type | Update |
|-------------|--------|
| New function/class | IMPLEMENTATION docking points |
| Behavior change | BEHAVIORS |
| New constraint | VALIDATION |
| Structure change | ALGORITHM |
| Any change | SYNC |

### 4. Add code→doc reference
```python
# DOCS: docs/<area>/<module>/PATTERNS_*.md
```

### 5. Verify
- Run tests if unit-testable
- Check health stream if runtime-observable
- Document evidence of pass/fail

---

## Procedures Referenced

| Protocol | When | Creates |
|----------|------|---------|
| `protocol:explore_space` | Before coding | Understanding of current state |
| `protocol:record_work` | After completing | progress moment + handoff |

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
