# Fix Membrane — Implementation

```
STATUS: CANONICAL
CAPABILITY: fix-membrane
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

Where fix-membrane code lives and how it's structured.

---

## FILE STRUCTURE

```
capabilities/fix-membrane/                 # Self-contained capability
+-- OBJECTIVES.md
+-- PATTERNS.md
+-- VOCABULARY.md
+-- BEHAVIORS.md
+-- ALGORITHM.md
+-- VALIDATION.md
+-- IMPLEMENTATION.md                      # You are here
+-- HEALTH.md
+-- SYNC.md
+-- tasks/
|   +-- TASK_create_procedures.md          # Install base procedures
|   +-- TASK_fix_yaml_syntax.md            # Fix parse errors
|   +-- TASK_fix_step_structure.md         # Fix step issues
|   +-- TASK_add_missing_fields.md         # Add required fields
+-- skills/
|   +-- SKILL_fix_procedure.md             # Agent skill for repairs
+-- procedures/
|   +-- PROCEDURE_fix_membrane.yaml        # Step-by-step fix procedure
+-- runtime/
    +-- __init__.py                        # Exports CHECKS list
    +-- checks.py                          # @check decorated functions
```

### After `mind init`

```
.mind/capabilities/fix-membrane/           # Full copy
+-- [same structure]
```

---

## KEY COMPONENTS

### Runtime Code

```python
# capabilities/fix-membrane/runtime/checks.py

from mind.capability import check, Signal, triggers

@check(
    id="procedures_exist",
    triggers=[
        triggers.init.after_scan(),
        triggers.cron.daily(),
    ],
    on_problem="MEMBRANE_NO_PROTOCOLS",
    task="TASK_create_procedures",
)
def procedures_exist(ctx) -> dict:
    """H1: Check if procedures directory has files."""
    procedures_dir = ctx.mind_dir / "procedures"

    if not procedures_dir.exists():
        return Signal.critical(reason="procedures directory missing")

    yaml_files = list(procedures_dir.glob("*.yaml"))

    if not yaml_files:
        return Signal.critical(reason="no procedure files found")

    return Signal.healthy(count=len(yaml_files))


@check(
    id="yaml_valid",
    triggers=[
        triggers.file.on_change(".mind/procedures/*.yaml"),
        triggers.init.after_scan(),
    ],
    on_problem="MEMBRANE_PARSE_ERROR",
    task="TASK_fix_yaml_syntax",
)
def yaml_valid(ctx) -> dict:
    """H2: Check all procedure files parse."""
    procedures_dir = ctx.mind_dir / "procedures"
    errors = []

    for path in procedures_dir.glob("*.yaml"):
        try:
            with open(path) as f:
                yaml.safe_load(f)
        except yaml.YAMLError as e:
            errors.append({
                "file": str(path),
                "error": str(e),
                "line": getattr(e.problem_mark, 'line', None) if hasattr(e, 'problem_mark') else None
            })

    if errors:
        return Signal.critical(errors=errors)

    return Signal.healthy()


@check(
    id="steps_valid",
    triggers=[
        triggers.file.on_change(".mind/procedures/*.yaml"),
        triggers.init.after_scan(),
    ],
    on_problem="MEMBRANE_INVALID_STEP",
    task="TASK_fix_step_structure",
)
def steps_valid(ctx) -> dict:
    """H3: Check all procedure steps are well-formed."""
    issues = validate_all_steps(ctx.mind_dir / "procedures")

    if issues:
        return Signal.degraded(issues=issues)

    return Signal.healthy()


@check(
    id="fields_complete",
    triggers=[
        triggers.file.on_change(".mind/procedures/*.yaml"),
        triggers.init.after_scan(),
    ],
    on_problem="MEMBRANE_MISSING_FIELDS",
    task="TASK_add_missing_fields",
)
def fields_complete(ctx) -> dict:
    """H4: Check all procedures have required fields."""
    missing = check_required_fields(ctx.mind_dir / "procedures")

    if missing:
        return Signal.degraded(missing=missing)

    return Signal.healthy()
```

### Task Templates

See `tasks/TASK_*.md` for individual task definitions.

### Skill

See `skills/SKILL_fix_procedure.md` for agent skill.

### Procedure

See `procedures/PROCEDURE_fix_membrane.yaml` for step-by-step procedure.

---

## INTEGRATION POINTS

### Triggers

| Trigger | When | Calls |
|---------|------|-------|
| init_scan | `mind init` | H1, H2, H3, H4 |
| file_watch | Procedure file changed | H2, H3, H4 |
| cron:daily | Every 24h | H1 |

### Graph Nodes Created

| Node | Type | When |
|------|------|------|
| task_run | narrative:task_run | on_signal degraded/critical |

### Links Created

| From | To | Nature |
|------|-----|--------|
| task_run | TASK_* | serves |
| task_run | target file | concerns |
| task_run | problem | resolves |
| agent | task_run | claims |
