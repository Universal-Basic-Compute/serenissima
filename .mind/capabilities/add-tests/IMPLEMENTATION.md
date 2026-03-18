# Add Tests — Implementation

```
STATUS: CANONICAL
CAPABILITY: add-tests
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

Where add-tests code lives and how it's structured.

---

## FILE STRUCTURE

```
capabilities/add-tests/                    # Self-contained capability
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
│   ├── TASK_add_tests.md                  # Task: create tests for module
│   ├── TASK_test_invariant.md             # Task: test specific invariant
│   ├── TASK_add_validates_markers.md      # Task: add missing markers
│   └── TASK_fix_health.md                 # Task: fix health failure
├── skills/
│   └── SKILL_write_tests.md               # Agent skill for writing tests
├── procedures/
│   └── PROCEDURE_add_tests.yaml           # Step-by-step procedure
└── runtime/                               # MCP-executable code
    ├── __init__.py                        # Exports CHECKS list
    └── checks.py                          # @check decorated functions
```

### After `mind init`

```
.mind/capabilities/add-tests/              # Full copy
└── [same structure]
```

---

## KEY COMPONENTS

### Runtime Code

```python
# capabilities/add-tests/runtime/checks.py

from mind.capability import check, Signal, triggers

@check(
    id="test_coverage",
    triggers=[
        triggers.file.on_create("src/**/*.py"),
        triggers.init.after_scan(),
        triggers.cron.daily(),
    ],
    on_problem="MISSING_TESTS",
    task="TASK_add_tests",
)
def test_coverage(ctx) -> dict:
    """H1: Check if module has test files."""
    module_id = ctx.module_id
    test_path = Path(f"tests/{module_id}")

    if not test_path.exists():
        return Signal.critical(module_id=module_id)

    test_files = list(test_path.glob("test_*.py"))
    if not test_files:
        return Signal.critical(module_id=module_id, reason="empty")

    return Signal.healthy()


@check(
    id="invariant_coverage",
    triggers=[
        triggers.file.on_modify("docs/**/VALIDATION*.md"),
        triggers.cron.daily(),
    ],
    on_problem="INVARIANT_UNTESTED",
    task="TASK_test_invariant",
)
def invariant_coverage(ctx) -> dict:
    """H2: Check if all invariants have tests."""
    # ... implementation
```

### Task Templates

```markdown
# TASK_add_tests.md
Creates test files for a module without tests.

# TASK_test_invariant.md
Writes test for specific invariant.

# TASK_add_validates_markers.md
Adds VALIDATES markers to unmarked tests.

# TASK_fix_health.md
Investigates and fixes health check failure.
```

### Skill

```markdown
# SKILL_write_tests.md

Agent skill for writing tests from invariants.

## Gates
- Agent can read VALIDATION.md
- Agent can write Python/test code
- pytest available in environment

## Process
1. Read invariants from VALIDATION.md
2. For each invariant, design test
3. Write test function with VALIDATES marker
4. Run test to verify it passes
```

### Procedure

```yaml
# PROCEDURE_add_tests.yaml

name: add_tests
steps:
  - id: read_validation
    action: read
    params: { path: "docs/{target}/VALIDATION.md" }

  - id: create_test_file
    action: create_from_template
    params:
      template: templates/test_template.py
      output: "tests/test_{target}.py"

  - id: write_tests
    loop: "{invariants}"
    action: agent_write
    params:
      invariant: "{item}"

  - id: run_tests
    action: run_pytest
    params: { path: "tests/test_{target}.py" }
```

---

## INTEGRATION POINTS

### Triggers

| Trigger | When | Calls |
|---------|------|-------|
| init_scan | `mind init` | H1_test_coverage |
| file_watch | Code file created | H1_test_coverage |
| validation_change | VALIDATION.md modified | H2_invariant_coverage |
| cron:daily | Every 24h | H1, H2, H3 |
| cron:hourly | Every hour | H4_health_status |

### Graph Nodes Created

| Node | Type | When |
|------|------|------|
| task_run | narrative:task_run | on_signal degraded/critical |
| test nodes | thing:test | After test creation |

### Links Created

| From | To | Nature |
|------|-----|--------|
| task_run | TASK_* | serves |
| task_run | target module | concerns |
| task_run | problem | resolves |
| agent | task_run | claims |
| test | invariant | validates |

---

## FLOWS

### Flow 1: Missing Tests Detection

```
1. Code module created/discovered
2. H1_test_coverage check runs
3. No tests found → Signal.critical
4. on_signal creates task_run
5. task_run links to TASK_add_tests
6. Agent picks up, writes tests
7. H1 re-runs → healthy
```

### Flow 2: Invariant Coverage Check

```
1. VALIDATION.md updated with new invariant
2. H2_invariant_coverage runs
3. Invariant Vn has no VALIDATES marker → Signal.degraded
4. on_signal creates task_run
5. task_run links to TASK_test_invariant
6. Agent writes test with VALIDATES: Vn
7. H2 re-runs → healthy
```

### Flow 3: Health Failure Response

```
1. Any health check runs
2. Returns Signal.critical
3. H4_health_status captures failure
4. Creates task_run for HEALTH_FAILED
5. Agent investigates, fixes root cause
6. Health check re-runs → healthy
```
