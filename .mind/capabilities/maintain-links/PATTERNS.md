# Maintain Links — Patterns

```
STATUS: CANONICAL
CAPABILITY: maintain-links
```

---

## CHAIN

```
OBJECTIVES:      ./OBJECTIVES.md
THIS:            PATTERNS.md (you are here)
VOCABULARY:      ./VOCABULARY.md
BEHAVIORS:       ./BEHAVIORS.md
ALGORITHM:       ./ALGORITHM.md
```

---

## THE PROBLEM

Links between code and docs break silently. Files get moved, renamed, deleted. IMPL: markers become stale. Docs become orphans. Agents follow dead links and lose trust.

---

## THE PATTERN

**Continuous link validation with automatic repair.**

1. System scans for IMPL: markers in docs
2. Validates each path exists
3. For broken links, attempts path resolution (search by filename)
4. Creates task_run for unresolvable issues
5. Agent fixes or removes orphan docs

---

## PRINCIPLES

### Principle 1: Links Are Contracts

IMPL: markers are promises that code exists. Broken promises damage trust.

### Principle 2: Search Before Delete

Before marking doc as orphan, search codebase for matching code. Files may have moved.

### Principle 3: Preserve Over Delete

When uncertain, flag for review rather than auto-delete. Docs represent accumulated knowledge.

### Principle 4: Bidirectional Integrity

One-way links are incomplete. Validate both directions: doc→code and code→doc.

---

## DESIGN DECISIONS

### Why script resolution first?

Most broken links are simple renames or moves. Script can search for file by name and fix automatically. Only escalate to agent when search fails.

### Why not auto-delete orphans?

Orphan docs may still contain valuable information. Human/agent should decide: archive, delete, or find correct code.

### Why check both directions?

- IMPL: in doc → code: Ensures doc references exist
- DOCS: in code → doc: Ensures code is documented

Missing either direction indicates integration gap.

---

## SCOPE

### In Scope

- Detecting broken IMPL: links
- Detecting orphan documentation
- Searching for moved/renamed files
- Updating links when target found
- Creating tasks for manual review

### Out of Scope

- Creating missing code
- Creating missing docs (that's create-doc-chain)
- Content validation
- Semantic link checking (e.g., "does doc accurately describe code")
