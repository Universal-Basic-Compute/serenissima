# Task: configure_watch

```
NODE: narrative:task
STATUS: active
```

---

## Purpose

Add unmonitored log files to the error watch configuration.

---

## Resolves

| Problem | Severity |
|---------|----------|
| UNMONITORED_LOGS | medium |

---

## Inputs

```yaml
inputs:
  unmonitored_logs: path[]   # Log files not being watched
```

---

## Outputs

```yaml
outputs:
  config_updated: boolean    # Was config file updated
  patterns_added: string[]   # Glob patterns added
```

---

## Executor

```yaml
executor:
  type: agent
  agents: [groundwork, steward]
```

---

## Validation

Complete when:
1. All listed log files are covered by watch patterns
2. watch_coverage health check passes
3. Config file is valid YAML

---

## Instance (task_run)

Created by runtime when HEALTH.on_signal fires:

```yaml
node_type: narrative
type: task_run
nature: "importantly concerns"

content:
  unmonitored_logs: ["{paths}"]

links:
  - nature: serves
    to: TASK_configure_watch
  - nature: resolves
    to: UNMONITORED_LOGS
```

---

## Steps

1. Review the list of unmonitored log files
2. Determine appropriate glob patterns to cover them
3. Add patterns to `.mind/config/error_watch.yaml`
4. Verify patterns match the files
5. Run watch_coverage check to confirm
