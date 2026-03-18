# Task: fix_orphan_docs

```
NODE: narrative:task
STATUS: active
```

---

## Purpose

Resolve documentation files that have no corresponding code references.

---

## Resolves

| Problem | Severity |
|---------|----------|
| ORPHAN_DOCS | medium |

---

## Inputs

```yaml
inputs:
  target: doc_path[]      # Orphan doc(s) to resolve
  reason: string          # Why it's orphan (no_impl, no_docs_ref, both)
  problem: problem_id     # ORPHAN_DOCS
```

---

## Outputs

```yaml
outputs:
  resolution: enum        # linked | archived | deleted | escalated
  new_links: path[]       # Paths to newly linked code (if linked)
  justification: string   # Why this resolution was chosen
```

---

## Executor

```yaml
executor:
  type: agent
  agents: [voice, steward]
```

---

## Uses

```yaml
uses:
  skill: SKILL_fix_links
```

---

## Executes

```yaml
executes:
  procedure: PROCEDURE_fix_links
```

---

## Resolution Strategies

### Strategy 1: Find and Link

1. Search codebase for code matching doc topic
2. Check module names, function names, class names
3. If match found: create IMPL: link in doc, DOCS: link in code
4. Resolution: `linked`

### Strategy 2: Archive

1. Doc contains valuable historical information
2. Code was intentionally removed
3. Move to docs/archive/ with date prefix
4. Resolution: `archived`

### Strategy 3: Delete

1. Doc was created speculatively (code never existed)
2. Doc is stub/placeholder with no real content
3. No value in keeping
4. Resolution: `deleted`

### Strategy 4: Escalate

1. Uncertain whether code should exist
2. Possible doc is for planned feature
3. Need human decision
4. Resolution: `escalated`

---

## Validation

Complete when one of:
1. Doc now has valid IMPL: links to existing code
2. Code file now has DOCS: pointing to doc
3. Doc archived with justification
4. Doc deleted with justification
5. Escalation task created for human review

Health check no longer detects ORPHAN_DOCS for this file.

---

## Instance (task_run)

Created by runtime when HEALTH.on_signal fires:

```yaml
node_type: narrative
type: task_run
nature: "concerns"

links:
  - nature: serves
    to: TASK_fix_orphan_docs
  - nature: concerns
    to: "{target}"
  - nature: resolves
    to: ORPHAN_DOCS
```
