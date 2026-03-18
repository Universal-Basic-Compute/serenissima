# Improve Quality — Vocabulary

```
STATUS: CANONICAL
CAPABILITY: improve-quality
```

---

## CHAIN

```
OBJECTIVES:      ./OBJECTIVES.md
PATTERNS:        ./PATTERNS.md
THIS:            VOCABULARY.md (you are here)
BEHAVIORS:       ./BEHAVIORS.md
ALGORITHM:       ./ALGORITHM.md
```

---

## PURPOSE

Terms and problems owned by this capability.

---

## TERMS

### monolith

A code file that has grown too large (>500 lines), accumulating multiple responsibilities and becoming difficult to navigate and maintain.

### magic value

A hardcoded numeric or string literal in code without explanation. Examples: `86400`, `"localhost"`, `0.5`. Should be extracted to named constants.

### secret

Any credential, API key, password, token, or sensitive data that must not appear in source code. Must be stored in environment variables or secrets manager.

### prompt bloat

When a system prompt exceeds 4000 characters, becoming expensive, slow, and risk of hitting context limits.

### sql complexity

A SQL query that has grown too large or has too many joins, becoming difficult to understand and maintain.

### naming convention

Project-specific rules for naming files, classes, functions, and variables. Consistency aids navigation.

---

## PROBLEMS

### PROBLEM: MONOLITH

```yaml
id: MONOLITH
severity: high
category: quality

definition: |
  A code file exceeds 500 lines, indicating it likely has too many
  responsibilities and should be split into smaller, focused modules.

detection:
  - Count lines in code file
  - Threshold: 500 lines
  - Exclude comments and blank lines in counting

resolves_with: TASK_split_monolith

examples:
  - "src/utils.py has grown to 800 lines"
  - "lib/auth.ts contains login, signup, password reset, and session management"
  - "Single file handling API, database, and validation logic"
```

### PROBLEM: MAGIC_VALUES

```yaml
id: MAGIC_VALUES
severity: medium
category: quality

definition: |
  Code contains hardcoded numeric or string literals that should be
  named constants. Values like 86400, "localhost", or 0.5 appear without
  explanation.

detection:
  - Pattern match for suspicious literals
  - Numeric literals not 0, 1, -1, or 100
  - String literals that look like config (URLs, paths, keys)
  - Exclude string literals in logs/messages

resolves_with: TASK_extract_constants

examples:
  - "time.sleep(86400) instead of time.sleep(SECONDS_PER_DAY)"
  - "max_retries = 3 instead of MAX_RETRIES constant"
  - "url = 'http://localhost:8080' hardcoded"
```

### PROBLEM: HARDCODED_SECRET

```yaml
id: HARDCODED_SECRET
severity: critical
category: quality

definition: |
  Code contains what appears to be a secret: API key, password, token,
  or credential embedded in source code.

detection:
  - Pattern match for secret formats
  - API key patterns: sk-*, AKIA*, etc.
  - Password assignments: password = "..."
  - Token patterns: Bearer, JWT structures
  - Connection strings with credentials

resolves_with: TASK_extract_secrets

examples:
  - "api_key = 'sk-proj-abc123...'"
  - "password = 'hunter2'"
  - "db_url = 'postgres://user:pass@host/db'"
  - "Authorization: Bearer eyJ..."
```

### PROBLEM: LONG_PROMPT

```yaml
id: LONG_PROMPT
severity: medium
category: quality

definition: |
  A prompt or system message exceeds 4000 characters, making it expensive
  and potentially hitting context limits. Should be compressed or split.

detection:
  - Find prompt strings in code (system_prompt, PROMPT, etc.)
  - Count characters
  - Threshold: 4000 characters

resolves_with: TASK_compress_prompt

examples:
  - "System prompt with 6000 characters of instructions"
  - "Prompt template accumulated redundant explanations"
  - "Single prompt doing work of multiple specialized prompts"
```

### PROBLEM: LONG_SQL

```yaml
id: LONG_SQL
severity: medium
category: quality

definition: |
  A SQL query exceeds complexity threshold (length or join count),
  indicating it should be refactored into views or smaller queries.

detection:
  - Find SQL strings in code
  - Measure: character count > 1000 OR join count > 5
  - Check for nested subqueries depth > 2

resolves_with: TASK_refactor_sql

examples:
  - "Query with 8 JOINs and 3 nested subqueries"
  - "2000-character query built by string concatenation"
  - "Single query handling multiple unrelated concerns"
```

### PROBLEM: NAMING_CONVENTION

```yaml
id: NAMING_CONVENTION
severity: low
category: quality

definition: |
  A file, class, function, or variable doesn't follow the project's
  naming conventions. Inconsistent naming hurts readability.

detection:
  - Load project naming conventions
  - Check file names match pattern (snake_case.py, PascalCase.ts)
  - Check class names match pattern (PascalCase)
  - Check function names match pattern (snake_case or camelCase)
  - Check constant names match pattern (UPPER_SNAKE_CASE)

resolves_with: TASK_fix_naming

examples:
  - "Python file named getUserData.py instead of get_user_data.py"
  - "Class named user_manager instead of UserManager"
  - "Constant named maxRetries instead of MAX_RETRIES"
```

---

## USAGE

```yaml
# In HEALTH.md
on_problem:
  problem_id: MONOLITH
  creates:
    node:
      node_type: narrative
      type: task_run
      nature: "importantly concerns"
    links:
      - nature: "serves"
        to: TASK_split_monolith
      - nature: "resolves"
        to: MONOLITH
```
