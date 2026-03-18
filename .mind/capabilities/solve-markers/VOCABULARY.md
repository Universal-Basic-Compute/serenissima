# Solve Markers — Vocabulary

```
STATUS: CANONICAL
CAPABILITY: solve-markers
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

### escalation

A `@mind:escalation` marker indicating work is blocked and needs a decision from someone with authority.

### proposition

A `@mind:proposition` marker indicating an improvement idea that should be evaluated.

### legacy marker

Old-style markers: TODO, FIXME, HACK, XXX. Technical debt signals.

### question marker

A `@mind:question` or `?` pattern indicating uncertainty that needs resolution.

### resolution

The act of addressing a marker: deciding, implementing, deferring, or rejecting.

### decision record

Documentation of what was decided and why, created when resolving markers.

---

## PROBLEMS

### PROBLEM: ESCALATION

```yaml
id: ESCALATION
severity: critical
category: markers

definition: |
  An @mind:escalation marker indicates the author is blocked and needs
  a decision or input from someone else to proceed. Work cannot continue
  until the escalation is resolved.

detection:
  - Scan files for "@mind:escalation" pattern
  - Extract context (surrounding lines)
  - Identify what decision is needed

age_threshold: 48h

resolves_with: TASK_resolve_escalation

examples:
  - "@mind:escalation Design decision needed: should we use inheritance or composition?"
  - "@mind:escalation Blocked: need API key for external service"
  - "@mind:escalation Conflicting requirements between auth and logging modules"
```

### PROBLEM: SUGGESTION

```yaml
id: SUGGESTION
severity: medium
category: markers

definition: |
  An @mind:proposition marker indicates the author has an improvement
  idea that should be reviewed for potential implementation. Non-blocking
  but should not be ignored indefinitely.

detection:
  - Scan files for "@mind:proposition" pattern
  - Extract the suggested improvement
  - Identify scope and effort

age_threshold: 7d

resolves_with: TASK_evaluate_proposition

examples:
  - "@mind:proposition Could simplify this with a decorator pattern"
  - "@mind:proposition Consider extracting this into a shared utility"
  - "@mind:proposition Performance could improve with caching here"
```

### PROBLEM: LEGACY_MARKER

```yaml
id: LEGACY_MARKER
severity: low
category: markers

definition: |
  Old-style markers like TODO, FIXME, HACK, or XXX exist in code,
  indicating technical debt that should be addressed or tracked properly.

detection:
  - Scan code files for patterns: TODO, FIXME, HACK, XXX
  - Ignore: test files, vendored code
  - Check age via git blame

age_threshold: 30d

resolves_with: TASK_fix_legacy_marker

examples:
  - "# TODO: Add error handling"
  - "// FIXME: This breaks on empty input"
  - "/* HACK: Workaround for API bug */"
  - "# XXX: Remove before production"
```

### PROBLEM: UNRESOLVED_QUESTION

```yaml
id: UNRESOLVED_QUESTION
severity: medium
category: markers

definition: |
  A question marker (@mind:question or trailing ?) exists without an answer,
  indicating uncertainty that needs resolution through research or consultation.

detection:
  - Scan docs/code for "@mind:question" pattern
  - Scan for "? " followed by newline (question pattern)
  - Check if answer provided nearby

age_threshold: 14d

resolves_with: TASK_answer_question

examples:
  - "@mind:question Should this be synchronous or async?"
  - "@mind:question What's the expected behavior when X is null?"
  - "# Is this the right algorithm for large inputs?"
```

---

## USAGE

```yaml
# In HEALTH.md
on_problem:
  problem_id: ESCALATION
  creates:
    node:
      node_type: narrative
      type: task_run
      nature: "urgently concerns"
    links:
      - nature: "serves"
        to: TASK_resolve_escalation
      - nature: "resolves"
        to: ESCALATION
```
