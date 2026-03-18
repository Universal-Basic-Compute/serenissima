# Solve Markers — Sync

```
STATUS: CANONICAL
LAST_UPDATED: 2025-12-29
CAPABILITY: solve-markers
```

---

## CHAIN

```
OBJECTIVES:      ./OBJECTIVES.md
PATTERNS:        ./PATTERNS.md
VOCABULARY:      ./VOCABULARY.md
BEHAVIORS:       ./BEHAVIORS.md
ALGORITHM:       ./ALGORITHM.md
VALIDATION:      ./VALIDATION.md
IMPLEMENTATION:  ./IMPLEMENTATION.md
HEALTH:          ./HEALTH.md
THIS:            SYNC.md (you are here)
```

---

## CURRENT STATE

### Maturity

| Component | Status |
|-----------|--------|
| OBJECTIVES | Canonical |
| PATTERNS | Canonical |
| VOCABULARY | Canonical |
| BEHAVIORS | Canonical |
| ALGORITHM | Canonical |
| VALIDATION | Canonical |
| IMPLEMENTATION | Canonical |
| HEALTH | Canonical |

### Problems Owned

| Problem | Severity | Status |
|---------|----------|--------|
| ESCALATION | critical | Defined |
| SUGGESTION | medium | Defined |
| LEGACY_MARKER | low | Defined |
| UNRESOLVED_QUESTION | medium | Defined |

### Artifacts

| Artifact | Status |
|----------|--------|
| tasks/TASK_resolve_escalation.md | Created |
| tasks/TASK_evaluate_proposition.md | Created |
| tasks/TASK_fix_legacy_marker.md | Created |
| tasks/TASK_answer_question.md | Created |
| skills/SKILL_solve_markers.md | Created |
| procedures/PROCEDURE_solve_markers.yaml | Created |
| runtime/checks.py | Not implemented |

---

## RECENT CHANGES

### 2025-12-29

- Created full doc chain for solve-markers capability
- Defined 4 problems in VOCABULARY: ESCALATION, SUGGESTION, LEGACY_MARKER, UNRESOLVED_QUESTION
- Defined 4 health indicators (H1-H4) with on_signal handlers
- Documented algorithms for detection, classification, resolution
- Defined validation invariants (V1-V6)
- Created task templates for each problem type
- Created skill and procedure

---

## NEXT STEPS

1. **Implement runtime checks** — runtime/checks.py with @check decorators
2. **Test detection** — Verify marker scanning works on real codebase
3. **Integration test** — End-to-end: detect → task → resolve → verify

---

## HANDOFF

**For next agent:**

The solve-markers capability doc chain is complete. It defines 4 problems (ESCALATION, SUGGESTION, LEGACY_MARKER, UNRESOLVED_QUESTION), corresponding health indicators with on_signal handlers, and resolution algorithms for each.

Key patterns:
- Escalations are critical, need decisions within 48h
- Propositions need evaluation within 7d
- Legacy markers need triage within 30d
- Questions need answers within 14d

Next work is implementing the runtime checks in Python and testing on a real codebase.

**Agent subtype:** groundwork (implementing runtime) or witness (testing detection)
