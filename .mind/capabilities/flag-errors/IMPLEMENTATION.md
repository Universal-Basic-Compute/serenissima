# Flag Errors — Implementation

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
ALGORITHM:       ./ALGORITHM.md
VALIDATION:      ./VALIDATION.md
THIS:            IMPLEMENTATION.md (you are here)
HEALTH:          ./HEALTH.md
SYNC:            ./SYNC.md
```

---

## FILE STRUCTURE

```
capabilities/flag-errors/
├── OBJECTIVES.md
├── PATTERNS.md
├── VOCABULARY.md
├── BEHAVIORS.md
├── ALGORITHM.md
├── VALIDATION.md
├── IMPLEMENTATION.md      (this file)
├── HEALTH.md
├── SYNC.md
├── tasks/
│   ├── TASK_investigate_error.md
│   └── TASK_configure_watch.md
├── skills/
│   └── SKILL_triage_error.md
├── procedures/
│   └── PROCEDURE_investigate_error.yaml
└── runtime/
    ├── __init__.py        # Exports CHECKS
    └── checks.py          # @check decorated functions
```

---

## RUNTIME COMPONENTS

### Error Watcher

```python
# runtime/checks.py
@check(
    id="new_errors",
    triggers=[
        triggers.file.on_modify("logs/**/*.log"),
        triggers.cron.every(minutes=5),
    ],
    on_problem="NEW_ERROR",
    task="TASK_investigate_error",
)
def new_errors(ctx) -> dict:
    """Detect new errors in watched log files."""
    ...
```

### Fingerprinting

```python
# runtime/checks.py
def compute_fingerprint(error_type, message, stack_trace):
    """Compute stable fingerprint for error deduplication."""
    normalized = normalize_message(message)
    signature = extract_stack_signature(stack_trace)
    combined = f"{error_type}|{normalized}|{signature}"
    return hashlib.sha256(combined.encode()).hexdigest()[:16]
```

### Spike Detection

```python
# runtime/checks.py
@check(
    id="error_spike",
    triggers=[
        triggers.cron.every(minutes=15),
    ],
    on_problem="ERROR_SPIKE",
    task=None,  # Escalates existing task
)
def error_spike(ctx) -> dict:
    """Detect error rate spikes."""
    ...
```

---

## CONFIGURATION

### Watch Config

```yaml
# .mind/config/error_watch.yaml
watches:
  - name: application
    paths:
      - "logs/app.log"
      - "logs/error.log"
    format: structured
    error_levels: [ERROR, CRITICAL, FATAL]
    patterns:
      timestamp: "^\\[(\\d{4}-\\d{2}-\\d{2})"
      level: "\\[(ERROR|CRITICAL|FATAL)\\]"
      message: "\\] (.+)$"

  - name: python_tracebacks
    paths:
      - "**/*.log"
    format: multiline
    start_pattern: "^Traceback \\(most recent call last\\):"
    end_pattern: "^\\S"

settings:
  dedup_window: 3600        # seconds to consider same error
  spike_threshold: 10       # x baseline for spike
  resolution_quiet_hours: 24
```

---

## INTEGRATION POINTS

### Task System

```yaml
# Task creation on NEW_ERROR
creates:
  node_type: narrative
  type: task_run
  links:
    - nature: serves
      to: TASK_investigate_error
    - nature: concerns
      to: "{detected_module}"
```

### Graph Storage

```yaml
# Error fingerprint tracking
stores:
  - error_fingerprints: set of known fingerprints
  - occurrence_counts: fingerprint → count map
  - last_seen: fingerprint → timestamp map
```

---

## CLI COMMANDS

```bash
# List watched log files
mind errors watch list

# Add log file to watch
mind errors watch add logs/custom.log

# Show recent errors
mind errors list --since 24h

# Show error details
mind errors show <fingerprint>

# Mark error resolved
mind errors resolve <fingerprint>
```

---

## MCP TOOLS

```yaml
error_list:
  params:
    since: datetime (optional)
    status: open|resolved|all (optional)
  returns: list of error summaries

error_detail:
  params:
    fingerprint: string
  returns: full error record with occurrences

error_resolve:
  params:
    fingerprint: string
  returns: success/failure
```
