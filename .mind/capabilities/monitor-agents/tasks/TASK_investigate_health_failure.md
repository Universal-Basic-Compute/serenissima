# Task: investigate_health_failure

```
NODE: narrative:task
STATUS: active
PROBLEM: HEALTH_CHECK_FAILED
EXECUTOR: agent
```

---

## Purpose

Investigate and fix a health check that crashed during execution.
Requires agent judgment - not automated.

---

## Trigger

- Problem: HEALTH_CHECK_FAILED
- Signal: critical
- Source: on_error in MCP server

---

## Context Provided

| Field | Type | Description |
|-------|------|-------------|
| target | string | Capability ID that failed |
| error | string | Exception message |
| traceback | string | Full Python traceback |
| capability | string | Capability name |

---

## Agent Instructions

```markdown
## Investigation Steps

1. **Read the traceback** - Understand what failed
2. **Locate the check** - Find the check.py file
3. **Reproduce locally** - Run the check manually if possible
4. **Identify root cause**:
   - Missing import?
   - Null pointer / missing field?
   - Database connection issue?
   - Logic error?

5. **Fix the check** - Edit the check.py
6. **Test the fix** - Verify it runs without error
7. **Document** - Update SYNC with what was fixed

## Common Issues

| Error | Likely Cause | Fix |
|-------|--------------|-----|
| ImportError | Missing dependency | Add import or install |
| KeyError | Missing node field | Add null check |
| ConnectionError | DB not available | Check config |
| TypeError | Wrong argument type | Fix function call |

## Do NOT

- Disable the check without fixing
- Suppress the error silently
- Leave the capability broken
```

---

## Success Criteria

- Check runs without exception
- Problem detection still works
- SYNC updated with fix details

---

## Escalation

If unable to fix after investigation:
- Create @mind:escalation marker in capability SYNC
- Document what was tried
- Tag for human review
