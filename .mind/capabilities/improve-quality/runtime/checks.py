# DOCS: capabilities/improve-quality/HEALTH.md
"""
Improve Quality Health Checks

Detection functions for code quality issues:
- MONOLITH: Files exceeding 500 lines
- HARDCODED_SECRET: Secrets in code
- MAGIC_VALUES: Hardcoded literals
- LONG_PROMPT: Prompts exceeding 4000 chars
- LONG_SQL: Complex SQL queries
- NAMING_CONVENTION: Naming violations
"""

import re
from pathlib import Path
from typing import Optional

# Placeholder imports - actual implementation depends on mind framework
# from runtime.capability import check, Signal, triggers


# Configuration thresholds
MONOLITH_THRESHOLD = 500
MONOLITH_CRITICAL_THRESHOLD = 1000
MAGIC_VALUE_THRESHOLD = 3
PROMPT_LENGTH_THRESHOLD = 4000
SQL_LENGTH_THRESHOLD = 1000
SQL_JOIN_THRESHOLD = 5
SQL_SUBQUERY_THRESHOLD = 2

CODE_EXTENSIONS = {".py", ".ts", ".js", ".tsx", ".jsx", ".java", ".go", ".rs"}
SAFE_NUMBERS = {"0", "1", "-1", "100", "1000"}


def count_effective_lines(file_path: Path) -> int:
    """Count non-blank, non-comment lines."""
    try:
        content = file_path.read_text()
    except Exception:
        return 0

    lines = content.split("\n")
    count = 0

    in_multiline_comment = False
    for line in lines:
        stripped = line.strip()

        # Skip blank lines
        if not stripped:
            continue

        # Handle Python multiline strings as comments
        if '"""' in stripped or "'''" in stripped:
            in_multiline_comment = not in_multiline_comment
            continue

        if in_multiline_comment:
            continue

        # Skip single-line comments
        if stripped.startswith("#"):  # Python
            continue
        if stripped.startswith("//"):  # JS/TS/Go/Rust
            continue

        count += 1

    return count


def scan_for_secrets(file_path: Path) -> list[str]:
    """Scan file for hardcoded secrets."""
    try:
        content = file_path.read_text()
    except Exception:
        return []

    # Skip example and test files
    name = file_path.name.lower()
    if ".example" in name or "_test" in name or "test_" in name:
        return []

    patterns = {
        "aws_key": r"AKIA[0-9A-Z]{16}",
        "openai_key": r"sk-[a-zA-Z0-9]{20,}",
        "github_token": r"ghp_[a-zA-Z0-9]{36}",
        "password_assignment": r'password\s*=\s*["\'][^"\']+["\']',
        "token_assignment": r'token\s*=\s*["\'][^"\']{20,}["\']',
        "api_key_assignment": r'api_key\s*=\s*["\'][^"\']+["\']',
        "bearer_token": r"Bearer\s+[a-zA-Z0-9._-]{20,}",
        "connection_string": r"://[^:]+:[^@]+@",
    }

    findings = []
    for name, pattern in patterns.items():
        if re.search(pattern, content, re.IGNORECASE):
            findings.append(name)

    return findings


def scan_for_magic_values(file_path: Path) -> list[str]:
    """Scan file for hardcoded magic values."""
    try:
        content = file_path.read_text()
    except Exception:
        return []

    findings = []

    # Large numbers (4+ digits, not in common safe values)
    for match in re.finditer(r"\b(\d{4,})\b", content):
        value = match.group(1)
        if value not in SAFE_NUMBERS:
            findings.append(value)

    # IP addresses
    for match in re.finditer(r"\b(\d+\.\d+\.\d+\.\d+)\b", content):
        findings.append(match.group(1))

    return findings[:10]  # Limit to first 10


def scan_for_long_prompts(file_path: Path) -> Optional[int]:
    """Find prompts exceeding threshold."""
    try:
        content = file_path.read_text()
    except Exception:
        return None

    # Look for prompt variable assignments
    patterns = [
        r'(?:SYSTEM_PROMPT|system_prompt|PROMPT)\s*=\s*["\'\"](.+?)["\'\"]',
        r'(?:prompt|message)\s*=\s*f?["\'\"](.+?)["\'\"]',
    ]

    for pattern in patterns:
        for match in re.finditer(pattern, content, re.DOTALL):
            prompt_content = match.group(1)
            if len(prompt_content) > PROMPT_LENGTH_THRESHOLD:
                return len(prompt_content)

    return None


def scan_for_complex_sql(file_path: Path) -> Optional[dict]:
    """Find SQL queries exceeding complexity thresholds."""
    try:
        content = file_path.read_text()
    except Exception:
        return None

    # Look for SQL queries
    sql_pattern = r'(?:SELECT|INSERT|UPDATE|DELETE)[^;]+?(?:;|"""|\'\'\')'
    queries = re.findall(sql_pattern, content, re.IGNORECASE | re.DOTALL)

    for query in queries:
        issues = []

        # Check length
        if len(query) > SQL_LENGTH_THRESHOLD:
            issues.append(f"length={len(query)}")

        # Count JOINs
        join_count = len(re.findall(r"\bJOIN\b", query, re.IGNORECASE))
        if join_count > SQL_JOIN_THRESHOLD:
            issues.append(f"joins={join_count}")

        # Count subquery depth
        select_count = len(re.findall(r"\bSELECT\b", query, re.IGNORECASE))
        depth = select_count - 1
        if depth > SQL_SUBQUERY_THRESHOLD:
            issues.append(f"subquery_depth={depth}")

        if issues:
            return {"issues": issues}

    return None


def check_naming_convention(file_path: Path) -> list[str]:
    """Check file and content names against conventions."""
    violations = []
    extension = file_path.suffix
    filename = file_path.stem

    conventions = {
        ".py": {
            "file": r"^[a-z][a-z0-9_]*$",
            "class": r"^[A-Z][a-zA-Z0-9]*$",
        },
        ".ts": {
            "file": r"^[a-z][a-z0-9-]*$",
            "class": r"^[A-Z][a-zA-Z0-9]*$",
        },
        ".js": {
            "file": r"^[a-z][a-z0-9-]*$",
            "class": r"^[A-Z][a-zA-Z0-9]*$",
        },
    }

    if extension not in conventions:
        return []

    rules = conventions[extension]

    # Check filename
    if "file" in rules:
        if not re.match(rules["file"], filename):
            violations.append(f"filename: {filename}")

    # Check class names in content
    try:
        content = file_path.read_text()
    except Exception:
        return violations

    if "class" in rules:
        classes = re.findall(r"class\s+(\w+)", content)
        for cls in classes:
            if not re.match(rules["class"], cls):
                violations.append(f"class: {cls}")

    return violations[:5]  # Limit to first 5


# Check function stubs - actual implementation uses @check decorator
# These are placeholders showing the interface


def monolith_detection(ctx) -> dict:
    """H1: Check if file exceeds line threshold."""
    file_path = Path(ctx.file_path)

    if file_path.suffix not in CODE_EXTENSIONS:
        return {"status": "healthy"}

    line_count = count_effective_lines(file_path)

    if line_count <= MONOLITH_THRESHOLD:
        return {"status": "healthy"}
    if line_count > MONOLITH_CRITICAL_THRESHOLD:
        return {"status": "critical", "line_count": line_count}
    return {"status": "degraded", "line_count": line_count}


def secret_detection(ctx) -> dict:
    """H2: Check for hardcoded secrets. CRITICAL."""
    file_path = Path(ctx.file_path)
    secrets = scan_for_secrets(file_path)

    if not secrets:
        return {"status": "healthy"}
    return {"status": "critical", "patterns": secrets}


def magic_value_detection(ctx) -> dict:
    """H3: Check for magic values."""
    file_path = Path(ctx.file_path)
    values = scan_for_magic_values(file_path)

    if len(values) < MAGIC_VALUE_THRESHOLD:
        return {"status": "healthy"}
    return {"status": "degraded", "values": values}


def prompt_length_detection(ctx) -> dict:
    """H4: Check for long prompts."""
    file_path = Path(ctx.file_path)
    char_count = scan_for_long_prompts(file_path)

    if char_count is None:
        return {"status": "healthy"}
    return {"status": "degraded", "char_count": char_count}


def sql_complexity_detection(ctx) -> dict:
    """H5: Check for complex SQL."""
    file_path = Path(ctx.file_path)
    result = scan_for_complex_sql(file_path)

    if result is None:
        return {"status": "healthy"}
    return {"status": "degraded", "issues": result["issues"]}


def naming_convention_detection(ctx) -> dict:
    """H6: Check for naming violations."""
    file_path = Path(ctx.file_path)
    violations = check_naming_convention(file_path)

    if not violations:
        return {"status": "healthy"}
    return {"status": "degraded", "violations": violations}
