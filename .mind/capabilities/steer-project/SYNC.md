# Steer Project — Sync

```
STATUS: DESIGNING
CAPABILITY: steer-project
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

Full doc chain complete. Runtime implementation pending.

### What Exists

- Full doc chain
- Health check specifications
- Task definitions

### What's Next

1. Implement runtime/checks.py
2. Create task templates
3. Create steering skill
4. Create procedure
5. Test with real project state

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
  - git: For commit history
  - file system: For SYNC file dates
  - grep: For escalation marker scanning
```

---

## HANDOFFS

### For Next Agent

Doc chain complete. Key implementation notes:

1. Escalation marker scanning should use ripgrep for performance
2. SYNC file dates come from filesystem mtime
3. Steering sessions should persist to graph for history
4. Weekly cron should be configurable (default: Monday 9am)
