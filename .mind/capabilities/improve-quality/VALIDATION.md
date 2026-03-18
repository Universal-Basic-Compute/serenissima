# Improve Quality — Validation

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
BEHAVIORS:       ./BEHAVIORS.md
ALGORITHM:       ./ALGORITHM.md
THIS:            VALIDATION.md (you are here)
IMPLEMENTATION:  ./IMPLEMENTATION.md
```

---

## PURPOSE

Invariants for valid quality improvement. When is the fix correct?

---

## INVARIANTS

### V1: No Secrets in Code

```
INVARIANT: Code files contain no hardcoded secrets

FORBIDDEN:
  - API key patterns (sk-*, AKIA*, ghp_*)
  - Password assignments (password = "...")
  - Token assignments (token = "...")
  - Connection strings with credentials

CHECK: secret_scanner returns empty for all code files
```

### V2: No Monoliths

```
INVARIANT: No code file exceeds 500 lines

THRESHOLD: 500 effective lines (excluding comments/blanks)

CHECK: wc -l for all code files < 500
```

### V3: No Magic Values (Threshold)

```
INVARIANT: Magic values below threshold per file

ALLOWED:
  - 0, 1, -1, 100, 1000 (common safe values)
  - Values in constant definitions
  - Values in test fixtures

THRESHOLD: < 3 suspicious literals per file

CHECK: magic_value_scanner returns < 3 per file
```

### V4: Prompts Under Limit

```
INVARIANT: Prompt strings under 4000 characters

THRESHOLD: 4000 characters

CHECK: prompt_scanner finds no prompts > 4000 chars
```

### V5: SQL Under Complexity Limit

```
INVARIANT: SQL queries under complexity threshold

THRESHOLDS:
  - Length < 1000 characters
  - Joins < 6
  - Subquery depth < 3

CHECK: sql_scanner finds no queries exceeding thresholds
```

### V6: Names Follow Convention

```
INVARIANT: All names follow language-specific conventions

PYTHON:
  - Files: snake_case.py
  - Classes: PascalCase
  - Functions: snake_case
  - Constants: UPPER_SNAKE_CASE

TYPESCRIPT/JAVASCRIPT:
  - Files: kebab-case.ts or camelCase.ts
  - Classes: PascalCase
  - Functions: camelCase

CHECK: naming_scanner returns empty for all files
```

### V7: Behavior Preserved

```
INVARIANT: Refactoring does not change behavior

REQUIRED:
  - All tests pass before refactor
  - All tests pass after refactor
  - No new test failures

CHECK: test suite passes before and after
```

### V8: Split Files Import Correctly

```
INVARIANT: When monolith split, imports updated correctly

REQUIRED:
  - All imports resolve
  - No circular imports created
  - Exported symbols still accessible

CHECK: import resolution passes, no ImportError
```

---

## VALIDATION CHECKS

| Check | Pass Condition |
|-------|----------------|
| No secrets | scanner returns empty |
| No monoliths | all files < 500 lines |
| Magic values | < 3 per file |
| Prompt length | all prompts < 4000 chars |
| SQL complexity | under all thresholds |
| Naming | all names match convention |
| Behavior | tests pass |
| Imports | no ImportError |

---

## ERROR MESSAGES

| Violation | Message |
|-----------|---------|
| Secret found | `CRITICAL: Secret detected in {file}: {pattern}` |
| Monolith | `File {file} has {count} lines, exceeds 500` |
| Magic value | `Magic value {value} in {file}:{line}` |
| Long prompt | `Prompt in {file} is {count} chars, exceeds 4000` |
| Complex SQL | `SQL in {file} exceeds threshold: {issues}` |
| Bad naming | `Naming violation in {file}: {name} should be {expected}` |
| Test failure | `Test {test} failed after refactor` |
| Import error | `Import failed after split: {error}` |

---

## TASK COMPLETION CRITERIA

### TASK_split_monolith Complete When:

1. Original file < 500 lines OR deleted
2. New files each < 500 lines
3. All imports resolve
4. Tests pass
5. Health check no longer detects MONOLITH

### TASK_extract_constants Complete When:

1. Magic values extracted to constants file
2. All occurrences replaced with constant reference
3. Tests pass
4. < 3 magic values remain in file

### TASK_extract_secrets Complete When:

1. Secret removed from code
2. Environment variable read in place
3. .env.example updated with placeholder
4. Secret rotated if committed
5. Health check no longer detects HARDCODED_SECRET

### TASK_compress_prompt Complete When:

1. Prompt under 4000 characters
2. Prompt still achieves its purpose
3. Health check no longer detects LONG_PROMPT

### TASK_refactor_sql Complete When:

1. Query under complexity thresholds
2. Views/CTEs created as needed
3. Query returns same results
4. Health check no longer detects LONG_SQL

### TASK_fix_naming Complete When:

1. Name follows convention
2. All references updated
3. No broken imports
4. Health check no longer detects NAMING_CONVENTION
