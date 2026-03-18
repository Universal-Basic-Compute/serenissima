"""
Connectome Input Validation

Validates answers against expects specifications.
"""

import re
from typing import Any, Dict, List, Optional, Tuple


class ValidationError(Exception):
    """Raised when input validation fails."""

    def __init__(self, message: str, expected: str = None):
        self.message = message
        self.expected = expected
        super().__init__(message)


def validate_input(value: Any, expects: Dict[str, Any]) -> Tuple[bool, Optional[str]]:
    """
    Validate input value against expects specification.

    Args:
        value: The input value to validate
        expects: The expects specification from step config

    Returns:
        (is_valid, error_message)
    """
    expect_type = expects.get("type", "string")

    validators = {
        "string": validate_string,
        "enum": validate_enum,
        "number": validate_number,
        "boolean": validate_boolean,
        "id": validate_id,
        "reference": validate_id,  # Alias for id - node reference
        "id_list": validate_id_list,
        "string_list": validate_string_list,
    }

    validator = validators.get(expect_type)
    if not validator:
        return False, f"Unknown expects type: {expect_type}"

    return validator(value, expects)


def validate_string(value: Any, expects: Dict[str, Any]) -> Tuple[bool, Optional[str]]:
    """Validate string input."""
    if not isinstance(value, str):
        return False, f"Expected string, got {type(value).__name__}"

    min_len = expects.get("min_length", 0)
    max_len = expects.get("max_length", float("inf"))
    pattern = expects.get("pattern")

    if len(value) < min_len:
        return False, f"String too short (min {min_len} chars)"

    if len(value) > max_len:
        return False, f"String too long (max {max_len} chars)"

    if pattern:
        if not re.match(pattern, value):
            return False, f"String must match pattern: {pattern}"

    return True, None


def validate_enum(value: Any, expects: Dict[str, Any]) -> Tuple[bool, Optional[str]]:
    """Validate enum input."""
    options = expects.get("options", [])

    if value not in options:
        return False, f"Must be one of: {', '.join(str(o) for o in options)}"

    return True, None


def validate_number(value: Any, expects: Dict[str, Any]) -> Tuple[bool, Optional[str]]:
    """Validate number input."""
    if not isinstance(value, (int, float)):
        # Try to convert string
        try:
            value = float(value)
        except (ValueError, TypeError):
            return False, f"Expected number, got {type(value).__name__}"

    min_val = expects.get("min")
    max_val = expects.get("max")

    if min_val is not None and value < min_val:
        return False, f"Number must be >= {min_val}"

    if max_val is not None and value > max_val:
        return False, f"Number must be <= {max_val}"

    return True, None


def validate_boolean(value: Any, expects: Dict[str, Any]) -> Tuple[bool, Optional[str]]:
    """Validate boolean input."""
    if isinstance(value, bool):
        return True, None

    if isinstance(value, str):
        if value.lower() in ("true", "yes", "1"):
            return True, None
        if value.lower() in ("false", "no", "0"):
            return True, None

    return False, f"Expected boolean, got {value}"


def validate_id(value: Any, expects: Dict[str, Any]) -> Tuple[bool, Optional[str]]:
    """Validate single node ID reference."""
    if not isinstance(value, str):
        return False, f"Expected node ID string, got {type(value).__name__}"

    if not value:
        return False, "Node ID cannot be empty"

    # Node type validation happens at graph query time
    return True, None


def validate_id_list(value: Any, expects: Dict[str, Any]) -> Tuple[bool, Optional[str]]:
    """Validate list of node IDs."""
    if not isinstance(value, list):
        # Allow single ID as list of one
        if isinstance(value, str):
            value = [value]
        else:
            return False, f"Expected list of node IDs, got {type(value).__name__}"

    min_count = expects.get("min", 0)
    max_count = expects.get("max", float("inf"))

    if len(value) < min_count:
        return False, f"Need at least {min_count} items"

    if len(value) > max_count:
        return False, f"Too many items (max {max_count})"

    # Validate each ID is a string
    for i, item in enumerate(value):
        if not isinstance(item, str):
            return False, f"Item {i} is not a valid ID string"

    return True, None


def validate_string_list(value: Any, expects: Dict[str, Any]) -> Tuple[bool, Optional[str]]:
    """Validate list of strings."""
    if not isinstance(value, list):
        if isinstance(value, str):
            # Allow single string as list of one
            value = [value]
        else:
            return False, f"Expected list of strings, got {type(value).__name__}"

    min_count = expects.get("min", 0)
    max_count = expects.get("max", float("inf"))

    if len(value) < min_count:
        return False, f"Need at least {min_count} items"

    if len(value) > max_count:
        return False, f"Too many items (max {max_count})"

    for i, item in enumerate(value):
        if not isinstance(item, str):
            return False, f"Item {i} is not a string"

    return True, None


def coerce_value(value: Any, expects: Dict[str, Any]) -> Any:
    """
    Coerce value to expected type if possible.

    Args:
        value: Raw input value
        expects: Expects specification

    Returns:
        Coerced value
    """
    expect_type = expects.get("type", "string")

    if expect_type == "boolean":
        if isinstance(value, str):
            if value.lower() in ("true", "yes", "1"):
                return True
            if value.lower() in ("false", "no", "0"):
                return False
        return bool(value)

    if expect_type == "number":
        if isinstance(value, str):
            try:
                if "." in value:
                    return float(value)
                return int(value)
            except ValueError:
                return value
        return value

    if expect_type in ("id_list", "string_list"):
        if isinstance(value, str):
            return [value]
        return value

    return value
