# Flag Errors — Objectives

```
STATUS: CANONICAL
CAPABILITY: flag-errors
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

Watch error logs and create tasks when new errors appear.

**Organ metaphor:** Immune system — detects anomalies and triggers response.

---

## RANKED OBJECTIVES

### O1: Error Visibility (Priority: Critical)

No error should go unnoticed. Every error logged creates awareness.

**Measure:** All error logs are watched; new errors create tasks within detection window.

### O2: Noise Reduction (Priority: High)

Known errors don't spam tasks. Only new or escalating patterns trigger action.

**Measure:** Duplicate errors are deduplicated; only unique errors create tasks.

### O3: Actionability (Priority: High)

Error tasks contain enough context to investigate and fix.

**Measure:** Task includes error message, stack trace, frequency, first occurrence.

### O4: Timeliness (Priority: Medium)

Errors detected within reasonable window, not real-time but not daily.

**Measure:** Detection runs on log append or every 5 minutes.

---

## NON-OBJECTIVES

- **NOT alerting** — Tasks, not pager duty. Severity informs priority, not notification.
- **NOT auto-fix** — Detection only. Fixing is a separate capability.
- **NOT log aggregation** — Watches files, doesn't centralize logs.

---

## TRADEOFFS

- When **speed** conflicts with **accuracy**, choose accuracy. Better to miss an error briefly than spam false positives.
- When **detail** conflicts with **noise**, choose noise reduction. Summarize repeated errors.
- We accept **lag** to prevent **duplicate tasks**.

---

## SUCCESS SIGNALS

- New unique errors create exactly one task
- Repeated errors increment counter on existing task, don't create new ones
- Error tasks resolved when fix deployed and error stops recurring
- `mind doctor` reports error watch coverage
