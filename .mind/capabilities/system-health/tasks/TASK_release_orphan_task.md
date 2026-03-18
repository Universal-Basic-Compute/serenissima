# Task: Release Orphan Task

**Automated:** Yes (self-healing)

## Problem

`TASK_ORPHAN` — A task was claimed by an agent that is now dead.

## Resolution

This is auto-resolved by the health check:
1. Detect dead agent
2. Find tasks claimed by dead agent
3. Release tasks back to pending
4. Log the release

## When Agent Needed

Never — this is fully automated. The task_run is created for audit trail only.

## Evidence Required

- Dead agent ID
- Released task IDs
- Timestamp of release
