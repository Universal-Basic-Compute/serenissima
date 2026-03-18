# Task: ingest_docs

```
NODE: narrative:task
STATUS: active
```

---

## Purpose

Ingest docs from disk into graph to ensure query coverage.

---

## Resolves

| Problem | Severity |
|---------|----------|
| DOCS_NOT_INGESTED | warning |

---

## Inputs

```yaml
inputs:
  not_ingested: path[]         # Docs on disk but not in graph
  project_root: path           # Project root directory
```

---

## Outputs

```yaml
outputs:
  ingested: boolean            # Were docs ingested successfully
  node_count: number           # Number of nodes created
  nodes_created: id[]          # IDs of created nodes
```

---

## Executor

```yaml
executor:
  type: automated
  script: ingest_docs_to_graph
  reason: Mechanical task - read files, create nodes, no judgment needed
```

---

## Uses

```yaml
uses:
  skill: null  # No skill needed - fully automated
```

---

## Executes

```yaml
executes:
  script: |
    1. For each doc in not_ingested:
       - Read file content
       - Determine doc type from filename
       - Create Thing node:
         - node_type: thing
         - type: doc_{type}
         - content: file content
         - path: relative path
         - synthesis: first 200 chars
       - Link to module space
    2. Verify nodes created
    3. Report statistics
```

---

## Validation

Complete when:
1. All previously un-ingested docs now have graph nodes
2. Nodes have correct type and content
3. Nodes linked to appropriate module spaces
4. Next health check passes (100% coverage)

---

## Instance (task_run)

Created by runtime when HEALTH.on_signal fires:

```yaml
node_type: narrative
type: task_run
nature: "{severity} concerns"  # concerns/importantly concerns

links:
  - nature: serves
    to: TASK_ingest_docs
  - nature: resolves
    to: DOCS_NOT_INGESTED
```
