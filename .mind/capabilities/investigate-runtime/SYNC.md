# Investigate Runtime — Sync

```
STATUS: CANONICAL
LAST_UPDATED: 2025-12-29
CAPABILITY: investigate-runtime
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
| LOG_ERROR | high | Defined |
| HOOK_UNDOC | medium | Defined |

### Artifacts

| Artifact | Status |
|----------|--------|
| tasks/TASK_investigate_error.md | Created |
| tasks/TASK_document_hook.md | Created |
| skills/SKILL_investigate.md | Created |
| procedures/PROCEDURE_investigate.yaml | Created |
| runtime/checks.py | Pending implementation |

---

## RECENT CHANGES

### 2025-12-29

- Created full doc chain for investigate-runtime capability
- Defined 2 problems in VOCABULARY: LOG_ERROR, HOOK_UNDOC
- Defined 2 health indicators (H1, H2) with on_signal handlers
- Documented investigation algorithm in pseudocode
- Defined validation invariants (V1-V5)
- Created task templates, skill, and procedure

---

## NEXT STEPS

1. **Implement detection** — runtime/checks.py with @check decorators
2. **Test log scanning** — Verify ERROR pattern detection
3. **Test hook discovery** — Verify undocumented hook detection
4. **Integration test** — End-to-end task creation on detection

---

## HANDOFF

**For next agent:**

The investigate-runtime capability doc chain is complete. It defines problems (LOG_ERROR, HOOK_UNDOC), health indicators with on_signal handlers, and the full detection -> investigation -> resolution flow.

Two distinct workflows:
1. **LOG_ERROR**: Detect errors in logs -> create investigation task -> agent investigates -> produces diagnosis with evidence
2. **HOOK_UNDOC**: Detect undocumented hooks -> create documentation task -> agent reads hook -> writes BEHAVIORS doc

Next work is implementing runtime/checks.py with the actual detection logic.

**Agent subtype:** groundwork (implementing runtime code) or witness (testing detection)
