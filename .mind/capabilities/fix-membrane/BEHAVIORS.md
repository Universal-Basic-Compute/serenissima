# Fix Membrane — Behaviors

```
STATUS: CANONICAL
CAPABILITY: fix-membrane
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

Observable behaviors of the fix-membrane capability.

---

## B1: Missing Procedures Detection

**When:** Init or scheduled health check

```
GIVEN:  .mind/ directory exists
WHEN:   Health check runs (init_scan, cron, file_watch)
THEN:   Check for .mind/procedures/*.yaml
AND:    If no files found -> create task_run for MEMBRANE_NO_PROTOCOLS
```

**Effect:** Empty procedures directory detected automatically.

---

## B2: Parse Error Detection

**When:** Procedure file loaded

```
GIVEN:  .yaml file exists in .mind/procedures/
WHEN:   Health check runs or procedure_list called
THEN:   Attempt yaml.safe_load() on file
AND:    If exception raised -> create task_run for MEMBRANE_PARSE_ERROR
AND:    task_run includes line number and error message
```

**Effect:** YAML syntax errors surface with location.

---

## B3: Step Validation

**When:** Procedure successfully parsed

```
GIVEN:  Procedure YAML parsed without error
WHEN:   Schema validation runs
THEN:   For each step in steps[]:
        - Check 'id' exists and is string
        - Check 'action' exists and is string
        - Check 'params' is dict if present
AND:    If any fail -> create task_run for MEMBRANE_INVALID_STEP
```

**Effect:** Malformed steps identified with specifics.

---

## B4: Required Fields Validation

**When:** Procedure successfully parsed

```
GIVEN:  Procedure YAML parsed without error
WHEN:   Schema validation runs
THEN:   Check required fields present:
        - 'name' (string, non-empty)
        - 'steps' (list, non-empty)
AND:    If any missing -> create task_run for MEMBRANE_MISSING_FIELDS
```

**Effect:** Incomplete procedures flagged.

---

## B5: Syntax Fix Execution

**When:** Agent claims MEMBRANE_PARSE_ERROR task

```
GIVEN:  task_run for MEMBRANE_PARSE_ERROR exists
WHEN:   Agent claims and loads SKILL_fix_procedure
THEN:   Read file content
AND:    Identify error location from parse exception
AND:    Apply targeted fix (indent, colon, quote, etc.)
AND:    Re-validate until clean
```

**Effect:** YAML syntax repaired.

---

## B6: Structure Fix Execution

**When:** Agent claims structure-related task

```
GIVEN:  task_run for MEMBRANE_INVALID_STEP or MEMBRANE_MISSING_FIELDS
WHEN:   Agent claims and loads skill
THEN:   Load canonical procedure template
AND:    Compare against broken procedure
AND:    Add missing fields or fix step structure
AND:    Validate against schema
```

**Effect:** Procedure structure repaired.

---

## B7: Procedure Creation

**When:** Agent claims MEMBRANE_NO_PROTOCOLS task

```
GIVEN:  task_run for MEMBRANE_NO_PROTOCOLS exists
WHEN:   Agent claims task
THEN:   Copy procedure templates from mind-platform/templates/
AND:    Place in .mind/procedures/
AND:    Validate each copied file
```

**Effect:** Base procedures installed.

---

## BEHAVIOR SUMMARY

| Trigger | Behavior | Output |
|---------|----------|--------|
| No procedures exist | Detection | task_run created (MEMBRANE_NO_PROTOCOLS) |
| YAML parse fails | Detection | task_run with error location |
| Step structure invalid | Detection | task_run with step details |
| Required field missing | Detection | task_run with field list |
| Agent claims fix task | Repair | File modified, validated |
| Agent claims create task | Creation | Templates copied |
