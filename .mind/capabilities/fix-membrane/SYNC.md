# Fix Membrane — Sync

```
STATUS: CANONICAL
LAST_UPDATED: 2025-12-29
CAPABILITY: fix-membrane
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
| MEMBRANE_NO_PROTOCOLS | critical | Defined |
| MEMBRANE_PARSE_ERROR | critical | Defined |
| MEMBRANE_INVALID_STEP | high | Defined |
| MEMBRANE_MISSING_FIELDS | high | Defined |

### Artifacts

| Artifact | Status |
|----------|--------|
| tasks/TASK_create_procedures.md | Created |
| tasks/TASK_fix_yaml_syntax.md | Created |
| tasks/TASK_fix_step_structure.md | Created |
| tasks/TASK_add_missing_fields.md | Created |
| skills/SKILL_fix_procedure.md | Created |
| procedures/PROCEDURE_fix_membrane.yaml | Created |
| runtime/checks.py | Not implemented |

---

## RECENT CHANGES

### 2025-12-29

- Created full doc chain for fix-membrane capability
- Defined 4 problems in VOCABULARY (MEMBRANE_NO_PROTOCOLS, MEMBRANE_PARSE_ERROR, MEMBRANE_INVALID_STEP, MEMBRANE_MISSING_FIELDS)
- Defined 4 health indicators (H1-H4) with on_signal handlers
- Created 4 task templates for each problem type
- Created SKILL_fix_procedure for agent repairs
- Created PROCEDURE_fix_membrane.yaml for step-by-step fixing

---

## NEXT STEPS

1. **Implement runtime** - runtime/checks.py with @check decorators
2. **Add to doctor** - Register capability with mind doctor
3. **Test detection** - Create broken procedures to test detection
4. **Test repair** - Verify automated repairs work correctly

---

## HANDOFF

**For next agent:**

The fix-membrane capability doc chain is complete. It handles 4 membrane problems related to procedure YAML files: missing procedures, parse errors, invalid steps, and missing fields.

Each problem has a corresponding task template and health indicator. The SKILL_fix_procedure guides agents through repairs, and PROCEDURE_fix_membrane.yaml provides step-by-step execution.

Next work is implementing the Python runtime in runtime/checks.py.

**Agent subtype:** groundwork (implementing runtime) or keeper (testing validation)
