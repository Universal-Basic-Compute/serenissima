# Fill Gaps — Implementation

```
STATUS: CANONICAL
CAPABILITY: fill-gaps
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

Where fill-gaps code lives and how it's structured.

---

## FILE STRUCTURE

```
capabilities/fill-gaps/                    # Self-contained capability
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
│   ├── TASK_fill_gap.md                   # Task for filling gaps
│   ├── TASK_dedupe_content.md             # Task for deduplication
│   └── TASK_split_large_doc.md            # Task for splitting large docs
├── skills/
│   └── SKILL_fill_gaps.md                 # Agent skill
├── procedures/
│   └── PROCEDURE_fill_gaps.yaml           # Step-by-step procedure
└── runtime/                               # MCP-executable code
    ├── __init__.py                        # Exports CHECKS list
    └── checks.py                          # @check decorated functions
```

### After `mind init`

```
.mind/capabilities/fill-gaps/              # Full copy
└── [same structure]
```

---

## KEY COMPONENTS

### Runtime Code

```python
# capabilities/fill-gaps/runtime/checks.py

from mind.capability import check, Signal, triggers

@check(
    id="gap_detection",
    triggers=[
        triggers.file.on_modify("docs/**/*.md"),
        triggers.init.after_scan(),
        triggers.cron.daily(),
    ],
    on_problem="DOC_GAPS",
    task="TASK_fill_gap",
)
def gap_detection(ctx) -> dict:
    """H1: Check for @mind:gap markers in docs."""
    gaps = scan_for_gaps(ctx.docs_path)

    if not gaps:
        return Signal.healthy()

    return Signal.degraded(gaps=gaps, count=len(gaps))


@check(
    id="duplication_detection",
    triggers=[
        triggers.cron.weekly(),
        triggers.event.after_ingest(),
    ],
    on_problem="DOC_DUPLICATION",
    task="TASK_dedupe_content",
)
def duplication_detection(ctx) -> dict:
    """H2: Check for duplicate content across docs."""
    duplicates = detect_duplicates(ctx.docs_path, threshold=0.30)

    if not duplicates:
        return Signal.healthy()

    return Signal.degraded(duplicates=duplicates, count=len(duplicates))


@check(
    id="size_detection",
    triggers=[
        triggers.file.on_modify("docs/**/*.md"),
        triggers.init.after_scan(),
        triggers.cron.daily(),
    ],
    on_problem="LARGE_DOC_MODULE",
    task="TASK_split_large_doc",
)
def size_detection(ctx) -> dict:
    """H3: Check for docs exceeding 200 lines."""
    large_docs = detect_large_docs(ctx.docs_path, max_lines=200)

    if not large_docs:
        return Signal.healthy()

    return Signal.degraded(large_docs=large_docs, count=len(large_docs))
```

### Task Template: Fill Gap

```markdown
# TASK_fill_gap.md

Fills @mind:gap markers with actual content.

## Inputs
- target: doc_path with gap
- context: gap marker text

## Outputs
- content_added: string
- gap_resolved: boolean

## Uses
- SKILL_fill_gaps

## Executes
- PROCEDURE_fill_gaps (mode: fill_gap)
```

### Task Template: Dedupe Content

```markdown
# TASK_dedupe_content.md

Consolidates duplicate content to canonical source.

## Inputs
- target: primary doc path
- duplicate: secondary doc path
- similarity: overlap percentage

## Outputs
- canonical: path
- references_updated: count

## Uses
- SKILL_fill_gaps

## Executes
- PROCEDURE_fill_gaps (mode: dedupe)
```

### Task Template: Split Large Doc

```markdown
# TASK_split_large_doc.md

Splits oversized docs into smaller pieces.

## Inputs
- target: doc path
- lines: current line count

## Outputs
- split_files: path[]
- archived_entries: count (for SYNC)

## Uses
- SKILL_fill_gaps

## Executes
- PROCEDURE_fill_gaps (mode: split)
```

### Skill

```markdown
# SKILL_fill_gaps.md

Agent skill for resolving documentation gaps, duplicates, and size issues.

## Gates
- Agent can read/write markdown
- Agent can research content
- Agent understands doc structure

## Process
1. Identify problem type (gap/dupe/size)
2. Execute appropriate procedure
3. Validate result
4. Update SYNC
```

### Procedure

```yaml
# PROCEDURE_fill_gaps.yaml

name: fill_gaps
steps:
  - id: identify_problem
    action: read_task
    outputs: { problem_type, target }

  - id: fill_gap
    condition: "problem_type == 'DOC_GAPS'"
    action: fill_gap_content
    params:
      doc_path: "{target}"

  - id: dedupe
    condition: "problem_type == 'DOC_DUPLICATION'"
    action: consolidate_content
    params:
      primary: "{target}"
      secondary: "{duplicate}"

  - id: split
    condition: "problem_type == 'LARGE_DOC_MODULE'"
    action: split_doc
    params:
      doc_path: "{target}"

  - id: validate
    action: validate_fix
    params:
      checks: [gap_removed, refs_valid, size_ok]
```

---

## INTEGRATION POINTS

### Triggers

| Trigger | When | Calls |
|---------|------|-------|
| init_scan | `mind init` | H1, H3 |
| doc_watch | Doc file changed | H1, H3 |
| cron:daily | Every 24h | H1, H3 |
| cron:weekly | Every 7d | H2 |
| post_ingest | After doc ingest | H2 |

### Graph Nodes Created

| Node | Type | When |
|------|------|------|
| task_run | narrative:task_run | on_signal degraded |
| archive | narrative:archive | SYNC split |

### Links Created

| From | To | Nature |
|------|-----|--------|
| task_run | TASK_fill_gap | serves |
| task_run | target doc | concerns |
| task_run | DOC_GAPS | resolves |
| agent | task_run | claims |
