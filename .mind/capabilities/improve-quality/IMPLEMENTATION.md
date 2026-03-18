# Improve Quality — Implementation

```
STATUS: CANONICAL
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
THIS:            IMPLEMENTATION.md (you are here)
HEALTH:          ./HEALTH.md
SYNC:            ./SYNC.md
```

---

## PURPOSE

Where improve-quality code lives and how it's structured.

---

## FILE STRUCTURE

```
capabilities/improve-quality/              # Self-contained capability
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
│   ├── TASK_split_monolith.md             # Split large files
│   ├── TASK_extract_constants.md          # Extract magic values
│   ├── TASK_extract_secrets.md            # Remove secrets
│   ├── TASK_compress_prompt.md            # Shorten prompts
│   ├── TASK_refactor_sql.md               # Simplify SQL
│   └── TASK_fix_naming.md                 # Fix naming violations
├── skills/
│   └── SKILL_refactor.md                  # Agent refactoring skill
├── procedures/
│   └── PROCEDURE_refactor.yaml            # Step-by-step procedure
└── runtime/
    ├── __init__.py                        # Exports CHECKS list
    └── checks.py                          # @check decorated functions
```

### After `mind init`

```
.mind/capabilities/improve-quality/        # Full copy
└── [same structure]
```

---

## KEY COMPONENTS

### Runtime Code

```python
# capabilities/improve-quality/runtime/checks.py

from mind.capability import check, Signal, triggers

@check(
    id="monolith_detection",
    triggers=[
        triggers.file.on_change("**/*.py"),
        triggers.file.on_change("**/*.ts"),
        triggers.init.after_scan(),
        triggers.cron.daily(),
    ],
    on_problem="MONOLITH",
    task="TASK_split_monolith",
)
def monolith_detection(ctx) -> dict:
    """H1: Check if file exceeds line threshold."""
    file_path = ctx.file_path
    line_count = count_effective_lines(file_path)

    if line_count <= 500:
        return Signal.healthy()
    if line_count > 1000:
        return Signal.critical(line_count=line_count)
    return Signal.degraded(line_count=line_count)


@check(
    id="secret_detection",
    triggers=[
        triggers.hook.pre_commit(),
        triggers.file.on_change("**/*.py"),
        triggers.file.on_change("**/*.ts"),
        triggers.init.after_scan(),
    ],
    on_problem="HARDCODED_SECRET",
    task="TASK_extract_secrets",
)
def secret_detection(ctx) -> dict:
    """H2: Check for hardcoded secrets. CRITICAL."""
    file_path = ctx.file_path
    secrets = scan_for_secrets(file_path)

    if not secrets:
        return Signal.healthy()
    return Signal.critical(secrets_found=len(secrets), patterns=secrets)
```

### Task Templates

Each task template defines inputs, outputs, executor, skill, and procedure:

```markdown
# tasks/TASK_split_monolith.md

Purpose: Split a file exceeding 500 lines into smaller modules.

Resolves: MONOLITH
Executor: agent (architect, steward)
Skill: SKILL_refactor
Procedure: PROCEDURE_refactor
```

### Skill

```markdown
# skills/SKILL_refactor.md

Agent skill for code quality refactoring.

Gates:
- Agent can read and write code
- Tests exist and pass
- Target file identified

Process:
1. Understand current structure
2. Identify split points / extraction targets
3. Make incremental changes
4. Validate after each change
5. Verify tests pass
```

### Procedure

```yaml
# procedures/PROCEDURE_refactor.yaml

name: quality_refactor
steps:
  - id: analyze
    action: analyze_file
    params: { target: "{file}" }

  - id: plan
    action: create_refactor_plan
    params: { analysis: "{analysis}" }

  - id: execute
    loop: "{plan.steps}"
    action: execute_refactor_step

  - id: validate
    action: validate_changes
```

---

## INTEGRATION POINTS

### Triggers

| Trigger | When | Calls |
|---------|------|-------|
| init_scan | `mind init` | All H1-H6 checks |
| file_watch | Code file changed | Relevant checks |
| pre-commit | Before commit | H2 (secrets) |
| cron:daily | Every 24h | All checks |
| cron:weekly | Every 7d | H6 (naming) |

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

---

## SCRIPTS

For mechanical fixes (MAGIC_VALUES, HARDCODED_SECRET, NAMING_CONVENTION):

### extract_constants

```python
# scripts/extract_constants.py
def extract_constants(file_path, findings):
    """Extract magic values to constants."""
    # Read file
    # Create constants block
    # Replace occurrences
    # Write file
```

### extract_secrets

```python
# scripts/extract_secrets.py
def extract_secrets(file_path, findings):
    """Remove secrets, add env var reads."""
    # Read file
    # Replace secret with os.environ.get()
    # Add to .env.example
    # Write file
```

### rename_to_convention

```python
# scripts/rename_to_convention.py
def rename_to_convention(file_path, violations):
    """Rename to match conventions."""
    # Determine correct name
    # Rename file
    # Update all imports
```

---

## CONFIGURATION

### Thresholds

```yaml
# .mind/config.yaml
quality:
  monolith_threshold: 500
  magic_value_threshold: 3
  prompt_length_threshold: 4000
  sql_length_threshold: 1000
  sql_join_threshold: 5
  sql_subquery_threshold: 2
```

### Naming Conventions

```yaml
# .mind/config.yaml
naming:
  python:
    file: snake_case
    class: PascalCase
    function: snake_case
    constant: UPPER_SNAKE_CASE
  typescript:
    file: kebab-case
    class: PascalCase
    function: camelCase
```
