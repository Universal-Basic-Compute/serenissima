# Flag Errors — Sync

```
STATUS: DESIGNING
CAPABILITY: flag-errors
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

The flag-errors capability has been designed with full doc chain. Runtime implementation pending.

### What Exists

- Full doc chain (OBJECTIVES through SYNC)
- Design decisions documented
- Health checks specified in HEALTH.md

### What's Next

1. Write runtime/checks.py with actual implementation
2. Create task templates
3. Create skill for error triage
4. Create procedure for investigation
5. Test with sample log files

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

## OPEN QUESTIONS

### Q1: Log Format Detection

Should we auto-detect log formats or require explicit configuration?

**Current decision:** Explicit configuration. Auto-detection is fragile.

### Q2: Multi-line Error Handling

How to handle stack traces that span multiple lines?

**Current decision:** Use start/end patterns in config. Parser accumulates until end pattern.

### Q3: Log Rotation

What happens when logs rotate?

**Current decision:** Track by inode, not path. Detect rotation and reset position.

---

## DEPENDENCIES

```yaml
depends_on:
  - runtime/capability/: For @check decorator and Signal
  - task system: For creating task_run nodes
  - graph: For fingerprint storage and queries
```

---

## RECENT CHANGES

| Date | Change |
|------|--------|
| 2024-01-XX | Initial design - full doc chain created |

---

## HANDOFFS

### For Next Agent

The doc chain is complete. Next step is implementing runtime/checks.py.

Key implementation details:
- Use @check decorator pattern (see create-doc-chain for example)
- Fingerprint computation is critical - must be deterministic
- Watch config should be in .mind/config/error_watch.yaml
- File position tracking needed for incremental log reading

Start with the simplest check (new_errors) and expand from there.
