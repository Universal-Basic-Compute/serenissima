# Task: update_sync

```
NODE: narrative:task
STATUS: active
```

---

## Purpose

Update stale SYNC file with current module state.

---

## Resolves

| Problem | Severity |
|---------|----------|
| STALE_SYNC | warning |

---

## Inputs

```yaml
inputs:
  target: sync_path           # Path to stale SYNC file
  days_stale: number          # How many days since last update
  module_id: string           # Module identifier
```

---

## Outputs

```yaml
outputs:
  updated: boolean            # Was SYNC updated successfully
  sync_path: path             # Path to updated SYNC
  changes_documented: boolean # Were recent changes captured
```

---

## Executor

```yaml
executor:
  type: agent
  agents: [voice, herald]
  reason: Requires summarizing changes and writing meaningful content
```

---

## Uses

```yaml
uses:
  skill: SKILL_update_sync
```

---

## Executes

```yaml
executes:
  procedure: PROCEDURE_update_sync
```

---

## Validation

Complete when:
1. LAST_UPDATED is today
2. STATUS field reflects current module state
3. RECENT_CHANGES captures actual recent work
4. HANDOFF section provides useful context
5. Next health check passes (SYNC no longer stale)

---

## Instance (task_run)

Created by runtime when HEALTH.on_signal fires:

```yaml
node_type: narrative
type: task_run
nature: "{severity} concerns"  # importantly/urgently

links:
  - nature: serves
    to: TASK_update_sync
  - nature: concerns
    to: "{module_id}"
  - nature: resolves
    to: STALE_SYNC
```
