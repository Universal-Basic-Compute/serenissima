# Create Doc Chain — Implementation

```
STATUS: CANONICAL
CAPABILITY: create-doc-chain
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

Where create-doc-chain code lives and how it's structured.

---

## FILE STRUCTURE

```
capabilities/create-doc-chain/              # Self-contained capability
├── OBJECTIVES.md
├── PATTERNS.md
├── VOCABULARY.md
├── BEHAVIORS.md
├── ALGORITHM.md
├── VALIDATION.md
├── IMPLEMENTATION.md                       # You are here
├── HEALTH.md
├── SYNC.md
├── tasks/TASK_create_doc.md                # Task template
├── skills/SKILL_write_doc.md               # Agent skill
├── procedures/PROCEDURE_create_doc.yaml    # Step-by-step procedure
└── runtime/                                # MCP-executable code
    ├── __init__.py                         # Exports CHECKS list
    └── checks.py                           # @check decorated functions
```

### After `mind init`

```
.mind/capabilities/create-doc-chain/        # Full copy
└── [same structure]
```

---

## KEY COMPONENTS

### Runtime Code

```python
# capabilities/create-doc-chain/runtime/checks.py

from mind.capability import check, Signal, triggers

@check(
    id="chain_completeness",
    triggers=[
        triggers.file.on_delete("docs/**/*.md"),
        triggers.init.after_scan(),
        triggers.cron.daily(),
    ],
    on_problem="INCOMPLETE_CHAIN",
    task="TASK_create_doc",
)
def chain_completeness(ctx) -> dict:
    """H1: Check if module has complete doc chain."""
    module_id = ctx.module_id
    found = scan_docs(module_id)
    missing = EXPECTED_DOCS - found

    if not missing:
        return Signal.healthy()
    if missing & {"OBJECTIVES", "PATTERNS"}:
        return Signal.critical(missing=list(missing))
    return Signal.degraded(missing=list(missing))
```

### Task Template

```markdown
# TASK_create_doc.md

Creates missing documentation for a module.

## Inputs
- target: module needing docs
- missing: list of missing doc types

## Outputs
- docs/{target}/*.md files

## Uses
- SKILL_write_doc

## Executes
- PROCEDURE_create_doc
```

### Skill

```markdown
# SKILL_write_doc.md

Agent skill for writing documentation from templates.

## Gates
- Agent can read code
- Agent can write markdown
- Templates available

## Process
1. Read target code
2. Load appropriate template
3. Fill template with context
4. Write doc file
5. Validate structure
```

### Procedure

```yaml
# PROCEDURE_create_doc.yaml

name: create_doc_chain
steps:
  - id: read_code
    action: read_module_code
    params: { module: "{target}" }

  - id: create_each_doc
    loop: "{missing}"
    action: create_doc_from_template
    params:
      doc_type: "{item}"
      template: "templates/docs/{item}_TEMPLATE.md"
      output: "docs/{target}/{item}.md"

  - id: validate
    action: validate_doc_chain
    params: { module: "{target}" }
```

---

## INTEGRATION POINTS

### Triggers

| Trigger | When | Calls |
|---------|------|-------|
| init_scan | `mind init` | H1_chain_completeness |
| file_watch | Code file changed | H1_chain_completeness |
| cron:daily | Every 24h | H1_chain_completeness |

### Graph Nodes Created

| Node | Type | When |
|------|------|------|
| task_run | narrative:task_run | on_signal degraded/critical |
| doc nodes | narrative:* | After doc creation |

### Links Created

| From | To | Nature |
|------|-----|--------|
| task_run | TASK_create_doc | serves |
| task_run | target module | concerns |
| task_run | problem | resolves |
| agent | task_run | claims |
