# Steer Project — Behaviors

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
THIS:            BEHAVIORS.md (you are here)
ALGORITHM:       ./ALGORITHM.md
```

---

## OBSERVABLE BEHAVIORS

### B1: Weekly Review Triggers

**When:** Weekly cron fires (e.g., Monday morning)
**Then:** Steering session initiated
**Observable:** steering_session node created

### B2: Stale SYNC Detection

**When:** SYNC file not modified in >7 days
**Then:** TASK_update_sync created
**Observable:** Task linked to stale file

### B3: Escalation Processing

**When:** @mind:escalation marker found
**Then:** Marker tracked, task created if unresolved >3 days
**Observable:** escalation_marker node, potential task

### B4: Blocker Identification

**When:** Multiple tasks blocked by same issue
**Then:** Blocker node created, resolution task prioritized
**Observable:** blocker node with affected_tasks links

### B5: Progress Report Generation

**When:** Steering session completes
**Then:** Summary written to SYNC_Project_State.md
**Observable:** SYNC file updated with session findings

### B6: Strategic Task Creation

**When:** Assessment identifies missing work
**Then:** High-level tasks created with strategic rationale
**Observable:** Tasks with steering_session source link

---

## INTERACTION PATTERNS

### Pattern: Weekly Steering Session

```
1. Trigger: cron.weekly() OR human request
2. Read project state:
   - All SYNC files
   - All escalation markers
   - Active tasks
   - Recent commits
3. Assess:
   - What progressed?
   - What's blocked?
   - What's stale?
   - What's missing?
4. Act:
   - Update stale SYNC files
   - Process escalations
   - Create strategic tasks
   - Prioritize backlog
5. Report:
   - Update SYNC_Project_State.md
   - List findings
   - List actions taken
```

### Pattern: Escalation Processing

```
1. Find all @mind:escalation markers
2. For each:
   - Parse content and context
   - Determine if resolved
   - If open >3 days: create task
   - If resolved: mark resolved
3. Report escalation status
```

### Pattern: Doc Freshness Check

```
1. Glob all SYNC*.md files
2. For each:
   - Get last modified time
   - If >7 days: flag stale
   - If >30 days: critical
3. Create update tasks for stale files
```
