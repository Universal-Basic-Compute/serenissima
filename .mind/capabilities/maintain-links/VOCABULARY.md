# Maintain Links — Vocabulary

```
STATUS: CANONICAL
CAPABILITY: maintain-links
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

### IMPL marker

A reference in documentation pointing to code. Format: `IMPL: path/to/file.py`

### DOCS marker

A reference in code pointing to documentation. Format: `# DOCS: docs/module/IMPLEMENTATION.md`

### orphan doc

A documentation file with no corresponding code reference — no code file has DOCS: pointing to it, and its IMPL: links (if any) are broken.

### broken link

An IMPL: or DOCS: marker that points to a non-existent file.

### bidirectional link

When doc has IMPL: to code AND code has DOCS: to doc. Complete traceability.

---

## PROBLEMS

### PROBLEM: ORPHAN_DOCS

```yaml
id: ORPHAN_DOCS
severity: medium
category: docs

definition: |
  A documentation file exists but has no corresponding code reference.
  No code file contains a DOCS: marker pointing to this doc, and no IMPL:
  marker in the doc points to existing code.

detection:
  - Doc file exists in docs/
  - No IMPL: markers point to existing files
  - No code file has DOCS: marker pointing to this doc

resolves_with: TASK_fix_orphan_docs

examples:
  - "docs/auth/IMPLEMENTATION.md exists but src/auth/ was deleted"
  - "docs/utils/PATTERNS.md has IMPL: to renamed file"
  - "Documentation created for code that was never written"
```

### PROBLEM: BROKEN_IMPL_LINK

```yaml
id: BROKEN_IMPL_LINK
severity: high
category: impl

definition: |
  An IMPL: marker in a documentation file points to a code file that
  does not exist. The link is broken due to file move, rename, or deletion.

detection:
  - Parse doc for IMPL: markers
  - Resolve each path relative to project root
  - Path does not exist on filesystem

resolves_with: TASK_fix_impl_link

examples:
  - "IMPL: src/auth/login.py but file was moved to src/auth/handlers/login.py"
  - "IMPL: lib/utils.ts but file was renamed to lib/helpers.ts"
  - "IMPL: src/old_module.py but module was deleted"
```

---

## USAGE

```yaml
# In HEALTH.md
on_problem:
  problem_id: BROKEN_IMPL_LINK
  creates:
    node:
      node_type: narrative
      type: task_run
      nature: "importantly concerns"
    links:
      - nature: "serves"
        to: TASK_fix_impl_link
      - nature: "resolves"
        to: BROKEN_IMPL_LINK

on_problem:
  problem_id: ORPHAN_DOCS
  creates:
    node:
      node_type: narrative
      type: task_run
      nature: "concerns"
    links:
      - nature: "serves"
        to: TASK_fix_orphan_docs
      - nature: "resolves"
        to: ORPHAN_DOCS
```
