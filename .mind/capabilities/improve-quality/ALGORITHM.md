# Improve Quality — Algorithm

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
THIS:            ALGORITHM.md (you are here)
VALIDATION:      ./VALIDATION.md
```

---

## PURPOSE

How improve-quality works — detection, resolution, validation.

---

## DETECTION ALGORITHMS

### Monolith Detection

```python
def check_monolith(file_path):
    """
    Detect files exceeding line threshold.
    Called by: init_scan, cron:daily, file_watch
    """
    THRESHOLD = 500
    CODE_EXTENSIONS = {'.py', '.ts', '.js', '.tsx', '.jsx', '.java', '.go', '.rs'}

    if not file_path.suffix in CODE_EXTENSIONS:
        return None

    lines = read_lines(file_path)

    # Count non-blank, non-comment lines
    effective_lines = [
        line for line in lines
        if line.strip() and not is_comment(line, file_path.suffix)
    ]

    if len(effective_lines) > THRESHOLD:
        return {
            "type": "MONOLITH",
            "target": file_path,
            "line_count": len(effective_lines),
            "severity": "high"
        }

    return None
```

### Magic Value Detection

```python
def check_magic_values(file_path):
    """
    Detect hardcoded literals that should be constants.
    Called by: init_scan, cron:daily
    """
    content = read_file(file_path)

    # Patterns to flag
    patterns = [
        r'\b\d{4,}\b',                    # Large numbers (4+ digits)
        r'(?<!=)\s*["\']https?://[^"\']+["\']',  # URLs
        r'(?<!=)\s*["\'][a-zA-Z]:\\[^"\']+["\']', # Windows paths
        r'(?<!=)\s*["\']/[a-z]+/[^"\']+["\']',    # Unix paths
        r'\b\d+\.\d+\.\d+\.\d+\b',        # IP addresses
    ]

    # Exceptions
    SAFE_NUMBERS = {'0', '1', '-1', '100', '1000'}

    findings = []
    for pattern in patterns:
        matches = re.findall(pattern, content)
        for match in matches:
            if match not in SAFE_NUMBERS:
                findings.append(match)

    if findings:
        return {
            "type": "MAGIC_VALUES",
            "target": file_path,
            "values": findings[:10],  # Limit to first 10
            "severity": "medium"
        }

    return None
```

### Secret Detection

```python
def check_secrets(file_path):
    """
    Detect potential secrets in code. CRITICAL priority.
    Called by: pre-commit, init_scan, cron:daily
    """
    content = read_file(file_path)

    # Secret patterns
    patterns = {
        'aws_key': r'AKIA[0-9A-Z]{16}',
        'openai_key': r'sk-[a-zA-Z0-9]{48}',
        'github_token': r'ghp_[a-zA-Z0-9]{36}',
        'password_assignment': r'password\s*=\s*["\'][^"\']+["\']',
        'token_assignment': r'token\s*=\s*["\'][^"\']{20,}["\']',
        'api_key_assignment': r'api_key\s*=\s*["\'][^"\']+["\']',
        'bearer_token': r'Bearer\s+[a-zA-Z0-9._-]+',
        'connection_string': r'://[^:]+:[^@]+@',  # user:pass@host
    }

    # Skip if in example/test
    if '.example' in str(file_path) or '_test' in str(file_path):
        return None

    findings = []
    for name, pattern in patterns.items():
        if re.search(pattern, content, re.IGNORECASE):
            findings.append(name)

    if findings:
        return {
            "type": "HARDCODED_SECRET",
            "target": file_path,
            "patterns_matched": findings,
            "severity": "critical"
        }

    return None
```

### Prompt Length Detection

```python
def check_prompt_length(file_path):
    """
    Detect prompts exceeding character threshold.
    Called by: init_scan, cron:daily
    """
    THRESHOLD = 4000

    content = read_file(file_path)

    # Find prompt variables
    prompt_patterns = [
        r'(?:SYSTEM_PROMPT|system_prompt|PROMPT)\s*=\s*["\'\"](.+?)["\'\"]',
        r'(?:prompt|message)\s*=\s*f?["\'\"](.+?)["\'\"]',
    ]

    for pattern in prompt_patterns:
        matches = re.findall(pattern, content, re.DOTALL)
        for match in matches:
            if len(match) > THRESHOLD:
                return {
                    "type": "LONG_PROMPT",
                    "target": file_path,
                    "char_count": len(match),
                    "severity": "medium"
                }

    return None
```

### SQL Complexity Detection

```python
def check_sql_complexity(file_path):
    """
    Detect overly complex SQL queries.
    Called by: init_scan, cron:daily
    """
    LENGTH_THRESHOLD = 1000
    JOIN_THRESHOLD = 5
    SUBQUERY_DEPTH_THRESHOLD = 2

    content = read_file(file_path)

    # Find SQL strings
    sql_pattern = r'(?:SELECT|INSERT|UPDATE|DELETE).+?(?:;|"""|\'\'\')'
    queries = re.findall(sql_pattern, content, re.IGNORECASE | re.DOTALL)

    for query in queries:
        issues = []

        # Check length
        if len(query) > LENGTH_THRESHOLD:
            issues.append(f"length={len(query)}")

        # Count JOINs
        join_count = len(re.findall(r'\bJOIN\b', query, re.IGNORECASE))
        if join_count > JOIN_THRESHOLD:
            issues.append(f"joins={join_count}")

        # Count subquery depth
        depth = query.count('SELECT') - 1
        if depth > SUBQUERY_DEPTH_THRESHOLD:
            issues.append(f"subquery_depth={depth}")

        if issues:
            return {
                "type": "LONG_SQL",
                "target": file_path,
                "issues": issues,
                "severity": "medium"
            }

    return None
```

### Naming Convention Detection

```python
def check_naming_convention(file_path):
    """
    Detect naming convention violations.
    Called by: init_scan, cron:weekly
    """
    extension = file_path.suffix
    filename = file_path.stem

    conventions = {
        '.py': {
            'file': r'^[a-z][a-z0-9_]*$',      # snake_case
            'class': r'^[A-Z][a-zA-Z0-9]*$',    # PascalCase
            'function': r'^[a-z][a-z0-9_]*$',   # snake_case
            'constant': r'^[A-Z][A-Z0-9_]*$',   # UPPER_SNAKE_CASE
        },
        '.ts': {
            'file': r'^[a-z][a-z0-9-]*$',       # kebab-case or camelCase
            'class': r'^[A-Z][a-zA-Z0-9]*$',    # PascalCase
            'function': r'^[a-z][a-zA-Z0-9]*$', # camelCase
        },
        '.js': {
            'file': r'^[a-z][a-z0-9-]*$',
            'class': r'^[A-Z][a-zA-Z0-9]*$',
            'function': r'^[a-z][a-zA-Z0-9]*$',
        },
    }

    if extension not in conventions:
        return None

    rules = conventions[extension]
    violations = []

    # Check filename
    if 'file' in rules:
        if not re.match(rules['file'], filename):
            violations.append(f"filename: {filename}")

    # Check internal names (requires parsing)
    content = read_file(file_path)

    # Class names
    if 'class' in rules:
        classes = re.findall(r'class\s+(\w+)', content)
        for cls in classes:
            if not re.match(rules['class'], cls):
                violations.append(f"class: {cls}")

    if violations:
        return {
            "type": "NAMING_CONVENTION",
            "target": file_path,
            "violations": violations[:5],
            "severity": "low"
        }

    return None
```

---

## TASK CREATION ALGORITHM

```python
def create_quality_task(problem):
    """
    Create task_run from detected quality problem.
    Called when: problem detected by health check
    """

    # Task mapping
    task_map = {
        "MONOLITH": "TASK_split_monolith",
        "MAGIC_VALUES": "TASK_extract_constants",
        "HARDCODED_SECRET": "TASK_extract_secrets",
        "LONG_PROMPT": "TASK_compress_prompt",
        "LONG_SQL": "TASK_refactor_sql",
        "NAMING_CONVENTION": "TASK_fix_naming",
    }

    # Nature mapping
    nature_map = {
        "critical": "urgently concerns",
        "high": "importantly concerns",
        "medium": "concerns",
        "low": "optionally concerns"
    }

    template = task_map[problem["type"]]
    nature = nature_map[problem["severity"]]

    task_run = create_node(
        node_type="narrative",
        type="task_run",
        nature=nature,
        content=f"""
        # Quality Fix: {problem['type']}

        Target: {problem['target']}
        Severity: {problem['severity']}
        Details: {problem}
        """,
        synthesis=f"Fix {problem['type']} in {problem['target']}"
    )

    create_link(task_run, template, nature="serves")
    create_link(task_run, problem["target"], nature="concerns")
    create_link(task_run, problem["type"], nature="resolves")

    return task_run
```

---

## RESOLUTION ALGORITHMS

### Script Resolution (MAGIC_VALUES, HARDCODED_SECRET, NAMING_CONVENTION)

```python
def script_resolve(problem):
    """
    Mechanically resolve problems that don't need judgment.
    """
    scripts = {
        "MAGIC_VALUES": extract_constants,
        "HARDCODED_SECRET": extract_secrets,
        "NAMING_CONVENTION": rename_to_convention,
    }

    script = scripts[problem["type"]]
    result = script(problem["target"], problem)

    # Validate
    recheck = detect_problem(problem["target"], problem["type"])

    return {
        "resolved": recheck is None,
        "changes": result
    }
```

### Agent Resolution (MONOLITH, LONG_PROMPT, LONG_SQL)

```python
def agent_resolve(problem, agent):
    """
    Agent-guided resolution for problems requiring judgment.
    """
    skill = load_skill("SKILL_refactor")

    session = start_procedure("PROCEDURE_refactor", {
        "target": problem["target"],
        "problem_type": problem["type"],
        "details": problem
    })

    for step in session.steps:
        result = agent.execute_step(step)
        session.complete_step(step, result)

    # Validate
    recheck = detect_problem(problem["target"], problem["type"])

    return {
        "resolved": recheck is None,
        "session": session
    }
```

---

## DECISION TREE

```
File detected
|
+-- Check all 6 problems
|   +-- HARDCODED_SECRET? -> critical -> script: extract_secrets
|   +-- MONOLITH? -> high -> agent: split
|   +-- MAGIC_VALUES? -> medium -> script: extract_constants
|   +-- LONG_PROMPT? -> medium -> agent: compress
|   +-- LONG_SQL? -> medium -> agent: refactor
|   +-- NAMING_CONVENTION? -> low -> script: rename
|
Task created
|
+-- Script-resolvable? (MAGIC_VALUES, SECRET, NAMING)
|   +-- Yes -> Run script -> Validate -> Complete/Retry
|   +-- No -> Await agent
|
Agent claims task
|
+-- Load skill
+-- Start procedure
+-- Execute steps with guidance
+-- Validate changes
+-- Complete/Escalate
```
