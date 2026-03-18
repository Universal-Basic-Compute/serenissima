# Investigate Runtime — Validation

```
STATUS: CANONICAL
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
THIS:            VALIDATION.md (you are here)
IMPLEMENTATION:  ./IMPLEMENTATION.md
```

---

## PURPOSE

Invariants for valid investigation. When is the work done correctly?

---

## INVARIANTS

### V1: Diagnosis Has Evidence

```
INVARIANT: Every diagnosis must include evidence

REQUIRED:
  - At least one log excerpt, stack trace, or state dump
  - Evidence directly supports the diagnosis
  - No diagnosis based solely on intuition

CHECK: diagnosis.evidence.length > 0
```

### V2: Root Cause Identified

```
INVARIANT: Diagnosis must identify root cause, not symptom

REQUIRED:
  - Root cause explains WHY error occurred
  - Not just WHAT error occurred
  - Actionable — points to fix location

CHECK: diagnosis.root_cause != diagnosis.symptom
```

### V3: Hook Documentation Complete

```
INVARIANT: Hook documentation has all required fields

REQUIRED:
  - Trigger described
  - Purpose explained
  - Side effects listed
  - Failure mode documented

CHECK: All required sections present in BEHAVIORS
```

### V4: Task Produces Output

```
INVARIANT: Every investigation task produces actionable output

REQUIRED (one of):
  - Diagnosis with recommended action
  - Escalation with context and hypotheses
  - Documentation in BEHAVIORS.md

CHECK: task_run.outputs.length > 0
```

### V5: Problem Resolution Verified

```
INVARIANT: Problem considered resolved only when verified

REQUIRED:
  - For LOG_ERROR: diagnosis exists AND (fix deployed OR workaround documented)
  - For HOOK_UNDOC: BEHAVIORS doc exists with all required fields

CHECK: Health check no longer detects problem
```

---

## VALIDATION CHECKS

| Check | Pass Condition |
|-------|----------------|
| Evidence present | Diagnosis has supporting evidence |
| Root cause found | Cause explains why, not what |
| Hook doc complete | All required sections filled |
| Output exists | Task produced diagnosis/escalation/doc |
| Problem resolved | Health check passes |

---

## ERROR MESSAGES

| Violation | Message |
|-----------|---------|
| No evidence | `Diagnosis lacks evidence: {diagnosis_id}` |
| Symptom only | `Diagnosis describes symptom, not root cause: {diagnosis_id}` |
| Incomplete hook doc | `Hook documentation missing: {missing_fields}` |
| No output | `Task completed without output: {task_id}` |
| Unverified resolution | `Problem marked resolved but still detected: {problem_id}` |

---

## TASK COMPLETION CRITERIA

### For TASK_investigate_error:

Task is **complete** when:

1. Diagnosis exists with evidence
2. Root cause identified (not just symptom)
3. Recommended action provided OR escalation raised
4. SYNC updated with investigation notes

### For TASK_document_hook:

Task is **complete** when:

1. BEHAVIORS doc exists for hook
2. All required fields present (trigger, purpose, side effects, failure mode)
3. Hook path linked in doc
4. Health check no longer detects HOOK_UNDOC

If any fail, task remains in_progress or escalates.
