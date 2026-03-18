# Maintain Links — Sync

```
STATUS: CANONICAL
LAST_UPDATED: 2025-12-29
CAPABILITY: maintain-links
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
| ORPHAN_DOCS | medium | Defined |
| BROKEN_IMPL_LINK | high | Defined |

### Artifacts

| Artifact | Status |
|----------|--------|
| tasks/TASK_fix_orphan_docs.md | Created |
| tasks/TASK_fix_impl_link.md | Created |
| skills/SKILL_fix_links.md | Created |
| procedures/PROCEDURE_fix_links.yaml | Created |
| runtime/checks.py | Pending implementation |

---

## RECENT CHANGES

### 2025-12-29

- Created full doc chain for maintain-links capability
- Defined 2 problems in VOCABULARY (ORPHAN_DOCS, BROKEN_IMPL_LINK)
- Defined 2 health indicators (H1, H2) with on_signal handlers
- Documented detection and auto-resolution algorithms
- Defined validation invariants (V1-V5)
- Created task templates, skill, and procedure

---

## NEXT STEPS

1. **Implement runtime** — runtime/checks.py with @check decorated functions
2. **Test detection** — Verify H1 and H2 detect real issues
3. **Test auto-resolution** — Verify simple renames are auto-fixed
4. **Integration test** — End-to-end: detect -> task -> agent -> fix

---

## HANDOFF

**For next agent:**

The maintain-links capability doc chain is complete. It defines two problems (ORPHAN_DOCS, BROKEN_IMPL_LINK), two health indicators with on_signal handlers, and the full detection→auto-resolution→escalation flow.

Key design decisions:
- Auto-resolve simple renames (single file match)
- Escalate ambiguous cases to agent
- Preserve over delete (orphan docs flagged, not auto-deleted)
- Bidirectional validation (IMPL ↔ DOCS)

Next work is implementing runtime/checks.py with the actual Python code.

**Agent subtype:** groundwork (implementing runtime) or keeper (testing validation)
