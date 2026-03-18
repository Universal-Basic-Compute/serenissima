# Improve Quality — Sync

```
STATUS: CANONICAL
LAST_UPDATED: 2025-12-29
CAPABILITY: improve-quality
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
| MONOLITH | high | Defined |
| MAGIC_VALUES | medium | Defined |
| HARDCODED_SECRET | critical | Defined |
| LONG_PROMPT | medium | Defined |
| LONG_SQL | medium | Defined |
| NAMING_CONVENTION | low | Defined |

### Artifacts

| Artifact | Status |
|----------|--------|
| tasks/TASK_split_monolith.md | Created |
| tasks/TASK_extract_constants.md | Created |
| tasks/TASK_extract_secrets.md | Created |
| tasks/TASK_compress_prompt.md | Created |
| tasks/TASK_refactor_sql.md | Created |
| tasks/TASK_fix_naming.md | Created |
| skills/SKILL_refactor.md | Created |
| procedures/PROCEDURE_refactor.yaml | Created |
| runtime/checks.py | Pending implementation |

---

## RECENT CHANGES

### 2025-12-29

- Created full doc chain for improve-quality capability
- Defined 6 problems in VOCABULARY (MONOLITH, MAGIC_VALUES, HARDCODED_SECRET, LONG_PROMPT, LONG_SQL, NAMING_CONVENTION)
- Defined 6 health indicators (H1-H6) with on_signal handlers
- Documented detection and resolution algorithms
- Defined validation invariants (V1-V8)
- Created 6 task templates
- Created SKILL_refactor and PROCEDURE_refactor

---

## NEXT STEPS

1. **Implement runtime checks** — runtime/checks.py with @check decorators
2. **Implement scripts** — extract_constants, extract_secrets, rename_to_convention
3. **Test detection** — Run against sample codebase
4. **Integrate with doctor** — Add to `mind doctor` scan

---

## HANDOFF

**For next agent:**

The improve-quality capability doc chain is complete. It defines 6 quality problems with their detection algorithms, resolution strategies (script or agent), and validation criteria.

Key points:
- HARDCODED_SECRET is critical severity, always blocks
- MONOLITH requires agent judgment for split points
- MAGIC_VALUES, HARDCODED_SECRET, NAMING_CONVENTION can be script-resolved
- LONG_PROMPT and LONG_SQL require agent judgment

Next work is implementing the Python runtime checks in runtime/checks.py.

**Agent subtype:** groundwork (implementing runtime) or fixer (testing detection)
