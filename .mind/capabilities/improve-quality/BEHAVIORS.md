# Improve Quality — Behaviors

```
STATUS: CANONICAL
CAPABILITY: improve-quality
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

## PURPOSE

Observable behaviors of the improve-quality capability.

---

## B1: Monolith Detection

**When:** File scan triggers

```
GIVEN:  Code file exists (*.py, *.ts, *.js, etc.)
WHEN:   Health check runs (init_scan, cron, file_watch)
THEN:   Count lines (excluding comments/blanks)
AND:    If count > 500 -> create task_run for MONOLITH
```

**Effect:** Large files surface for splitting.

---

## B2: Magic Value Detection

**When:** Code scan triggers

```
GIVEN:  Code file exists
WHEN:   Health check runs
THEN:   Scan for hardcoded literals
AND:    Filter out common exceptions (0, 1, -1, 100, empty string)
AND:    If suspicious literals found -> create task_run for MAGIC_VALUES
```

**Effect:** Hardcoded values flagged for extraction.

---

## B3: Secret Detection

**When:** File scan or commit hook triggers

```
GIVEN:  Code file exists
WHEN:   Health check runs OR pre-commit hook fires
THEN:   Scan for secret patterns (API keys, passwords, tokens)
AND:    If match found -> create task_run for HARDCODED_SECRET (critical)
```

**Effect:** Secrets caught before they spread. Highest priority.

---

## B4: Prompt Length Detection

**When:** Code scan triggers

```
GIVEN:  Code file with prompt strings
WHEN:   Health check runs
THEN:   Find prompt variables (PROMPT, system_prompt, etc.)
AND:    Measure character count
AND:    If count > 4000 -> create task_run for LONG_PROMPT
```

**Effect:** Bloated prompts flagged for compression.

---

## B5: SQL Complexity Detection

**When:** Code scan triggers

```
GIVEN:  Code file with SQL strings
WHEN:   Health check runs
THEN:   Find SQL queries
AND:    Measure: character count, join count, subquery depth
AND:    If over threshold -> create task_run for LONG_SQL
```

**Effect:** Complex queries flagged for refactoring.

---

## B6: Naming Violation Detection

**When:** File scan triggers

```
GIVEN:  Code file exists
WHEN:   Health check runs
THEN:   Check filename against convention (language-specific)
AND:    Check class/function/variable names inside file
AND:    If violations found -> create task_run for NAMING_CONVENTION
```

**Effect:** Naming inconsistencies flagged for fixing.

---

## B7: Task Creation

**When:** Problem detected

```
GIVEN:  Quality problem found (any of the 6 types)
WHEN:   Detection mechanism runs
THEN:   Create task_run node:
        - nature: "urgently concerns" (if HARDCODED_SECRET)
        - nature: "importantly concerns" (if MONOLITH)
        - nature: "concerns" (others)
AND:    Link task_run -[serves]-> appropriate TASK
AND:    Link task_run -[concerns]-> target file
AND:    Link task_run -[resolves]-> problem
```

**Effect:** Work items exist for agent or script pickup.

---

## B8: Script Execution (Mechanical Fixes)

**When:** MAGIC_VALUES, HARDCODED_SECRET, or NAMING_CONVENTION detected

```
GIVEN:  Problem is script-resolvable
WHEN:   Script runner picks up task
THEN:   Execute appropriate script:
        - extract_constants for MAGIC_VALUES
        - extract_secrets for HARDCODED_SECRET
        - rename_to_convention for NAMING_CONVENTION
AND:    Validate fix
AND:    Mark task complete or escalate
```

**Effect:** Mechanical issues fixed automatically.

---

## B9: Agent Execution (Judgment Required)

**When:** MONOLITH, LONG_PROMPT, or LONG_SQL detected

```
GIVEN:  Problem requires agent judgment
WHEN:   Agent claims task
THEN:   Load SKILL_refactor
AND:    Execute PROCEDURE_refactor
AND:    Validate fix preserves behavior
AND:    Mark task complete or escalate
```

**Effect:** Complex refactoring guided by procedure.

---

## B10: Resolution Confirmation

**When:** Task completed

```
GIVEN:  task_run status: completed
WHEN:   Next health check runs
THEN:   Re-scan target file
AND:    If problem gone -> problem resolved
AND:    If still present -> investigate
```

**Effect:** Closed loop verification.

---

## BEHAVIOR SUMMARY

| Trigger | Behavior | Output | Method |
|---------|----------|--------|--------|
| Large file | B1 Detection | task_run created | agent |
| Hardcoded literals | B2 Detection | task_run created | script |
| Secret patterns | B3 Detection | task_run created | script |
| Long prompt | B4 Detection | task_run created | agent |
| Complex SQL | B5 Detection | task_run created | agent |
| Bad naming | B6 Detection | task_run created | script |
| Problem found | B7 Task creation | task_run linked | - |
| Script task | B8 Script exec | File modified | auto |
| Agent task | B9 Agent exec | File modified | manual |
| Task done | B10 Confirmation | Problem resolved | - |
