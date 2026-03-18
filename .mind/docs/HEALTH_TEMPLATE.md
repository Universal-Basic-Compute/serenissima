# {Module} — Health: Verification Mechanics and Coverage

```
STATUS: {DRAFT | STABLE | DEPRECATED}
CREATED: {DATE}
```

---

## WHEN TO USE HEALTH (NOT TESTS)

Health checks verify runtime behavior that tests cannot catch:

| Use Health For | Why |
|----------------|-----|
| Drift over time | Needs 1000+ real ticks, not fixtures |
| Ratio health | Emergent behavior, not deterministic |
| Graph-wide state | Needs real structure, not mocks |
| Production data patterns | Test fixtures can't predict real usage |

**Tests gate completion. Health monitors runtime.**

If behavior is deterministic with known inputs → write a test.
If behavior emerges from real data over time → write a health check.

See `VALIDATION_*.md` for the full distinction and `verified_by.confidence: needs-health` markers.

---

## PURPOSE OF THIS FILE

Start with WHAT this file is and WHY it exists. Then detail what it protects. A good implementation:
- Names the critical outcomes it safeguards (correctness, safety, user-visible outputs, state integrity, money, security, uptime).
- States who relies on it (humans, agents, automated systems).
- Defines boundaries: what is verified here vs what is verified elsewhere.

What to include:
- one sentence on what this HEALTH file covers (module + scope).
- one sentence on why it exists (risk or uncertainty it reduces).
- explicit boundaries (what this file will not verify).

---

## WHY THIS PATTERN

HEALTH is separate from tests because it verifies real system health without changing implementation files. This keeps verification close to actual runtime behavior, while remaining lightweight and throttled. A good HEALTH doc:
- Anchors every check to VALIDATION criteria.
- Uses docking points declared in IMPLEMENTATION (no hidden hooks).
- Prioritizes meaningful signals over exhaustive coverage.

What to include:
- the failure mode this pattern avoids (e.g., tests pass but runtime fails).
- why docking-based checks are the right tradeoff here.
- how throttling protects performance and signal quality.

---

## HOW TO USE THIS TEMPLATE

1. Read the full doc chain first (OBJECTIVES → BEHAVIORS → PATTERNS → ALGORITHM → VALIDATION → IMPLEMENTATION → SYNC).
2. Read the linked implementation files to build a global mental model (entry points, dependencies, data flows).
3. Identify what *matters* most: vital signals for humans/agents (correctness, safety, money, security, user-visible outputs, state integrity).
4. Study each flow in IMPLEMENTATION; list available docks, then select the significant/risky/transformative docks.
5. Design verification mechanisms that compare input vs output against VALIDATION with minimal/no implementation changes.
6. Tie every HEALTH flag to one or more VALIDATION criteria.
7. Define throttling and display/forwarding so signals are useful and not noisy.

What to include:
- confirmation you read the full chain.
- summary of which flows you will cover and why.
- list of indicators you are committing to maintain.

---

## CHAIN

```
OBJECTIVES:      ./OBJECTIVES_{name}.md
PATTERNS:        ./PATTERNS_{name}.md
BEHAVIORS:       ./BEHAVIORS_{name}.md
ALGORITHM:       ./ALGORITHM_{name}.md
VALIDATION:      ./VALIDATION_{name}.md
IMPLEMENTATION:  ./IMPLEMENTATION_{name}.md
THIS:            HEALTH_{name}.md
SYNC:            ./SYNC_{name}.md
```

---

## IMPLEMENTS

This HEALTH file is a **spec**. The actual code lives in runtime:

```yaml
implements:
  runtime: runtime/checks.py       # Python code implementing these checks
  decorator: @check                # Decorator-based registration
```

> **Separation:** HEALTH.md defines WHAT to check and WHEN to trigger. Runtime code defines HOW to check.

> **Contract:** HEALTH checks verify input/output against VALIDATION with minimal or no code changes. After changes: update runtime or add TODO to SYNC. Run HEALTH checks at throttled rates.

What to include:
- exact runtime path for the checker code.
- ensure CHAIN paths resolve relative to this file.

---

## FLOWS ANALYSIS (TRIGGERS + FREQUENCY)

Explain which flows you are analyzing and why these flows matter. Include trigger nature and frequency analysis so HEALTH runs at safe cadence.

```yaml
flows_analysis:
  - flow_id: {flow_name_from_implementation}  # must match a flow name in IMPLEMENTATION
    purpose: {why this flow is critical}  # concrete consequence if this flow fails
    triggers:
      - type: {event|schedule|manual|external}  # choose the real trigger class
        source: {where it originates}  # file:function, endpoint, queue, or external system
        notes: {what starts this flow}  # include event name or request path
    frequency:
      expected_rate: {e.g. 5/min}  # normal steady-state rate with units; derive from prod metrics over a stable window
      peak_rate: {e.g. 50/min}  # peak rate with units; use observed p95/p99 peaks not guesswork
      burst_behavior: {what happens under load}  # describe retries, spikes, or backpressure and how the system reacts
    risks:
      - {risk or failure mode}  # link to VALIDATION IDs if possible
    notes: {any other context}  # cross-boundary context (api/db/file) or constraints
```

What to include:
- flow_id, purpose, triggers (type + origin), frequency (expected + peak), risks, notes.
- concrete sources (file paths, endpoints, queues) for triggers and inputs.
- VALIDATION IDs in risks when applicable.

How to fill:
- flow_id must match a flow name in IMPLEMENTATION.
- purpose should state the concrete consequence of failure.
- triggers must include origin (file:function or external source).
- frequency should include expected + peak rates with units.
- risks must reference VALIDATION IDs when possible.

---

## HEALTH INDICATORS SELECTED

List the indicators that matter most. These should map directly to VALIDATION criteria and client impact.

## OBJECTIVES COVERAGE

| Objective | Indicators | Why These Signals Matter |
|-----------|------------|--------------------------|
| {Objective} | {indicator names} | {how these signals protect the objective} |

```yaml
health_indicators:
  - name: {indicator_name}  # stable, machine-friendly identifier
    flow_id: {flow_name_from_implementation}  # must match IMPLEMENTATION flow
    priority: {high|med|low}  # impact + likelihood, not effort
    rationale: {why this indicator matters}  # explicit client/operator impact
```

What to include:
- indicator name, flow_id, priority, rationale.
- explicit client impact in rationale.

How to fill:
- name should be stable and machine-friendly.
- flow_id must match IMPLEMENTATION.
- priority should reflect impact + likelihood.
- rationale must tie to user or operator outcomes.

---

## STATUS (RESULT INDICATOR)

This is the live result indicator for the module. Keep it updated; Doctor will detect it and surface it in tasks automatically.

```yaml
status:
  stream_destination: {stream_destination}  # mind-marker; where Doctor reads from (file/api/bus)
  result:
    representation: {binary|float_0_1|enum|tuple|vector}  # must match value type
    value: {current_value}  # current computed value
    updated_at: {timestamp}  # ISO-8601 time of last update
    source: {checker_or_indicator}  # must match a defined checker or indicator name
```

What to include:
- stream destination (type + target + format + auth if needed).
- result representation + current value + timestamp + source.

How to fill:
- stream_destination must name where Doctor should read from (file, api, bus).
- result.value must match representation.
- updated_at should be ISO-8601.
- source should match an indicator or checker name.

---

## DOCK TYPES (COMPLETE LIST)

Use these standardized types for docking points. Add `custom` only if none apply.

- `graph_ops` (graph operations or traversal)
- `file` (filesystem read/write)
- `api` (HTTP/RPC boundary)
- `event` (event emission or subscription)
- `queue` (message queue/pubsub)
- `db` (database read/write)
- `cache` (cache read/write)
- `stream` (streaming IO)
- `scheduler` (cron/timers)
- `process` (subprocess spawn/exit)
- `cli` (command invocation)
- `config` (config load/override)
- `auth` (identity/permission boundary)
- `metrics` (telemetry emission)
- `custom` (document why a standard type is insufficient)

What to include:
- if you use `custom`, explain why no standard type fits.

---

## CHECKER INDEX

```yaml
checkers:
  - name: {checker_name}  # stable identifier used in logs and status
    purpose: {what it verifies}  # tie to VALIDATION or user-visible outcome
    status: {active|pending}  # active if running, pending if planned
    priority: {high|med|low}  # impact + risk
  - name: {checker_name}  # add more checkers as needed
    purpose: {what it verifies}
    status: {active|pending}
    priority: {high|med|low}
```

How to fill:
- List only the checkers you plan to maintain.
- “purpose” should map to a VALIDATION criterion or user-visible outcome.
- “priority” reflects impact and risk, not implementation difficulty.

What to include:
- active vs pending status for each checker.
- ensure checker names match indicator sections.

---

## INDICATOR: {Indicator Name}

Explain the indicator in terms of client value and validation. Then define representation, docks, mechanism, throttling, forwarding, and display.

What to include:
- a stable indicator name used everywhere else.
- direct link to VALIDATION criteria and client value.
- dock IDs that exist in IMPLEMENTATION.

### VALUE TO CLIENTS & VALIDATION MAPPING

```yaml
value_and_validation:
  indicator: {indicator_name}  # must match the indicator section name
  client_value: {why this matters to users/operators}  # concrete user/operator impact
  validation:
    - validation_id: {V1}  # must exist in VALIDATION docs
      criteria: {what must hold}  # mirror VALIDATION language
    - validation_id: {V2}
      criteria: {what must hold}
```

How to fill:
- client_value must be specific and user-facing.
- validation_id must exist in VALIDATION docs.
- criteria should mirror VALIDATION language.

### HEALTH REPRESENTATION

Choose how this indicator is represented. Multiple representations are allowed when useful (e.g., enum for UI + float for aggregation).

```yaml
representation:
  allowed:
    - binary        # 0/1 only
    - float_0_1     # 0.0–1.0 score
    - enum          # OK/WARN/ERROR/UNKNOWN (or similar)
    - tuple         # {state, score}
    - vector        # per-checker signals, aggregate later
  selected:
    - {binary|float_0_1|enum|tuple|vector}  # subset of allowed
  semantics:
    binary: {what 0/1 means here}  # define the threshold
    float_0_1: {how score is computed and interpreted}  # formula or range mapping
    enum: {state names and meaning}  # OK/WARN/ERROR definitions
    tuple: {state rules + score meaning}  # combine enum + score
    vector: {what per-checker signals look like}  # keyed by checker name
  aggregation:
    method: {how multiple checks roll up}  # must not hide critical failures
    display: {which representation is surfaced to humans}  # match display surfaces
```

How to fill:
- selected must be a subset of allowed.
- semantics should be quantitative where possible.
- aggregation.method must not hide critical failures.
- display should match surfaces listed later.

### DOCKS SELECTED

```yaml
docks:
  - point: {thing_node_id}  # links to thing node representing observable point
    type: {event|schedule|hook}
    payload: {data available}  # e.g. {module_id, docs_found[], docs_expected[]}
```

How to fill:
- point links to a thing node (observable point in the system).
- payload describes what data the check receives.

### ALGORITHM / CHECK MECHANISM

Checks use decorators — Python is the single source of truth:

```python
@check(
    id="{indicator_name}",
    triggers=[
        triggers.file.on_delete("{pattern}"),
        triggers.cron.daily(),
    ],
    on_problem="{PROBLEM_ID}",  # from VOCABULARY
    task="{TASK_name}",         # task template to create
)
def {indicator_name}(ctx) -> dict:
    """Check description."""
    # ... check logic ...
    if healthy:
        return Signal.healthy()
    if critical_condition:
        return Signal.critical(details=...)
    return Signal.degraded(details=...)
```

How to fill:
- id should be stable and machine-friendly.
- triggers should match real events or schedules.
- on_problem must exist in VOCABULARY.
- task must exist in tasks/ folder.
- Check returns Signal.healthy/degraded/critical.

### SIGNALS

```yaml
signals:
  healthy: {condition for healthy state}
  degraded: {condition for degraded state}
  critical: {condition for critical state}
```

How to fill:
- Each state describes a condition in plain language.
- States map to operational response (healthy=ok, degraded=warn, critical=alert).

### THROTTLING STRATEGY

```yaml
throttling:
  trigger: {event_or_schedule}  # real event name or schedule
  max_frequency: {e.g. 1/min}  # safe for production
  burst_limit: {count}  # cap per time window
  backoff: {policy}  # prevents alert storms
```

How to fill:
- trigger should reference real events or schedules.
- max_frequency must be safe for production.
- backoff should prevent cascading alerts.

### FORWARDINGS & DISPLAYS

```yaml
forwarding:
  targets:
    - location: {where results are sent}  # exact endpoint/path/topic
      transport: {file/api/event}  # transport type
      notes: {why}  # operational purpose
display:
  locations:
    - surface: {UI/CLI/Log}  # user-facing surface
      location: {path or screen}  # exact location
      signal: {green/ok/warn}  # must match representation
      notes: {how it looks}  # visual semantics
```

How to fill:
- forwarding targets must be actionable and monitored.
- display should align with representation semantics.

What to include:
- at least one forwarding target if the indicator is high priority.
- at least one display surface for human visibility.

### MANUAL RUN

```yaml
manual_run:
  command: {command}  # runnable as-is
  notes: {when to run manually}  # triggers for manual execution
```

How to fill:
- command must be runnable as-is.
- notes should state when manual runs are expected.

What to include:
- any required env vars or flags.
- expected output shape or success criteria.
---

## HOW TO RUN

```bash
# Run all health checks for this module
{command}

# Run a specific checker
{command}
```

What to include:
- the exact command for all checks.
- the exact command for one named checker.

---

## KNOWN GAPS

What to track here:
- Every VALIDATION criterion not yet covered by a checker
- Missing docs or observability required to check

<!-- @mind:todo {Missing checker for validation criterion} -->
<!-- @mind:todo {Unverified validation criteria} -->

---

## MARKERS

> See PRINCIPLES.md "Feedback Loop" section for marker format and usage.

<!-- @mind:todo {Missing health check} -->
<!-- @mind:proposition {Health signal improvement} -->
<!-- @mind:escalation {Throttling or monitoring decision needed} -->
