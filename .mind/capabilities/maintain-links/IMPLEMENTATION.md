# Maintain Links — Implementation

```
STATUS: CANONICAL
CAPABILITY: maintain-links
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

Where maintain-links code lives and how it's structured.

---

## FILE STRUCTURE

```
capabilities/maintain-links/              # Self-contained capability
├── OBJECTIVES.md
├── PATTERNS.md
├── VOCABULARY.md
├── BEHAVIORS.md
├── ALGORITHM.md
├── VALIDATION.md
├── IMPLEMENTATION.md                     # You are here
├── HEALTH.md
├── SYNC.md
├── tasks/
│   ├── TASK_fix_orphan_docs.md           # Task for orphan docs
│   └── TASK_fix_impl_link.md             # Task for broken links
├── skills/
│   └── SKILL_fix_links.md                # Agent skill
├── procedures/
│   └── PROCEDURE_fix_links.yaml          # Step-by-step procedure
└── runtime/                              # MCP-executable code
    ├── __init__.py                       # Exports CHECKS list
    └── checks.py                         # @check decorated functions
```

### After `mind init`

```
.mind/capabilities/maintain-links/        # Full copy
└── [same structure]
```

---

## KEY COMPONENTS

### Runtime Code

```python
# capabilities/maintain-links/runtime/checks.py

from mind.capability import check, Signal, triggers

@check(
    id="impl_link_validity",
    triggers=[
        triggers.file.on_modify("docs/**/*.md"),
        triggers.file.on_move("**/*.py"),
        triggers.file.on_move("**/*.ts"),
        triggers.cron.daily(),
    ],
    on_problem="BROKEN_IMPL_LINK",
    task="TASK_fix_impl_link",
)
def impl_link_validity(ctx) -> dict:
    """H1: Check if IMPL: markers point to existing files."""
    # Parse doc, check each IMPL: path exists
    ...

@check(
    id="orphan_doc_detection",
    triggers=[
        triggers.file.on_delete("**/*.py"),
        triggers.file.on_delete("**/*.ts"),
        triggers.cron.daily(),
    ],
    on_problem="ORPHAN_DOCS",
    task="TASK_fix_orphan_docs",
)
def orphan_doc_detection(ctx) -> dict:
    """H2: Detect docs without code references."""
    # Check each doc has valid IMPL or DOCS ref
    ...
```

### Task Templates

```markdown
# TASK_fix_impl_link.md

Fixes broken IMPL: markers in documentation.

## Inputs
- target: doc_path with broken link
- marker: the broken IMPL: value

## Outputs
- fixed: boolean
- new_path: updated IMPL path (if found)

## Uses
- SKILL_fix_links

## Executes
- PROCEDURE_fix_links
```

```markdown
# TASK_fix_orphan_docs.md

Resolves orphan documentation files.

## Inputs
- target: orphan doc path
- reason: why it's orphan

## Outputs
- resolution: linked | archived | deleted | escalated

## Uses
- SKILL_fix_links

## Executes
- PROCEDURE_fix_links
```

### Skill

```markdown
# SKILL_fix_links.md

Agent skill for fixing code-doc links.

## Gates
- Agent can search codebase
- Agent can edit markdown
- Agent understands project structure

## Process
1. Analyze broken link or orphan doc
2. Search for matching code
3. Update links or escalate
```

### Procedure

```yaml
# PROCEDURE_fix_links.yaml

name: fix_links
steps:
  - id: analyze
    action: read_doc
    params: { path: "{target}" }

  - id: search_code
    action: search
    params: { pattern: "{filename}" }

  - id: update_or_escalate
    action: conditional
    branches:
      found_single: update_link
      found_multiple: escalate
      not_found: handle_orphan
```

---

## INTEGRATION POINTS

### Triggers

| Trigger | When | Calls |
|---------|------|-------|
| file_modify | Doc changed | H1_impl_link_validity |
| file_move | Code moved/renamed | H1_impl_link_validity |
| file_delete | Code deleted | H2_orphan_doc_detection |
| cron:daily | Every 24h | H1, H2 |

### Graph Nodes Created

| Node | Type | When |
|------|------|------|
| task_run | narrative:task_run | on_signal degraded/critical |

### Links Created

| From | To | Nature |
|------|-----|--------|
| task_run | TASK_fix_impl_link | serves |
| task_run | TASK_fix_orphan_docs | serves |
| task_run | target doc | concerns |
| task_run | problem | resolves |
| agent | task_run | claims |
