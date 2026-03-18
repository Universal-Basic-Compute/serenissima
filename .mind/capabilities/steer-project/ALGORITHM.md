# Steer Project — Algorithm

```
STATUS: CANONICAL
CAPABILITY: steer-project
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

## CORE ALGORITHMS

### A1: Steering Session

```
FUNCTION run_steering_session() -> SteeringSession:
    session = SteeringSession(
        id=generate_id(),
        timestamp=now(),
        findings=[],
        actions_taken=[],
    )

    # Phase 1: Gather State
    sync_files = find_all_sync_files()
    escalations = find_all_escalations()
    active_tasks = get_active_tasks()
    recent_commits = get_recent_commits(days=7)

    # Phase 2: Assess
    session.findings.extend(assess_sync_freshness(sync_files))
    session.findings.extend(assess_escalations(escalations))
    session.findings.extend(assess_task_health(active_tasks))
    session.findings.extend(assess_progress(recent_commits))
    session.findings.extend(identify_blockers())

    # Phase 3: Act
    FOR finding IN session.findings:
        action = determine_action(finding)
        IF action IS NOT NULL:
            execute_action(action)
            session.actions_taken.append(action)

    # Phase 4: Report
    write_steering_report(session)

    RETURN session
```

### A2: SYNC Freshness Assessment

```
FUNCTION assess_sync_freshness(sync_files) -> List[Finding]:
    findings = []

    FOR file IN sync_files:
        age_days = (now() - file.mtime).days

        IF age_days > 30:
            findings.append(Finding(
                type="staleness",
                severity="critical",
                description=f"SYNC file not updated in {age_days} days: {file}",
                suggested_action="Update immediately",
            ))
        ELIF age_days > 7:
            findings.append(Finding(
                type="staleness",
                severity="medium",
                description=f"SYNC file aging ({age_days} days): {file}",
                suggested_action="Schedule update",
            ))

    RETURN findings
```

### A3: Escalation Assessment

```
FUNCTION assess_escalations(escalations) -> List[Finding]:
    findings = []

    FOR esc IN escalations:
        age_days = (now() - esc.created).days

        IF esc.status == "open" AND age_days > 7:
            findings.append(Finding(
                type="blocker",
                severity="critical",
                description=f"Unprocessed escalation ({age_days} days): {esc.location}",
                evidence=[esc.content],
                suggested_action="Process immediately",
            ))
        ELIF esc.status == "open" AND age_days > 3:
            findings.append(Finding(
                type="blocker",
                severity="high",
                description=f"Aging escalation ({age_days} days): {esc.location}",
                evidence=[esc.content],
                suggested_action="Schedule processing",
            ))

    RETURN findings
```

### A4: Blocker Identification

```
FUNCTION identify_blockers() -> List[Finding]:
    findings = []

    # Pattern: Multiple tasks blocked on same thing
    blocked_tasks = get_tasks_with_status("blocked")
    blocker_counts = {}

    FOR task IN blocked_tasks:
        IF task.blocked_by:
            blocker_counts[task.blocked_by] = blocker_counts.get(task.blocked_by, []) + [task.id]

    FOR blocker, affected IN blocker_counts.items():
        IF len(affected) >= 2:
            findings.append(Finding(
                type="blocker",
                severity="critical",
                description=f"Blocker affecting {len(affected)} tasks: {blocker}",
                evidence=affected,
                suggested_action="Prioritize resolution",
            ))

    RETURN findings
```

### A5: Action Execution

```
FUNCTION execute_action(action) -> Result:
    SWITCH action.type:
        CASE "update_sync":
            # Create task to update stale SYNC file
            RETURN create_task(
                template="TASK_update_sync",
                inputs={"file": action.target},
            )

        CASE "process_escalation":
            RETURN create_task(
                template="TASK_process_escalation",
                inputs={"location": action.target},
            )

        CASE "resolve_blocker":
            RETURN create_task(
                template="TASK_resolve_blocker",
                inputs={"blocker": action.target},
                priority="critical",
            )

        CASE "strategic_task":
            RETURN create_task(
                template=action.template,
                inputs=action.inputs,
                rationale=action.rationale,
            )
```

---

## DATA STRUCTURES

### Steering Session Node

```yaml
node_type: narrative
type: steering_session

content:
  timestamp: "2024-01-15T09:00:00Z"
  scope: project
  findings:
    - type: staleness
      description: "SYNC file not updated..."
  actions_taken:
    - type: update_sync
      target: "docs/auth/SYNC.md"
  tasks_created: ["task_123", "task_124"]
```

### Finding Structure

```yaml
finding:
  type: blocker|drift|staleness|progress|risk
  severity: critical|high|medium|low
  description: string
  evidence: string[]
  suggested_action: string
```
