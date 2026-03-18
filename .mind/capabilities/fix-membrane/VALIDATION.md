# Fix Membrane — Validation

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
BEHAVIORS:       ./BEHAVIORS.md
ALGORITHM:       ./ALGORITHM.md
THIS:            VALIDATION.md (you are here)
IMPLEMENTATION:  ./IMPLEMENTATION.md
```

---

## PURPOSE

Invariants for valid membrane repair. When is the work done correctly?

---

## INVARIANTS

### V1: Procedures Directory Exists

```
INVARIANT: .mind/procedures/ directory exists

REQUIRED:
  - Directory exists
  - Directory is readable
  - Directory contains at least one .yaml file

CHECK: ls .mind/procedures/*.yaml | wc -l >= 1
```

### V2: All YAML Parses

```
INVARIANT: Every .yaml file in procedures/ parses without error

REQUIRED:
  - yaml.safe_load() succeeds
  - No syntax errors
  - No merge conflict markers

CHECK: for f in .mind/procedures/*.yaml; do python -c "import yaml; yaml.safe_load(open('$f'))"; done
```

### V3: Required Fields Present

```
INVARIANT: Every procedure has name and steps

REQUIRED:
  - 'name' field exists and is non-empty string
  - 'steps' field exists and is non-empty list

CHECK: Each parsed procedure has content['name'] and len(content['steps']) > 0
```

### V4: Steps Well-Formed

```
INVARIANT: Every step has id and action

REQUIRED:
  - Each step has 'id' (string)
  - Each step has 'action' or 'name' (string)
  - If 'params' present, must be dict

CHECK: All steps pass schema validation
```

### V5: No Duplicate IDs

```
INVARIANT: Step IDs unique within procedure

REQUIRED:
  - No two steps have same 'id' value
  - IDs are meaningful (not 'step_1', 'step_2')

CHECK: len(set(step_ids)) == len(step_ids)
```

---

## VALIDATION CHECKS

| Check | Pass Condition |
|-------|----------------|
| Directory exists | .mind/procedures/ readable |
| Files exist | At least one .yaml |
| YAML valid | All files parse |
| Fields present | name + steps in each |
| Steps valid | id + action in each step |
| No duplicates | Unique step IDs |

---

## ERROR MESSAGES

| Violation | Message |
|-----------|---------|
| No directory | `Procedures directory missing: .mind/procedures/` |
| No files | `No procedure files found in .mind/procedures/` |
| Parse error | `YAML parse error in {file} at line {line}: {error}` |
| Missing name | `Procedure {file} missing required field: name` |
| Missing steps | `Procedure {file} missing required field: steps` |
| Invalid step | `Step {index} in {file}: {issue}` |
| Duplicate ID | `Duplicate step ID '{id}' in {file}` |

---

## TASK COMPLETION CRITERIA

A task_run for membrane fix is **complete** when:

1. All procedure files parse without error
2. All procedures have required fields
3. All steps pass structure validation
4. No duplicate step IDs
5. Health check no longer detects problem

If any fail, task remains in_progress or escalates.
