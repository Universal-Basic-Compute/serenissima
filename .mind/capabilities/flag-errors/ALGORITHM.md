# Flag Errors — Algorithm

```
STATUS: CANONICAL
CAPABILITY: flag-errors
```

---

## CHAIN

```
OBJECTIVES:      ./OBJECTIVES.md
PATTERNS:        ./PATTERNS.md
VOCABULARY:      ./VOCABULARY.md
BEHAVIORS:       ./BEHAVIORS.md
THIS:            ALGORITHM.md (you are here)
VALIDATION:      ./VALIDATION.md
```

---

## CORE ALGORITHM

### A1: Error Detection Pipeline

```
FUNCTION process_log_changes(log_path, last_position):
    # Read new content
    content = read_from_position(log_path, last_position)
    new_position = current_position(log_path)

    # Parse errors
    config = get_watch_config(log_path)
    errors = []

    FOR line IN content.split_lines():
        IF matches(line, config.error_pattern):
            record = parse_error_record(line, config)
            record.fingerprint = compute_fingerprint(record, config)
            errors.append(record)

    # Process each error
    FOR error IN errors:
        process_error(error, log_path)

    # Update position
    save_position(log_path, new_position)
```

### A2: Fingerprint Computation

```
FUNCTION compute_fingerprint(record, config):
    # Extract components
    error_type = extract_type(record)

    # Normalize message
    message = record.message
    message = regex_replace(message, UUID_PATTERN, "{UUID}")
    message = regex_replace(message, TIMESTAMP_PATTERN, "{TS}")
    message = regex_replace(message, NUMBER_PATTERN, "{N}")
    message = regex_replace(message, PATH_WITH_USER_PATTERN, "{PATH}")

    # Stack signature (top 3 frames)
    IF record.stack_trace:
        frames = parse_stack(record.stack_trace)
        signature = normalize_frames(frames[:3])
    ELSE:
        signature = ""

    # Combine and hash
    combined = f"{error_type}|{message}|{signature}"
    RETURN sha256(combined)[:16]  # 16 char fingerprint
```

### A3: Task Management

```
FUNCTION process_error(error, log_path):
    # Check for existing task
    existing = query_task_by_fingerprint(error.fingerprint)

    IF existing IS NULL:
        # New error - create task
        task = create_task_run(
            template="TASK_investigate_error",
            inputs={
                fingerprint: error.fingerprint,
                first_occurrence: error.timestamp,
                message: error.message,
                stack_trace: error.stack_trace,
                log_path: log_path,
                occurrence_count: 1
            }
        )
        RETURN task
    ELSE:
        # Update existing
        existing.occurrence_count += 1
        existing.last_seen = error.timestamp

        # Check for spike
        IF is_spike(error.fingerprint, existing):
            escalate_task(existing)

        save_task(existing)
        RETURN existing
```

### A4: Spike Detection

```
FUNCTION is_spike(fingerprint, task):
    # Get recent rate (last hour)
    recent_count = count_occurrences(fingerprint, last_hour)
    recent_rate = recent_count  # per hour

    # Get baseline rate (last 7 days average)
    baseline_count = count_occurrences(fingerprint, last_7_days)
    baseline_rate = baseline_count / (7 * 24)  # per hour

    # Spike if 10x baseline (with minimum threshold)
    IF baseline_rate < 1:
        baseline_rate = 1  # minimum 1/hour baseline

    RETURN recent_rate > (baseline_rate * 10)
```

### A5: Resolution Detection

```
FUNCTION check_resolution(task):
    # Get last occurrence
    last_seen = task.last_seen
    fix_deployed = task.fix_deployed_at

    IF fix_deployed IS NULL:
        RETURN FALSE  # No fix deployed yet

    # Check quiet period (24 hours after fix)
    quiet_hours = hours_since(fix_deployed)
    occurrences_since_fix = count_occurrences(
        task.fingerprint,
        since=fix_deployed
    )

    IF quiet_hours >= 24 AND occurrences_since_fix == 0:
        RETURN TRUE

    RETURN FALSE
```

---

## DATA STRUCTURES

### Watch Config File

```yaml
# .mind/config/error_watch.yaml
watches:
  - name: app_errors
    path: "logs/*.log"
    format: structured
    error_pattern: "^\\[(ERROR|CRITICAL)\\]"
    timestamp_field: 0
    message_field: 2

  - name: python_exceptions
    path: "logs/app.log"
    format: multiline
    error_pattern: "^Traceback"
    end_pattern: "^\\S"  # Non-whitespace starts new record
```

### Error Task Node

```yaml
node_type: narrative
type: task_run

content:
  fingerprint: "a1b2c3d4e5f6"
  message: "Connection refused to database"
  stack_trace: "..."
  first_occurrence: "2024-01-15T10:30:00Z"
  last_seen: "2024-01-15T14:45:00Z"
  occurrence_count: 147
  log_path: "logs/app.log"
  state: investigating

links:
  - nature: serves
    to: TASK_investigate_error
  - nature: concerns
    to: "{affected_module}"
```
