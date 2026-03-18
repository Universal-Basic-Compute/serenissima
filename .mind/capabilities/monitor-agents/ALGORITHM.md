# Algorithm: monitor-agents

```
NODE: narrative:algorithm
STATUS: active
```

---

## Main Loop

```python
# Runs every 60 seconds via cron trigger

def monitor_cycle(ctx):
    now = time.time()

    # 1. Check all running agents
    for actor in ctx.query_nodes(type="actor", status="running"):
        check_agent_health(ctx, actor, now)

    # 2. Check all claimed/running tasks
    for task in ctx.query_nodes(type="task_run", status=["claimed", "running"]):
        check_task_health(ctx, task, now)
```

---

## Agent Health Check

```python
STUCK_THRESHOLD = 5 * 60      # 5 minutes
DEAD_THRESHOLD = 15 * 60      # 15 minutes

def check_agent_health(ctx, actor, now):
    elapsed = now - actor.last_heartbeat

    if elapsed <= STUCK_THRESHOLD:
        return  # Healthy

    if elapsed <= DEAD_THRESHOLD:
        # Warning only
        emit_problem("AGENT_STUCK", actor.id, "warning")
        return

    # Dead - cleanup required
    emit_problem("AGENT_DEAD", actor.id, "critical")
    cleanup_dead_agent(ctx, actor)

def cleanup_dead_agent(ctx, actor):
    # 1. Mark actor dead
    ctx.set_property(actor.id, "status", "dead")

    # 2. Find and release claimed tasks
    tasks = ctx.query_links(
        from_type="task_run",
        to_id=actor.id,
        link_type="CLAIMED_BY"
    )
    for task in tasks:
        release_task(ctx, task.from_id)

    # 3. Remove WORKS_ON links
    ctx.delete_links(from_id=actor.id, link_type="WORKS_ON")
```

---

## Task Health Check

```python
TASK_WARN_THRESHOLD = 60 * 60     # 1 hour
TASK_RELEASE_THRESHOLD = 2 * 60 * 60  # 2 hours

def check_task_health(ctx, task, now):
    # Check for orphan first
    if task.status == "claimed":
        agent = ctx.link_target(task.id, "CLAIMED_BY")
        if agent and agent.status == "dead":
            emit_problem("TASK_ORPHAN", task.id, "critical")
            release_task(ctx, task.id)
            return

    # Check for stuck
    if task.status == "running":
        elapsed = now - task.step_started_at

        if elapsed <= TASK_WARN_THRESHOLD:
            return  # OK

        if elapsed <= TASK_RELEASE_THRESHOLD:
            emit_problem("TASK_STUCK", task.id, "warning")
            return

        # Release after 2h
        emit_problem("TASK_STUCK", task.id, "critical")
        release_task(ctx, task.id)
        notify_agent(ctx, task)

def release_task(ctx, task_id):
    ctx.set_property(task_id, "status", "pending")
    ctx.set_property(task_id, "claimed_by", None)
    ctx.delete_links(from_id=task_id, link_type="CLAIMED_BY")
```

---

## Health Check Error Handling

```python
# In MCP server, not in check.py

def run_capability_check(capability, ctx):
    try:
        results = capability.check(ctx)
        return results
    except Exception as e:
        # Create problem for investigation
        create_task_run(
            problem="HEALTH_CHECK_FAILED",
            target=capability.id,
            signal="critical",
            context={
                "error": str(e),
                "traceback": traceback.format_exc(),
                "capability": capability.name,
            }
        )
        return []
```

---

## Timing

| Check | Interval | Threshold |
|-------|----------|-----------|
| Agent heartbeat | 60s | 5min warn, 15min dead |
| Task step | 60s | 1h warn, 2h release |
| Health check errors | on_error | immediate |
