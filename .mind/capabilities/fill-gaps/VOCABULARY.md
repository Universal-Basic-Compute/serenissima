# Fill Gaps — Vocabulary

```
STATUS: CANONICAL
CAPABILITY: fill-gaps
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

### gap marker

The `@mind:gap` annotation indicating missing content that needs to be filled.

### canonical source

The single authoritative location for a piece of content. All other locations reference this.

### content similarity

Measure of overlap between two documents. Computed via embedding cosine similarity or ngram overlap.

### doc archival

Moving old content (especially SYNC entries) to an archive file to reduce main doc size.

---

## PROBLEMS

### PROBLEM: DOC_GAPS

```yaml
id: DOC_GAPS
severity: high
category: docs

definition: |
  An @mind:gap marker exists in documentation, indicating the author
  identified missing content that needs to be filled in.

detection:
  - Scan docs/**/*.md for "@mind:gap" pattern
  - Each occurrence is one gap problem

resolves_with: TASK_fill_gap

examples:
  - "PATTERNS.md has @mind:gap for 'error handling rationale'"
  - "ALGORITHM.md has @mind:gap for 'edge case behavior'"
```

### PROBLEM: DOC_DUPLICATION

```yaml
id: DOC_DUPLICATION
severity: medium
category: docs

definition: |
  Similar or identical content appears in multiple documentation files.
  This creates maintenance burden and risk of inconsistency when one
  copy is updated but others are not.

detection:
  - Compute content similarity between doc pairs
  - Flag pairs with >30% overlap (embedding cosine or ngram jaccard)
  - Exclude expected overlaps (CHAIN sections, headers)

resolves_with: TASK_dedupe_content

examples:
  - "Same algorithm explained in ALGORITHM.md and README.md"
  - "Identical setup instructions in three different docs"
  - "Copy-pasted behavior descriptions across modules"
```

### PROBLEM: LARGE_DOC_MODULE

```yaml
id: LARGE_DOC_MODULE
severity: low
category: docs

definition: |
  A documentation file exceeds 200 lines, making it difficult to navigate
  and maintain. Large docs should be split or archived.

detection:
  - Count lines in each docs/**/*.md file
  - Flag files with line_count > 200

resolves_with: TASK_split_large_doc

examples:
  - "SYNC.md has 500 lines of accumulated updates"
  - "ALGORITHM.md grew to 300 lines covering too many functions"
  - "BEHAVIORS.md describes 50 behaviors in one file"
```

---

## USAGE

```yaml
# In HEALTH.md
on_problem:
  problem_id: DOC_GAPS
  creates:
    node:
      node_type: narrative
      type: task_run
      nature: "importantly concerns"
    links:
      - nature: "serves"
        to: TASK_fill_gap
      - nature: "resolves"
        to: DOC_GAPS
```
