"""
Connectome Template Expansion

Expands {references} in connectome values using collected session data.
"""

import re
from typing import Any, Dict, Optional
from datetime import datetime


# Pattern for {reference} or {reference|filter}
TEMPLATE_PATTERN = re.compile(r'\{([^}|]+)(?:\|([^}]+))?\}')


def slugify(text: str) -> str:
    """Convert text to slug format."""
    # Lowercase
    text = text.lower()
    # Replace spaces and special chars with underscore
    text = re.sub(r'[^a-z0-9]+', '_', text)
    # Remove leading/trailing underscores
    text = text.strip('_')
    return text


def truncate(text: str, length: int = 100) -> str:
    """Truncate text to length."""
    if len(text) <= length:
        return text
    return text[:length - 3] + "..."


def count_items(value: Any) -> int:
    """Count items in a list or return 0."""
    if isinstance(value, list):
        return len(value)
    return 0


def format_list(value: Any) -> str:
    """Format a list as bullet points."""
    if not value:
        return "(none)"
    if isinstance(value, list):
        if not value:
            return "(none)"
        return "\n".join(f"- {item}" for item in value)
    return str(value)


def first_item(value: Any) -> Any:
    """Get first item from list."""
    if isinstance(value, list) and value:
        return value[0]
    return value


def format_value(value: Any) -> str:
    """Format a value for display."""
    if isinstance(value, dict):
        return str(value.get("name", value.get("id", value)))
    if isinstance(value, list):
        return ", ".join(str(v) for v in value[:5])
    return str(value) if value else "(none)"


# Available filters (simple ones - no arguments)
FILTERS = {
    "slugify": slugify,
    "lower": str.lower,
    "upper": str.upper,
    "truncate": lambda x: truncate(x, 100),
    "truncate50": lambda x: truncate(x, 50),
    "count": count_items,
    "format_list": format_list,
    "format": format_value,
    "first": first_item,
}


def expand_template(
    template: str,
    collected: Dict[str, Any],
    context: Dict[str, Any],
    extra: Optional[Dict[str, Any]] = None
) -> str:
    """
    Expand template string with references.

    Supports:
    - {step_id} — value from collected answers
    - {context_key} — value from query context
    - {context_key.field} — nested field access
    - {ref|filter} — apply filter to value
    - {ref|default(fallback)} — use fallback if ref is empty
    - {item} — current loop item (via extra)
    - {item.field} — loop item field access
    - {timestamp} — current timestamp
    - {actor_id}, {target_id} — special context values

    Args:
        template: String with {references}
        collected: Answers from ask steps
        context: Results from query steps
        extra: Additional values (item, actor_id, etc.)

    Returns:
        Expanded string
    """
    if not isinstance(template, str):
        return template

    extra = extra or {}

    def replace_match(match):
        ref = match.group(1)
        filter_expr = match.group(2)

        # Get value
        value = resolve_reference(ref, collected, context, extra)

        # Apply filter if specified
        if filter_expr:
            # Handle default(fallback) filter specially
            if filter_expr.startswith("default(") and filter_expr.endswith(")"):
                fallback_ref = filter_expr[8:-1].strip()  # Extract variable name
                if not value or (isinstance(value, str) and not value.strip()):
                    # Use fallback value - resolve as reference
                    value = resolve_reference(fallback_ref, collected, context, extra)
            elif filter_expr in FILTERS:
                try:
                    value = FILTERS[filter_expr](value if value is not None else "")
                except Exception:
                    pass

        return str(value) if value is not None else ""

    return TEMPLATE_PATTERN.sub(replace_match, template)


def resolve_reference(
    ref: str,
    collected: Dict[str, Any],
    context: Dict[str, Any],
    extra: Dict[str, Any]
) -> Any:
    """
    Resolve a single reference to its value.

    Args:
        ref: Reference string (e.g., "step_id", "context.field")
        collected: Answers from ask steps
        context: Results from query steps
        extra: Additional values

    Returns:
        Resolved value or None
    """
    # Special values
    if ref == "timestamp":
        return datetime.utcnow().strftime("%Y%m%d_%H%M%S")

    # Check extra first (item, actor_id, target_id)
    if ref in extra:
        return extra[ref]

    # Handle dot notation (context.field or item.field)
    if "." in ref:
        parts = ref.split(".", 1)
        base = parts[0]
        field = parts[1]

        # Try extra (item.field)
        if base in extra:
            obj = extra[base]
            return get_nested(obj, field)

        # Try context (store_as.field)
        if base in context:
            obj = context[base]
            return get_nested(obj, field)

        # Try collected (shouldn't have dots, but just in case)
        if base in collected:
            obj = collected[base]
            return get_nested(obj, field)

    # Try collected (step answers)
    if ref in collected:
        return collected[ref]

    # Try context (query results)
    if ref in context:
        return context[ref]

    return None


def get_nested(obj: Any, path: str) -> Any:
    """
    Get nested value from object using dot path.

    Args:
        obj: Object (dict or has attributes)
        path: Dot-separated path (e.g., "field.subfield")

    Returns:
        Nested value or None
    """
    parts = path.split(".")

    for part in parts:
        if obj is None:
            return None

        if isinstance(obj, dict):
            obj = obj.get(part)
        elif isinstance(obj, list):
            # Try numeric index
            try:
                idx = int(part)
                obj = obj[idx] if idx < len(obj) else None
            except ValueError:
                # Not an index, try getting field from first item
                if obj and isinstance(obj[0], dict):
                    obj = obj[0].get(part)
                else:
                    return None
        elif hasattr(obj, part):
            obj = getattr(obj, part)
        else:
            return None

    return obj


def expand_dict(
    template_dict: Dict[str, Any],
    collected: Dict[str, Any],
    context: Dict[str, Any],
    extra: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Recursively expand all template strings in a dict.

    Args:
        template_dict: Dict with template strings
        collected: Answers from ask steps
        context: Results from query steps
        extra: Additional values

    Returns:
        Dict with expanded values
    """
    result = {}

    for key, value in template_dict.items():
        if isinstance(value, str):
            result[key] = expand_template(value, collected, context, extra)
        elif isinstance(value, dict):
            result[key] = expand_dict(value, collected, context, extra)
        elif isinstance(value, list):
            result[key] = [
                expand_dict(item, collected, context, extra) if isinstance(item, dict)
                else expand_template(item, collected, context, extra) if isinstance(item, str)
                else item
                for item in value
            ]
        else:
            result[key] = value

    return result
