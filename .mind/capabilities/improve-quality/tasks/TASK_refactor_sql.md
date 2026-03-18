# Task: refactor_sql

```
NODE: narrative:task
STATUS: active
```

---

## Purpose

Refactor complex SQL query to be under complexity thresholds.

---

## Resolves

| Problem | Severity |
|---------|----------|
| LONG_SQL | medium |

---

## Inputs

```yaml
inputs:
  target: file_path       # File with complex SQL
  issues: string[]        # What thresholds exceeded (length, joins, subqueries)
  problem: problem_id     # LONG_SQL
```

---

## Outputs

```yaml
outputs:
  views_created: string[] # Names of views created
  ctes_used: bool         # Were CTEs introduced
  queries_split: int      # Number of queries split
  results_match: bool     # Do results match original
  tests_pass: bool        # Do tests still pass
```

---

## Executor

```yaml
executor:
  type: agent
  agents: [architect, groundwork]
```

---

## Uses

```yaml
uses:
  skill: SKILL_refactor
```

---

## Executes

```yaml
executes:
  procedure: PROCEDURE_refactor
```

---

## Process

1. **Analyze** — Understand query structure and purpose
2. **Identify patterns** — Find repeated subqueries, complex joins
3. **Extract views** — Create database views for reusable subqueries
4. **Use CTEs** — Replace subqueries with Common Table Expressions
5. **Split queries** — Divide into multiple queries if concerns are separable
6. **Test** — Verify results are unchanged
7. **Document** — Add to ALGORITHM.md

---

## Refactoring Strategies

- Extract repeated subqueries to views
- Replace nested subqueries with CTEs
- Break complex JOINs into intermediate results
- Use temp tables for complex transformations
- Add indices for performance

---

## Validation

Complete when:
1. Query length < 1000 characters
2. Join count < 6
3. Subquery depth < 3
4. Query returns same results as original
5. Tests pass
6. Health check no longer detects LONG_SQL

---

## Instance (task_run)

Created by runtime when HEALTH.on_signal fires:

```yaml
node_type: narrative
type: task_run
nature: "concerns"

links:
  - nature: serves
    to: TASK_refactor_sql
  - nature: concerns
    to: "{target}"
  - nature: resolves
    to: LONG_SQL
```
