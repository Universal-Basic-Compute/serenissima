# Investigate Runtime — Objectives

```
STATUS: CANONICAL
CAPABILITY: investigate-runtime
```

---

## CHAIN

```
THIS:            OBJECTIVES.md (you are here)
PATTERNS:        ./PATTERNS.md
VOCABULARY:      ./VOCABULARY.md
BEHAVIORS:       ./BEHAVIORS.md
ALGORITHM:       ./ALGORITHM.md
VALIDATION:      ./VALIDATION.md
IMPLEMENTATION:  ./IMPLEMENTATION.md
HEALTH:          ./HEALTH.md
SYNC:            ./SYNC.md
```

---

## PURPOSE

Investigate runtime issues — log errors and undocumented hooks — to restore system health.

**Organ metaphor:** Immune system — detects anomalies and triggers responses to restore health.

---

## RANKED OBJECTIVES

### O1: Error Detection (Priority: Critical)

Runtime errors must be detected and surfaced promptly. Silent failures are unacceptable.

**Measure:** No ERROR-level log entries remain uninvestigated for >24h.

### O2: Hook Documentation (Priority: High)

Every hook in the system must be documented. Undocumented hooks are mystery behavior.

**Measure:** All hook files have corresponding BEHAVIORS documentation.

### O3: Root Cause Identification (Priority: High)

Errors aren't resolved by retrying — they're resolved by understanding root cause.

**Measure:** Investigation produces concrete diagnosis with evidence.

### O4: Actionable Output (Priority: Medium)

Investigation must produce work items or decisions, not just reports.

**Measure:** Every investigation creates task or marks resolved.

---

## NON-OBJECTIVES

- **NOT automatic fixing** — Investigation identifies, humans/agents decide
- **NOT log aggregation** — We detect patterns, not store logs
- **NOT performance monitoring** — Focus on errors, not metrics

---

## TRADEOFFS

- When **speed** conflicts with **thoroughness**, choose thoroughness.
- When **certainty** conflicts with **action**, produce hypothesis with confidence level.
- We accept **longer investigations** to avoid **misdiagnosis**.

---

## SUCCESS SIGNALS

- `mind doctor` reports no unresolved LOG_ERROR problems
- All hooks listed in `ls .git/hooks/` have BEHAVIORS docs
- Agents can pick up investigation tasks and resolve them independently
