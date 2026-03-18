# Derive Tasks — Sync

```
STATUS: DESIGNING
CAPABILITY: derive-tasks
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
IMPLEMENTATION:  ./IMPLEMENTATION.md
HEALTH:          ./HEALTH.md
THIS:            SYNC.md (you are here)
```

---

## CURRENT STATE

### Status: Initial Design

The derive-tasks capability has full doc chain. Runtime implementation pending.

### What Exists

- Full doc chain (OBJECTIVES through SYNC)
- Design for vision parsing and gap detection
- Health checks specified

### What's Next

1. Write runtime/checks.py
2. Create task templates
3. Create skill for decomposition
4. Create procedure for derivation
5. Test with sample vision docs

---

## MATURITY

```yaml
maturity:
  docs: complete
  runtime: pending
  tasks: pending
  skills: pending
  procedures: pending
  tested: no
```

---

## DEPENDENCIES

```yaml
depends_on:
  - runtime/capability/: For @check decorator
  - graph: For objective and task storage
  - task system: For creating derived tasks
```

---

## HANDOFFS

### For Next Agent

Doc chain complete. Implement runtime/checks.py next.

Key implementation notes:
- Vision doc parsing needs to handle multiple formats
- Coverage calculation should weight by task complexity if available
- Dedup is critical—check existing tasks before creating new ones
