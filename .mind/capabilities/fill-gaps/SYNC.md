# Fill Gaps — Sync

```
STATUS: CANONICAL
LAST_UPDATED: 2025-12-29
CAPABILITY: fill-gaps
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
| DOC_GAPS | high | Defined |
| DOC_DUPLICATION | medium | Defined |
| LARGE_DOC_MODULE | low | Defined |

### Artifacts

| Artifact | Status |
|----------|--------|
| tasks/TASK_fill_gap.md | Created |
| tasks/TASK_dedupe_content.md | Created |
| tasks/TASK_split_large_doc.md | Created |
| skills/SKILL_fill_gaps.md | Created |
| procedures/PROCEDURE_fill_gaps.yaml | Created |
| runtime/checks.py | Not implemented |

---

## RECENT CHANGES

### 2025-12-29

- Created full doc chain for fill-gaps capability
- Defined 3 problems in VOCABULARY: DOC_GAPS, DOC_DUPLICATION, LARGE_DOC_MODULE
- Defined 3 health indicators (H1, H2, H3) with on_signal handlers
- Documented algorithms for gap detection, duplication detection, size detection
- Documented algorithms for gap filling, deduplication, doc splitting
- Defined validation invariants (V1-V6)
- Created task templates for each problem type
- Created skill and procedure definitions

---

## NEXT STEPS

1. **Implement runtime checks** — runtime/checks.py with @check decorators
2. **Test gap detection** — Verify @mind:gap pattern matching
3. **Test duplication detection** — Verify similarity threshold
4. **Test size detection** — Verify line counting
5. **Integrate with mind doctor** — Wire up capability

---

## HANDOFF

**For next agent:**

The fill-gaps capability doc chain is complete. It defines problems (DOC_GAPS, DOC_DUPLICATION, LARGE_DOC_MODULE), health indicators with on_signal handlers, and the full detection-resolution-validation flow.

Three distinct workflows:
1. Gap filling: Find @mind:gap markers, research content, replace marker
2. Deduplication: Find overlapping docs, choose canonical, replace with refs
3. Doc splitting: Find >200 line docs, split SYNC by archiving or split others by section

Next work is implementing runtime/checks.py with the detection logic.

**Agent subtype:** groundwork (implementing checks) or voice (filling actual gaps)
