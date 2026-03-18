# Add Tests — Sync

```
STATUS: CANONICAL
LAST_UPDATED: 2025-12-29
CAPABILITY: add-tests
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
| MISSING_TESTS | critical | Defined |
| INVARIANT_UNTESTED | high | Defined |
| TEST_NO_VALIDATES | medium | Defined |
| HEALTH_FAILED | critical | Defined |

### Artifacts

| Artifact | Status |
|----------|--------|
| tasks/TASK_add_tests.md | Active |
| tasks/TASK_test_invariant.md | Active |
| tasks/TASK_add_validates_markers.md | Active |
| tasks/TASK_fix_health.md | Active |
| skills/SKILL_write_tests.md | Active |
| procedures/PROCEDURE_add_tests.yaml | Active |
| runtime/checks.py | Pending implementation |

---

## RECENT CHANGES

### 2025-12-29

- Created full doc chain for add-tests capability
- Defined 4 problems in VOCABULARY
- Defined 4 health indicators with on_signal handlers:
  - H1: Test Coverage (MISSING_TESTS)
  - H2: Invariant Coverage (INVARIANT_UNTESTED)
  - H3: VALIDATES Markers (TEST_NO_VALIDATES)
  - H4: Health Status (HEALTH_FAILED)
- Documented algorithms for detection and execution
- Defined validation invariants (V1-V6)
- Created task templates for all 4 problems
- Created SKILL_write_tests and PROCEDURE_add_tests

---

## NEXT STEPS

1. **Implement runtime checks** — runtime/checks.py with @check decorators
2. **Test integration** — Verify tasks created on detection
3. **Agent training** — Validate SKILL_write_tests with agents
4. **Coverage baseline** — Run first scan to establish baseline

---

## HANDOFF

**For next agent:**

The add-tests capability doc chain is complete. It defines 4 problems:
- MISSING_TESTS (critical) — modules without tests
- INVARIANT_UNTESTED (high) — invariants without VALIDATES markers
- TEST_NO_VALIDATES (medium) — tests without VALIDATES markers
- HEALTH_FAILED (critical) — health check failures

Each problem has:
- Detection algorithm in ALGORITHM.md
- Health indicator in HEALTH.md with on_signal triggers
- Task template in tasks/
- Resolution through SKILL_write_tests and PROCEDURE_add_tests

Next work is implementing the runtime checks in Python.

**Agent subtype:** groundwork (implementing runtime) or keeper (validating tests)
