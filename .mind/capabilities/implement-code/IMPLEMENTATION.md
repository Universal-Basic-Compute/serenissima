# Implement Code — Implementation

```
STATUS: CANONICAL
CAPABILITY: implement-code
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

Where implement-code code lives and how it's structured.

---

## FILE STRUCTURE

```
capabilities/implement-code/                # Self-contained capability
├── OBJECTIVES.md
├── PATTERNS.md
├── VOCABULARY.md
├── BEHAVIORS.md
├── ALGORITHM.md
├── VALIDATION.md
├── IMPLEMENTATION.md                       # You are here
├── HEALTH.md
├── SYNC.md
├── tasks/
│   ├── TASK_implement_stub.md              # Implement stub functions
│   ├── TASK_complete_impl.md               # Complete partial code
│   ├── TASK_document_impl.md               # Create ALGORITHM.md
│   └── TASK_update_impl_docs.md            # Sync docs with code
├── skills/
│   └── SKILL_implement.md                  # Agent implementation skill
├── procedures/
│   └── PROCEDURE_implement.yaml            # Step-by-step procedure
└── runtime/
    ├── __init__.py                         # Exports CHECKS list
    └── checks.py                           # @check decorated functions
```

### After `mind init`

```
.mind/capabilities/implement-code/          # Full copy
└── [same structure]
```

---

## KEY COMPONENTS

### Runtime Code

```python
# capabilities/implement-code/runtime/checks.py

from mind.capability import check, Signal, triggers

@check(
    id="stub_detection",
    triggers=[
        triggers.file.on_modify("**/*.py"),
        triggers.init.after_scan(),
        triggers.cron.daily(),
    ],
    on_problem="STUB_IMPL",
    task="TASK_implement_stub",
)
def stub_detection(ctx) -> dict:
    """H1: Detect stub implementations."""
    # ... detection logic ...

@check(
    id="incomplete_detection",
    triggers=[
        triggers.file.on_modify("**/*.{py,ts,js}"),
        triggers.cron.daily(),
    ],
    on_problem="INCOMPLETE_IMPL",
    task="TASK_complete_impl",
)
def incomplete_detection(ctx) -> dict:
    """H2: Detect TODO/FIXME markers."""
    # ... detection logic ...

@check(
    id="undoc_impl_detection",
    triggers=[
        triggers.file.on_create("docs/**/IMPLEMENTATION*.md"),
        triggers.cron.daily(),
    ],
    on_problem="UNDOC_IMPL",
    task="TASK_document_impl",
)
def undoc_impl_detection(ctx) -> dict:
    """H3: Detect IMPLEMENTATION without ALGORITHM."""
    # ... detection logic ...

@check(
    id="stale_impl_detection",
    triggers=[
        triggers.hook.post_commit(),
        triggers.cron.daily(),
    ],
    on_problem="STALE_IMPL",
    task="TASK_update_impl_docs",
)
def stale_impl_detection(ctx) -> dict:
    """H4: Detect stale documentation."""
    # ... detection logic ...
```

### Task Templates

| Task | Purpose | Problem |
|------|---------|---------|
| TASK_implement_stub | Implement stub functions | STUB_IMPL |
| TASK_complete_impl | Complete partial code | INCOMPLETE_IMPL |
| TASK_document_impl | Create ALGORITHM.md | UNDOC_IMPL |
| TASK_update_impl_docs | Sync docs with code | STALE_IMPL |

### Skill

```markdown
# SKILL_implement.md

Agent skill for implementing code from specifications.

## Gates
- Agent can read/write code
- Agent can run tests
- ALGORITHM.md or docstring available

## Process
1. Read specification
2. Implement code
3. Test
4. Update docs
```

### Procedure

```yaml
# PROCEDURE_implement.yaml

name: implement_code
steps:
  - id: read_spec
    action: read_algorithm
  - id: implement
    action: write_code
  - id: test
    action: run_tests
  - id: validate
    action: check_invariants
```

---

## INTEGRATION POINTS

### Triggers

| Trigger | When | Calls |
|---------|------|-------|
| file_watch | Code file modified | H1, H2 |
| init_scan | `mind init` | H1, H2, H3 |
| post_commit | Git commit | H4 |
| cron:daily | Every 24h | All checks |

### Graph Nodes Created

| Node | Type | When |
|------|------|------|
| task_run | narrative:task_run | on_signal degraded/critical |
| algorithm_doc | narrative:* | After ALGORITHM created |

### Links Created

| From | To | Nature |
|------|-----|--------|
| task_run | TASK_* | serves |
| task_run | target file | concerns |
| task_run | problem | resolves |
| agent | task_run | claims |
| ALGORITHM | IMPLEMENTATION | implements |
