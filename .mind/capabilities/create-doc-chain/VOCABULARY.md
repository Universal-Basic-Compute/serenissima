# Create Doc Chain — Vocabulary

```
STATUS: CANONICAL
CAPABILITY: create-doc-chain
```

---

## CHAIN

```
OBJECTIVES:      ./OBJECTIVES.md
PATTERNS:        ./PATTERNS.md
THIS:            VOCABULARY.md (you are here)
BEHAVIORS:       ./BEHAVIORS.md
ALGORITHM:       ./ALGORITHM.md
```

---

## PURPOSE

Terms and problems owned by this capability.

---

## TERMS

### doc chain

The sequence: OBJECTIVES → PATTERNS → VOCABULARY → BEHAVIORS → ALGORITHM → VALIDATION → IMPLEMENTATION → HEALTH → SYNC

### stub

A placeholder doc created to mark where documentation should exist.

### template drift

When a doc no longer matches the canonical template structure.

---

## PROBLEMS

### PROBLEM: UNDOCUMENTED

```yaml
id: UNDOCUMENTED
severity: critical
category: docs

definition: |
  Code or module exists without corresponding documentation.
  The doc chain is completely missing.

detection:
  - Code file/folder exists
  - No matching docs/{area}/{module}/ folder
  - Or folder exists but empty

resolves_with: TASK_create_doc

examples:
  - "src/auth/ exists but docs/auth/ missing"
  - "lib/utils.py exists but no docs/utils/ chain"
```

### PROBLEM: INCOMPLETE_CHAIN

```yaml
id: INCOMPLETE_CHAIN
severity: high
category: docs

definition: |
  Doc folder exists but missing one or more files in the chain.
  Partial documentation is worse than none.

detection:
  - docs/{module}/ exists
  - One or more of: OBJECTIVES, PATTERNS, VOCABULARY, BEHAVIORS,
    ALGORITHM, VALIDATION, IMPLEMENTATION, HEALTH, SYNC missing

resolves_with: TASK_create_doc

examples:
  - "docs/auth/ has OBJECTIVES but missing PATTERNS"
  - "docs/utils/ missing HEALTH and SYNC"
```

### PROBLEM: PLACEHOLDER_DOC

```yaml
id: PLACEHOLDER_DOC
severity: medium
category: docs

definition: |
  Doc exists but contains only template placeholders.
  Not filled in with real content.

detection:
  - File contains "{placeholder}" markers
  - Or STATUS: STUB
  - Or content is < 100 chars

resolves_with: TASK_create_doc

examples:
  - "OBJECTIVES.md still has {Module} placeholder"
  - "PATTERNS.md has STATUS: STUB"
```

### PROBLEM: TEMPLATE_DRIFT

```yaml
id: TEMPLATE_DRIFT
severity: low
category: docs

definition: |
  Doc exists but structure doesn't match canonical template.
  Missing sections, wrong headers, custom format.

detection:
  - Compare doc structure to template
  - Missing required sections
  - Headers don't match template

resolves_with: TASK_fix_template_drift

examples:
  - "OBJECTIVES.md missing CHAIN section"
  - "PATTERNS.md has custom sections not in template"
```

### PROBLEM: NEW_UNDOC_CODE

```yaml
id: NEW_UNDOC_CODE
severity: high
category: docs

definition: |
  Recently committed code files have no DOCS: marker in header.
  New code added without documentation link.

detection:
  - Git commit adds/modifies code files (.py, .ts, .js, etc.)
  - File header (first 10 lines) has no "DOCS:" marker
  - No corresponding entry in IMPLEMENTATION.md

resolves_with: TASK_create_doc

examples:
  - "New src/auth/login.py committed without DOCS marker"
  - "PR adds lib/utils.ts with no doc link"
```

---

## USAGE

```yaml
# In HEALTH.md
on_problem:
  problem_id: UNDOCUMENTED
  creates:
    node:
      node_type: narrative
      type: task_run
      nature: "urgently concerns"
    links:
      - nature: "serves"
        to: TASK_create_doc
      - nature: "resolves"
        to: UNDOCUMENTED
```
