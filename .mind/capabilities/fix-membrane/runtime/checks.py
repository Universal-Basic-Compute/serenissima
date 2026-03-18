# Fix Membrane Health Checks
# DOCS: capabilities/fix-membrane/HEALTH.md

"""
Health checks for membrane integrity.
Detects problems with procedure YAML files.
"""

import yaml
from pathlib import Path
from typing import Any

# Placeholder for actual imports from mind.capability
# from runtime.capability import check, Signal, triggers


class Signal:
    """Health signal representation."""

    @staticmethod
    def healthy(**kwargs) -> dict:
        return {"status": "healthy", **kwargs}

    @staticmethod
    def degraded(**kwargs) -> dict:
        return {"status": "degraded", **kwargs}

    @staticmethod
    def critical(**kwargs) -> dict:
        return {"status": "critical", **kwargs}


def check(id: str, triggers: list, on_problem: str, task: str):
    """Decorator for health checks (placeholder)."""
    def decorator(func):
        func.check_id = id
        func.triggers = triggers
        func.on_problem = on_problem
        func.task = task
        return func
    return decorator


# H1: Procedures Exist
# @check(
#     id="procedures_exist",
#     triggers=[
#         triggers.init.after_scan(),
#         triggers.cron.daily(),
#     ],
#     on_problem="MEMBRANE_NO_PROTOCOLS",
#     task="TASK_create_procedures",
# )
def procedures_exist(ctx: Any) -> dict:
    """
    H1: Check if procedures directory has files.

    Returns critical if:
    - procedures directory doesn't exist
    - no .yaml files in procedures directory
    """
    mind_dir = Path(ctx.get('mind_dir', '.mind'))
    procedures_dir = mind_dir / "procedures"

    if not procedures_dir.exists():
        return Signal.critical(reason="procedures directory missing")

    yaml_files = list(procedures_dir.glob("*.yaml"))

    if not yaml_files:
        return Signal.critical(reason="no procedure files found")

    return Signal.healthy(count=len(yaml_files))


# H2: YAML Validity
# @check(
#     id="yaml_valid",
#     triggers=[
#         triggers.file.on_change(".mind/procedures/*.yaml"),
#         triggers.init.after_scan(),
#     ],
#     on_problem="MEMBRANE_PARSE_ERROR",
#     task="TASK_fix_yaml_syntax",
# )
def yaml_valid(ctx: Any) -> dict:
    """
    H2: Check all procedure files parse.

    Returns critical if any file has YAML syntax errors.
    Includes file path, line number, and error message.
    """
    mind_dir = Path(ctx.get('mind_dir', '.mind'))
    procedures_dir = mind_dir / "procedures"

    if not procedures_dir.exists():
        return Signal.healthy()  # H1 will catch this

    errors = []

    for path in procedures_dir.glob("*.yaml"):
        try:
            with open(path) as f:
                yaml.safe_load(f)
        except yaml.YAMLError as e:
            line = None
            if hasattr(e, 'problem_mark') and e.problem_mark:
                line = e.problem_mark.line

            errors.append({
                "file": str(path),
                "error": str(e),
                "line": line
            })

    if errors:
        return Signal.critical(errors=errors)

    return Signal.healthy()


# H3: Steps Valid
# @check(
#     id="steps_valid",
#     triggers=[
#         triggers.file.on_change(".mind/procedures/*.yaml"),
#         triggers.init.after_scan(),
#     ],
#     on_problem="MEMBRANE_INVALID_STEP",
#     task="TASK_fix_step_structure",
# )
def steps_valid(ctx: Any) -> dict:
    """
    H3: Check all procedure steps are well-formed.

    Each step must have:
    - 'id' field (string)
    - 'action' or 'name' field (string)
    - 'params' must be dict if present
    """
    mind_dir = Path(ctx.get('mind_dir', '.mind'))
    procedures_dir = mind_dir / "procedures"

    if not procedures_dir.exists():
        return Signal.healthy()

    issues = []

    for path in procedures_dir.glob("*.yaml"):
        try:
            with open(path) as f:
                content = yaml.safe_load(f)
        except yaml.YAMLError:
            continue  # H2 will catch this

        if not content or 'steps' not in content:
            continue  # H4 will catch this

        steps = content.get('steps', [])
        if not isinstance(steps, list):
            continue

        for i, step in enumerate(steps):
            if not isinstance(step, dict):
                issues.append({
                    "file": str(path),
                    "step_index": i,
                    "issue": "step is not a dict"
                })
                continue

            if 'id' not in step:
                issues.append({
                    "file": str(path),
                    "step_index": i,
                    "issue": "missing 'id' field"
                })

            if 'action' not in step and 'name' not in step:
                issues.append({
                    "file": str(path),
                    "step_index": i,
                    "issue": "missing 'action' or 'name' field"
                })

            if 'params' in step and not isinstance(step['params'], dict):
                issues.append({
                    "file": str(path),
                    "step_index": i,
                    "issue": f"'params' should be dict, got {type(step['params']).__name__}"
                })

    if issues:
        return Signal.degraded(issues=issues)

    return Signal.healthy()


# H4: Fields Complete
# @check(
#     id="fields_complete",
#     triggers=[
#         triggers.file.on_change(".mind/procedures/*.yaml"),
#         triggers.init.after_scan(),
#     ],
#     on_problem="MEMBRANE_MISSING_FIELDS",
#     task="TASK_add_missing_fields",
# )
def fields_complete(ctx: Any) -> dict:
    """
    H4: Check all procedures have required fields.

    Required fields:
    - 'name' (string, non-empty)
    - 'steps' (list, non-empty)
    """
    mind_dir = Path(ctx.get('mind_dir', '.mind'))
    procedures_dir = mind_dir / "procedures"

    if not procedures_dir.exists():
        return Signal.healthy()

    missing = []

    for path in procedures_dir.glob("*.yaml"):
        try:
            with open(path) as f:
                content = yaml.safe_load(f)
        except yaml.YAMLError:
            continue  # H2 will catch this

        if not content:
            missing.append({
                "file": str(path),
                "missing_fields": ["name", "steps"]
            })
            continue

        file_missing = []

        if 'name' not in content or not content['name']:
            file_missing.append('name')

        if 'steps' not in content:
            file_missing.append('steps')
        elif not content['steps']:
            file_missing.append('steps (empty)')

        if file_missing:
            missing.append({
                "file": str(path),
                "missing_fields": file_missing
            })

    if missing:
        return Signal.degraded(missing=missing)

    return Signal.healthy()
