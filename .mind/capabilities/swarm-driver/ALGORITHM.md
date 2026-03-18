# Swarm Driver — Algorithm

```
STATUS: CANONICAL
```

---

## A1: Main Loop

```python
def run_cycle():
    """
    Run one driver cycle. Called every 2 minutes.
    Only processes if new content exists.
    Creates at most ONE task per cycle (no dupes).
    """
    state = load_state()  # positions, last_task_hash

    # 1. Check for new content
    new_lines = collect_new_lines(state.positions)
    if not new_lines:
        return  # Nothing new, skip

    # 2. Analyze logs
    signals = analyze_logs(new_lines)
    if not signals:
        save_state(state)  # Update positions only
        return

    # 3. Pick highest priority signal
    best = max(signals, key=lambda s: s.priority)

    # 4. Singleton: only one driver task active at a time
    if state.last_task_id and is_task_active(state.last_task_id):
        return  # Previous task still running, wait

    # 5. Create ONE task (reactivates if issue recurs after completion)
    task_id = create_task(best)

    # 6. Update SYNC
    update_sync(task_id, best)

    # 7. Save state
    state.last_task_hash = task_hash
    save_state(state)

    return task_id
```

---

## A2: Collect New Lines

```python
def collect_new_lines(positions: dict) -> dict[str, list[str]]:
    """
    Read only new lines from each log file.
    """
    log_dir = Path(".mind/swarm/logs")
    new_lines = {}

    for log_file in log_dir.glob("*.log"):
        name = log_file.name
        pos = positions.get(name, 0)
        size = log_file.stat().st_size

        if size <= pos:
            continue  # No new content

        with open(log_file) as f:
            f.seek(pos)
            lines = f.readlines()
            new_lines[name] = lines
            positions[name] = f.tell()

    return new_lines
```

---

## A3: Analyze Logs

```python
def analyze_logs(new_lines: dict) -> list[Signal]:
    """
    Detect patterns in new log lines.
    Returns list of signals sorted by priority.
    """
    signals = []

    for source, lines in new_lines.items():
        text = "".join(lines)

        # Error detection
        if "ERROR" in text or "FAILED" in text:
            signals.append(Signal(
                type="ERROR_DETECTED",
                target=extract_target(text),
                priority=10,
                context=extract_context(lines, "ERROR"),
            ))

        # Stuck detection
        if "retrying" in text.lower() or "timeout" in text.lower():
            signals.append(Signal(
                type="AGENT_STUCK",
                target=extract_agent(source),
                priority=8,
                context=lines[-5:],
            ))

        # Completion detection → check SYNC
        if "completed" in text.lower() or "done" in text.lower():
            signals.append(Signal(
                type="SYNC_UPDATE_NEEDED",
                target="SYNC_Project_State",
                priority=5,
                context=extract_completions(lines),
            ))

        # Idle detection (from tasks.log)
        if source == "tasks.log" and "pending" in text:
            pending_count = text.count("pending")
            if pending_count == 0:
                signals.append(Signal(
                    type="NO_TASKS_AVAILABLE",
                    target="task_scan",
                    priority=7,
                    context=["No pending tasks, agents may idle"],
                ))

    return sorted(signals, key=lambda s: -s.priority)
```

---

## A4: Create Task

```python
def create_task(signal: Signal) -> str:
    """
    Create exactly ONE task_run from signal.
    """
    task_id = f"TASK_RUN_{signal.type}_{hash(signal.target)[:8]}"

    # Map signal to task template
    SIGNAL_TO_TEMPLATE = {
        "ERROR_DETECTED": "TASK_investigate_error",
        "AGENT_STUCK": "TASK_unblock",
        "SYNC_UPDATE_NEEDED": "TASK_update_sync",
        "NO_TASKS_AVAILABLE": "TASK_scan_for_work",
    }

    template = SIGNAL_TO_TEMPLATE.get(signal.type, "TASK_investigate")

    # Map signal to agent
    SIGNAL_TO_AGENT = {
        "ERROR_DETECTED": "AGENT_Fixer",
        "AGENT_STUCK": "AGENT_Weaver",
        "SYNC_UPDATE_NEEDED": "AGENT_Witness",
        "NO_TASKS_AVAILABLE": "AGENT_Scout",
    }

    agent = SIGNAL_TO_AGENT.get(signal.type, "AGENT_Fixer")

    # Create in graph
    graph.create_task_run(
        id=task_id,
        template=template,
        target=signal.target,
        agent=agent,
        priority=signal.priority,
        context=signal.context,
    )

    return task_id
```

---

## A5: Update SYNC

```python
def update_sync(task_id: str, signal: Signal):
    """
    Append driver action to SYNC file.
    """
    sync_path = Path(".mind/state/SYNC_Project_State.md")

    entry = f"""
## Driver Action: {datetime.now().isoformat()}

- **Signal:** {signal.type}
- **Target:** {signal.target}
- **Task:** {task_id}
- **Priority:** {signal.priority}
"""

    with open(sync_path, "a") as f:
        f.write(entry)
```
