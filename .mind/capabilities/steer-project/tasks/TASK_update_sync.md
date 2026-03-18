# Task: update_sync

```
NODE: narrative:task
STATUS: active
```

---

## Purpose

Update a stale SYNC file to reflect current state.

---

## Resolves

| Problem | Severity |
|---------|----------|
| STALE_SYNC | medium |

---

## Inputs

```yaml
inputs:
  file: path              # Which SYNC file to update
  age_days: int           # How old it is
```

---

## Outputs

```yaml
outputs:
  updated: boolean
  changes_summary: string
```

---

## Executor

```yaml
executor:
  type: agent
  agents: [witness, herald]
```

---

## Validation

Complete when:
1. File content reflects current reality
2. CURRENT STATE section updated
3. RECENT CHANGES section updated
4. HANDOFFS section reviewed
5. File mtime updated

---

## Process

1. Read current SYNC file
2. Assess actual state of the module/component
3. Update CURRENT STATE section
4. Add entry to RECENT CHANGES
5. Review and update HANDOFFS
6. Save file
