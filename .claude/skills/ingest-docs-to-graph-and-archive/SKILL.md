---
name: Ingest Docs To Graph And Archive
---

# Skill: `mind.ingest_docs_to_graph`
@mind:id: SKILL.INGEST.DOCS_TO_GRAPH.ARCHIVE

## Maps to VIEW

---

## Context

Documentation files in `docs/` must be ingested into the mind graph to enable:
- Agent queries across documentation
- Link traversal between concepts
- Context loading for tasks

**Chain Order Priority**: Ingest docs following the documentation chain order:
1. OBJECTIVES (defines goals)
2. BEHAVIORS (what it does)
3. PATTERNS (design philosophy)
4. ALGORITHM (how it works)
5. VALIDATION (invariants)
6. IMPLEMENTATION (code architecture)
7. HEALTH (test coverage)
8. SYNC (current state)

**Module-by-Module**: Process one module at a time to maintain graph coherence.

**Archive After Ingestion**: Once ingested, archive original files to `data/archive/docs/{module}/`.

---

## Purpose

Ingest documentation files into the mind graph as narrative nodes, create appropriate links, and archive originals.

---

## Inputs
```yaml
module: "<module-name>"           # Module to ingest (e.g., "engine-physics")
doc_files:                         # Files to ingest (from doctor DOCS_NOT_INGESTED)
  - path: "docs/engine/physics/OBJECTIVES_Physics.md"
    chain_type: "OBJECTIVES"
    priority: 0
  - path: "docs/engine/physics/PATTERNS_Physics.md"
    chain_type: "PATTERNS"
    priority: 2
```

## Outputs
```yaml
ingested_narratives:
  - id: "narrative_DOC_{module}_{chain_type}_{hash}"
    path: "docs/engine/physics/OBJECTIVES_Physics.md"
    status: "ingested"
archived_files:
  - from: "docs/engine/physics/OBJECTIVES_Physics.md"
    to: "data/archive/docs/engine-physics/OBJECTIVES_Physics.md"
```

---

## Gates

- Process docs in chain order (OBJECTIVES first)
- Create narrative nodes with proper links before archiving
- Verify ingestion before archiving (don't lose data)

---

## Process

### 1. Load module docs from doctor issues
```yaml
query:
  type: "doctor_issues"
  filter:
    issue_type: "DOCS_NOT_INGESTED"
    module: "{module}"
  sort_by: "chain_priority"
```

### 2. For each doc file (in chain order)

#### 2.1 Read and parse doc content
```yaml
extract:
  - title: "First # heading"
  - content: "Full markdown content"
  - type: "Chain type from filename prefix"
  - metadata: "Any @mind markers"
```

#### 2.2 Create narrative node in graph
```yaml
node:
  id: "narrative_DOC_{module}-{chain_type}_{content_hash}"
  node_type: "narrative"
  type: "documentation"
  chain_type: "{OBJECTIVES|BEHAVIORS|PATTERNS|...}"
  module: "{module}"
  path: "{original_path}"
  title: "{extracted_title}"
  content: "{full_content}"
  weight: 0.8
```

#### 2.3 Create links
```yaml
links:
  # Space contains doc
  - type: "contains"
    from: "space_MODULE_{module}"
    to: "{narrative_id}"

  # Chain ordering (if previous doc exists)
  - type: "precedes"
    from: "{previous_chain_narrative_id}"
    to: "{narrative_id}"
    condition: "previous_chain_doc_exists"
```

#### 2.4 Create ingestion moment
```yaml
moment:
  id: "moment_INGEST-DOC_{module}_{timestamp}"
  node_type: "moment"
  type: "doc_ingestion"
  prose: "Ingested {chain_type} doc for {module}"
```

### 3. Verify ingestion
```yaml
verify:
  - query: "MATCH (n:Narrative {id: $id}) RETURN n"
  - check: "Node exists with correct content"
```

### 4. Archive original file
```yaml
archive:
  from: "{original_path}"
  to: "data/archive/docs/{module}/{filename}"
  method: "move"  # or copy if verification uncertain
```

---

## Procedures Referenced

- `ingest_docs` - Auto-triggered by doctor for DOCS_NOT_INGESTED issues
- `add_narrative` - Creates narrative nodes
- `completion_handoff` - Records completion

---

## Quality Criteria

**Good ingestion:**
- All docs for module ingested in chain order
- Narrative nodes have correct type, module, content
- Links establish chain ordering
- Original files archived with preserved structure

**Bad ingestion:**
- Ingesting random docs without chain order
- Missing links between chain docs
- Archiving before verification
- Losing content during ingestion

---

## Skill Markers

```
@mind:skill: ingest_docs_to_graph
@mind:trigger: DOCS_NOT_INGESTED issue
@mind:protocol: ingest_docs
```
