# Investigate Runtime — Implementation

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
VALIDATION:      ./VALIDATION.md
THIS:            IMPLEMENTATION.md (you are here)
HEALTH:          ./HEALTH.md
SYNC:            ./SYNC.md
```

---

## PURPOSE

Where investigate-runtime code lives and how it's structured.

---

## FILE STRUCTURE

```
capabilities/investigate-runtime/              # Self-contained capability
├── OBJECTIVES.md
├── PATTERNS.md
├── VOCABULARY.md
├── BEHAVIORS.md
├── ALGORITHM.md
├── VALIDATION.md
├── IMPLEMENTATION.md                          # You are here
├── HEALTH.md
├── SYNC.md
├── tasks/
│   ├── TASK_investigate_error.md              # Error investigation task
│   └── TASK_document_hook.md                  # Hook documentation task
├── skills/
│   └── SKILL_investigate.md                   # Investigation skill
├── procedures/
│   └── PROCEDURE_investigate.yaml             # Step-by-step procedure
└── runtime/                                   # MCP-executable code
    ├── __init__.py                            # Exports CHECKS list
    └── checks.py                              # @check decorated functions
```

### After `mind init`

```
.mind/capabilities/investigate-runtime/        # Full copy
└── [same structure]
```

---

## KEY COMPONENTS

### Runtime Code

```python
# capabilities/investigate-runtime/runtime/checks.py

from mind.capability import check, Signal, triggers

@check(
    id="log_error_detection",
    triggers=[
        triggers.stream.on_error(".mind/logs/*.log"),
        triggers.cron.hourly(),
    ],
    on_problem="LOG_ERROR",
    task="TASK_investigate_error",
)
def log_error_detection(ctx) -> dict:
    """H1: Detect ERROR entries in log files."""
    errors = scan_logs_for_errors(ctx.log_paths)

    if not errors:
        return Signal.healthy()
    if len(errors) >= 5:
        return Signal.critical(errors=errors)
    return Signal.degraded(errors=errors)


@check(
    id="hook_documentation",
    triggers=[
        triggers.init.after_scan(),
        triggers.file.on_create(".git/hooks/*"),
    ],
    on_problem="HOOK_UNDOC",
    task="TASK_document_hook",
)
def hook_documentation(ctx) -> dict:
    """H2: Detect undocumented hooks."""
    undoc_hooks = find_undocumented_hooks(ctx.project_root)

    if not undoc_hooks:
        return Signal.healthy()
    return Signal.degraded(hooks=undoc_hooks)
```

### Task Template (Error)

```markdown
# TASK_investigate_error.md

Investigates runtime error to find root cause.

## Inputs
- log_path: Path to log file
- error_message: Error text
- timestamp: When error occurred

## Outputs
- diagnosis: Root cause analysis
- evidence: Supporting artifacts
- recommended_action: What to do

## Uses
- SKILL_investigate

## Executes
- PROCEDURE_investigate
```

### Task Template (Hook)

```markdown
# TASK_document_hook.md

Documents an undocumented hook.

## Inputs
- hook_path: Path to hook file
- hook_name: Hook identifier

## Outputs
- behaviors_doc: Path to BEHAVIORS.md
- sections_added: Documentation written

## Uses
- SKILL_investigate

## Executes
- PROCEDURE_investigate
```

### Skill

```markdown
# SKILL_investigate.md

Agent skill for investigating runtime issues.

## Gates
- Agent can read logs
- Agent can read code
- Agent can form hypotheses

## Process
1. Gather context (logs, code, state)
2. Form hypotheses with evidence
3. Verify hypothesis
4. Produce diagnosis or escalate
```

### Procedure

```yaml
# PROCEDURE_investigate.yaml

name: investigate_runtime
steps:
  - id: gather_context
    action: read
    params: { paths: ["{log_path}", "surrounding context"] }

  - id: form_hypothesis
    action: analyze
    params: { prompt: "What could cause this?" }

  - id: verify
    action: verify_hypothesis
    params: { hypothesis: "{best_hypothesis}" }

  - id: produce_output
    action: create_diagnosis
    params: { root_cause, evidence, recommendation }
```

---

## INTEGRATION POINTS

### Triggers

| Trigger | When | Calls |
|---------|------|-------|
| log_stream | ERROR in logs | H1_log_error_detection |
| cron:hourly | Every hour | H1_log_error_detection |
| init_scan | `mind init` | H2_hook_documentation |
| file_watch | Hook created | H2_hook_documentation |

### Graph Nodes Created

| Node | Type | When |
|------|------|------|
| task_run | narrative:task_run | on_signal degraded/critical |
| diagnosis | narrative:diagnosis | After investigation |
| doc nodes | narrative:* | After hook documentation |

### Links Created

| From | To | Nature |
|------|-----|--------|
| task_run | TASK_investigate_error | serves |
| task_run | TASK_document_hook | serves |
| task_run | target | concerns |
| task_run | problem | resolves |
| agent | task_run | claims |
| diagnosis | task_run | produced_by |
