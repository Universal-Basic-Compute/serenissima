# Task: Investigate Stuck Agent

**Automated:** No (requires investigation)

## Problem

`AGENT_STUCK` — Agent has not sent heartbeat for >5 minutes.

## Resolution

1. Check if agent process is still running
2. Check logs for the agent
3. Determine if stuck on slow operation or actually dead
4. If dead: let auto-release handle it (10 min threshold)
5. If slow: consider increasing timeout

## When Agent Needed

When agent is stuck but not dead (5-10 min window).
Human intervention may be needed if recurring.

## Evidence Required

- Agent ID and current task
- Last heartbeat time
- Last known step
- Agent logs
