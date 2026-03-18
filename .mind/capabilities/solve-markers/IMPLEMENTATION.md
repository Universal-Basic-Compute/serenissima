# Solve Markers — Implementation

```
STATUS: CANONICAL
CAPABILITY: solve-markers
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
THIS:            IMPLEMENTATION.md (you are here)
HEALTH:          ./HEALTH.md
SYNC:            ./SYNC.md
```

---

## PURPOSE

Where solve-markers code lives and how it's structured.

---

## FILE STRUCTURE

```
capabilities/solve-markers/                # Self-contained capability
├── OBJECTIVES.md
├── PATTERNS.md
├── VOCABULARY.md
├── BEHAVIORS.md
├── ALGORITHM.md
├── VALIDATION.md
├── IMPLEMENTATION.md                      # You are here
├── HEALTH.md
├── SYNC.md
├── tasks/
│   ├── TASK_resolve_escalation.md        # Task for escalations
│   ├── TASK_evaluate_proposition.md      # Task for propositions
│   ├── TASK_fix_legacy_marker.md         # Task for TODOs/FIXMEs
│   └── TASK_answer_question.md           # Task for questions
├── skills/
│   └── SKILL_solve_markers.md            # Agent skill
├── procedures/
│   └── PROCEDURE_solve_markers.yaml      # Step-by-step procedure
└── runtime/                              # MCP-executable code
    ├── __init__.py                       # Exports CHECKS list
    └── checks.py                         # @check decorated functions
```

### After `mind init`

```
.mind/capabilities/solve-markers/         # Full copy
└── [same structure]
```

---

## KEY COMPONENTS

### Runtime Code

```python
# capabilities/solve-markers/runtime/checks.py

from mind.capability import check, Signal, triggers

@check(
    id="escalation_freshness",
    triggers=[
        triggers.file.on_change("**/*"),
        triggers.cron.every("6h"),
    ],
    on_problem="ESCALATION",
    task="TASK_resolve_escalation",
)
def escalation_freshness(ctx) -> dict:
    """H1: Check for stale escalations."""
    markers = scan_for_pattern(ctx.root, r"@mind:escalation")
    stale = [m for m in markers if m.age_hours > 48]

    if not stale:
        return Signal.healthy()
    return Signal.critical(count=len(stale), markers=stale)


@check(
    id="proposition_freshness",
    triggers=[
        triggers.cron.weekly(),
    ],
    on_problem="SUGGESTION",
    task="TASK_evaluate_proposition",
)
def proposition_freshness(ctx) -> dict:
    """H2: Check for stale propositions."""
    markers = scan_for_pattern(ctx.root, r"@mind:proposition")
    stale = [m for m in markers if m.age_days > 7]

    if not stale:
        return Signal.healthy()
    if len(stale) < 5:
        return Signal.degraded(count=len(stale), markers=stale)
    return Signal.critical(count=len(stale), markers=stale)


@check(
    id="legacy_marker_freshness",
    triggers=[
        triggers.cron.daily(),
    ],
    on_problem="LEGACY_MARKER",
    task="TASK_fix_legacy_marker",
)
def legacy_marker_freshness(ctx) -> dict:
    """H3: Check for stale legacy markers."""
    markers = scan_for_legacy_markers(ctx.root)
    stale = [m for m in markers if m.age_days > 30]

    if not stale:
        return Signal.healthy()
    if len(stale) < 10:
        return Signal.degraded(count=len(stale), markers=stale)
    return Signal.critical(count=len(stale), markers=stale)


@check(
    id="question_freshness",
    triggers=[
        triggers.cron.weekly(),
    ],
    on_problem="UNRESOLVED_QUESTION",
    task="TASK_answer_question",
)
def question_freshness(ctx) -> dict:
    """H4: Check for stale questions."""
    markers = scan_for_pattern(ctx.root, r"@mind:question")
    stale = [m for m in markers if m.age_days > 14]

    if not stale:
        return Signal.healthy()
    return Signal.degraded(count=len(stale), markers=stale)
```

### Task Templates

See `tasks/` folder for:
- `TASK_resolve_escalation.md` — Resolve blocked escalations
- `TASK_evaluate_proposition.md` — Evaluate improvement ideas
- `TASK_fix_legacy_marker.md` — Fix or convert legacy markers
- `TASK_answer_question.md` — Research and answer questions

### Skill

See `skills/SKILL_solve_markers.md` — Agent skill for resolving all marker types.

### Procedure

See `procedures/PROCEDURE_solve_markers.yaml` — Step-by-step resolution procedure.

---

## INTEGRATION POINTS

### Triggers

| Trigger | When | Calls |
|---------|------|-------|
| file_watch | File changed | H1_escalation_freshness |
| cron:6h | Every 6 hours | H1_escalation_freshness |
| cron:daily | Every 24h | H3_legacy_marker_freshness |
| cron:weekly | Every 7d | H2_proposition_freshness, H4_question_freshness |

### Graph Nodes Created

| Node | Type | When |
|------|------|------|
| task_run | narrative:task_run | on_signal degraded/critical |
| decision_record | narrative:decision | escalation resolved |

### Links Created

| From | To | Nature |
|------|-----|--------|
| task_run | TASK_* | serves |
| task_run | target file | concerns |
| task_run | problem type | resolves |
| agent | task_run | claims |
| decision_record | task_run | documents |
