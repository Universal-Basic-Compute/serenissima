# Derive Tasks — Patterns

```
STATUS: CANONICAL
CAPABILITY: derive-tasks
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

Vision documents describe what we want. But "what we want" isn't actionable. An agent can't execute "build a great user experience."

The gap between vision and execution is where projects stall. Vision exists. Tasks exist. But they're not connected. Nobody knows if current work advances the vision or if vision objectives are orphaned.

---

## THE PATTERN

**Vision decomposition with gap analysis.**

1. Parse vision documents for objectives
2. For each objective, check: is there evidence of completion or in-progress work?
3. If gap found: decompose objective into concrete tasks
4. Link tasks back to vision objective
5. Track coverage over time

---

## PRINCIPLES

### Principle 1: Objectives Are Nodes

Vision objectives become graph nodes. Tasks link to them. This creates traceability.

### Principle 2: Evidence-Based Gaps

Don't assume gaps. Check code, docs, existing tasks. Only create tasks for genuine missing work.

### Principle 3: Decomposition Depth

Break objectives down to agent-executable scope. "Build auth" → "Implement login endpoint" → "Add password validation."

### Principle 4: Bidirectional Links

Tasks link TO vision objectives. Vision objectives link TO tasks. Navigate either direction.

---

## DESIGN DECISIONS

### Why read vision docs, not create them?

Vision comes from humans. This capability translates, doesn't originate. Keep the human in the strategic loop.

### Why not just use issues/tickets?

Issues are reactive (bug found → issue). This is proactive (vision exists → what's missing?). Different information flow.

### Why graph-based tracking?

Flat lists lose the "why." Graph preserves: this task EXISTS because this objective EXISTS.

### Why agent-executable scope?

Vague tasks get ignored or done wrong. "Make it better" isn't executable. "Add input validation to form X" is.

---

## SCOPE

### In Scope

- Reading OBJECTIVES.md, vision.md, roadmap.md files
- Parsing objectives/goals from markdown
- Checking current state (code, docs, existing tasks)
- Creating tasks with vision links
- Tracking coverage metrics

### Out of Scope

- Writing vision docs
- Prioritizing tasks
- Executing tasks
- Changing vision based on reality
