# Implement Code — Sync

```
STATUS: CANONICAL
LAST_UPDATED: 2025-12-29
CAPABILITY: implement-code
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
| STUB_IMPL | critical | Defined |
| INCOMPLETE_IMPL | high | Defined |
| UNDOC_IMPL | high | Defined |
| STALE_IMPL | medium | Defined |

### Artifacts

| Artifact | Status |
|----------|--------|
| tasks/TASK_implement_stub.md | Created |
| tasks/TASK_complete_impl.md | Created |
| tasks/TASK_document_impl.md | Created |
| tasks/TASK_update_impl_docs.md | Created |
| skills/SKILL_implement.md | Created |
| procedures/PROCEDURE_implement.yaml | Created |
| runtime/checks.py | Pending implementation |

---

## RECENT CHANGES

### 2025-12-29

- Created full doc chain for implement-code capability
- Defined 4 problems in VOCABULARY (STUB_IMPL, INCOMPLETE_IMPL, UNDOC_IMPL, STALE_IMPL)
- Defined 4 health indicators (H1-H4) with on_signal handlers
- Documented detection and implementation algorithms
- Defined validation invariants (V1-V6)
- Created task templates for all 4 problem types
- Created SKILL_implement for agent execution
- Created PROCEDURE_implement for step-by-step guidance

---

## NEXT STEPS

1. **Implement runtime checks** — runtime/checks.py with @check decorators
2. **Test detection** — Verify stub and TODO detection on real codebase
3. **Integration test** — End-to-end task creation and execution
4. **Cross-language** — Add TypeScript/JavaScript patterns

---

## HANDOFF

**For next agent:**

The implement-code capability doc chain is complete. It defines 4 problems:
- STUB_IMPL: Functions with placeholder implementations
- INCOMPLETE_IMPL: Code with TODO/FIXME markers
- UNDOC_IMPL: IMPLEMENTATION.md without ALGORITHM.md
- STALE_IMPL: Code changed but docs not updated

Each problem has a corresponding task, all executed via SKILL_implement and PROCEDURE_implement.

Health indicators detect problems automatically via file watches, git hooks, and daily cron.

Next work is implementing runtime/checks.py with the actual detection logic.

**Agent subtype:** groundwork (building runtime) or keeper (testing detection)
