"""
Mind Graph Schema Validation

Validates nodes and links against the canonical schema defined in:
  docs/schema/schema.yaml (v1.2)

This module provides runtime validation - the YAML is the source of truth.

Key constraints:
1. All fields must match schema (type, required, ranges)
2. New clusters MUST have at least one connection to existing nodes
3. Errors returned with guidance

DOCS: docs/membrane/IMPLEMENTATION_Membrane_System.md

Usage:
    from runtime.connectome.schema import validate_node, validate_link, SchemaError

    try:
        validate_node(node_data)
    except SchemaError as e:
        print(e.guidance)  # Helpful fix instructions
"""

import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Set
from enum import Enum


# =============================================================================
# SCHEMA ERROR WITH GUIDANCE
# =============================================================================

class SchemaError(Exception):
    """
    Schema validation error with helpful guidance.

    Attributes:
        message: What went wrong
        field: Which field failed (if applicable)
        guidance: How to fix it
        examples: Good and bad examples
    """

    def __init__(
        self,
        message: str,
        field: Optional[str] = None,
        guidance: str = "",
        examples: Optional[Dict[str, str]] = None,
    ):
        self.message = message
        self.field = field
        self.guidance = guidance
        self.examples = examples or {}
        super().__init__(self.format())

    def format(self) -> str:
        parts = [f"SCHEMA ERROR: {self.message}"]
        if self.field:
            parts.append(f"  Field: {self.field}")
        if self.guidance:
            parts.append(f"\n  HOW TO FIX: {self.guidance}")
        if self.examples:
            parts.append("\n  EXAMPLES:")
            if "good" in self.examples:
                parts.append(f"    ✓ Good: {self.examples['good']}")
            if "bad" in self.examples:
                parts.append(f"    ✗ Bad: {self.examples['bad']}")
        return "\n".join(parts)


class ConnectivityError(SchemaError):
    """Raised when new nodes aren't connected to existing graph."""

    def __init__(
        self,
        message: str,
        field: Optional[str] = None,
        guidance: str = "",
        examples: Optional[Dict[str, str]] = None,
        new_nodes: Optional[List[str]] = None,
    ):
        self.new_nodes = new_nodes or []
        super().__init__(message, field, guidance, examples)

    def format(self) -> str:
        base = super().format()
        if self.new_nodes:
            base += f"\n  Orphan nodes: {', '.join(self.new_nodes)}"
        return base


# =============================================================================
# CANONICAL SCHEMA (from docs/schema/schema.yaml v1.2)
# =============================================================================

# Node types (canonical - DO NOT MODIFY)
NODE_TYPES = ["actor", "space", "thing", "narrative", "moment"]

# Link types (canonical - DO NOT MODIFY)
LINK_TYPES = [
    "contains", "leads_to", "expresses", "sequence",
    "primes", "can_become", "relates", "about", "attached_to"
]

# NodeBase fields (all nodes share these)
NODE_BASE_FIELDS = {
    "id": {"type": "string", "required": True},
    "name": {"type": "string", "required": True},
    "node_type": {"type": "enum", "values": NODE_TYPES, "required": True},
    "type": {"type": "string", "required": True, "description": "Subtype within node_type"},
    "description": {"type": "string", "default": ""},
    "weight": {"type": "float", "range": [0, None], "default": 1.0},  # unbounded
    "energy": {"type": "float", "range": [0, None], "default": 0.0},  # unbounded
    "created_at_s": {"type": "int", "required": True},
    "updated_at_s": {"type": "int", "required": True},
}

# Node-type specific fields
NODE_TYPE_FIELDS = {
    "actor": {
        "status": {
            "type": "enum",
            "values": ["ready", "running"],
            "default": "ready",
            "description": "Agent execution state",
        },
    },
    "space": {},
    "thing": {
        "uri": {"type": "string", "required": False, "description": "Optional locator"},
    },
    "narrative": {
        "content": {"type": "string", "default": ""},
    },
    "moment": {
        "content": {"type": "string", "default": ""},
        "status": {
            "type": "enum",
            "values": ["possible", "active", "completed", "failed", "decayed"],
            "default": "possible",
        },
        "tick_created": {"type": "int", "default": 0},
        "tick_resolved": {"type": "int", "nullable": True},
    },
}

# LinkBase fields
LINK_BASE_FIELDS = {
    "id": {"type": "string", "required": True},
    "node_a": {"type": "string", "required": True, "description": "First endpoint"},
    "node_b": {"type": "string", "required": True, "description": "Second endpoint"},
    "type": {"type": "enum", "values": LINK_TYPES, "required": True},
    "weight": {"type": "float", "range": [0, None], "default": 1.0},
    "energy": {"type": "float", "range": [0, None], "default": 0.0},
    "strength": {"type": "float", "range": [0, None], "default": 0.0},
    "emotions": {"type": "list", "default": []},
    "name": {"type": "string", "default": ""},
    "role": {
        "type": "enum",
        "values": ["originator", "believer", "witness", "subject", "creditor", "debtor"],
        "nullable": True,
    },
    "direction": {
        "type": "enum",
        "values": ["support", "oppose", "elaborate", "subsume", "supersede"],
        "nullable": True,
    },
    "description": {"type": "string", "default": ""},
    "created_at_s": {"type": "int", "required": True},
}

# Link type valid endpoints
LINK_VALID_ENDPOINTS = {
    "expresses": {"from": ["actor"], "to": ["moment"]},
    "about": {"from": ["moment"], "to": ["actor", "space", "thing", "narrative"]},
    "relates": {
        "from": ["actor", "space", "thing", "narrative", "moment"],
        "to": ["actor", "space", "thing", "narrative", "moment"],
    },
    "attached_to": {"from": ["thing"], "to": ["actor", "space"]},
    "contains": {"from": ["space"], "to": ["space", "actor", "thing"]},
    "leads_to": {"from": ["space"], "to": ["space"]},
    "sequence": {"from": ["moment"], "to": ["moment"]},
    "primes": {"from": ["moment"], "to": ["moment"]},
    "can_become": {"from": ["thing"], "to": ["thing"]},
}

# Backwards compatibility: map protocol field names to schema field names
FIELD_ALIASES = {
    "from": "node_a",
    "to": "node_b",
    "prose": "content",  # moment.prose -> moment.content (legacy)
    "text": "content",   # moment.text -> moment.content (legacy)
}


# =============================================================================
# VALIDATION FUNCTIONS
# =============================================================================

def _validate_field(value: Any, field_spec: Dict[str, Any], field_name: str) -> Optional[SchemaError]:
    """Validate a single field against its spec."""
    field_type = field_spec.get("type", "string")
    required = field_spec.get("required", False)
    nullable = field_spec.get("nullable", False)
    default = field_spec.get("default")

    # Check required
    if value is None:
        if required and default is None:
            return SchemaError(
                message=f"Required field '{field_name}' is missing",
                field=field_name,
                guidance=field_spec.get("description", f"Provide a value for {field_name}"),
            )
        if nullable or default is not None:
            return None  # OK - optional/nullable
        return None

    # Type validation
    if field_type == "string":
        if not isinstance(value, str):
            return SchemaError(
                message=f"Field '{field_name}' must be a string",
                field=field_name,
                guidance=f"Got {type(value).__name__}, expected string",
            )

    elif field_type == "int":
        if not isinstance(value, int):
            return SchemaError(
                message=f"Field '{field_name}' must be an integer",
                field=field_name,
                guidance=f"Got {type(value).__name__}, expected int",
            )

    elif field_type == "float":
        if not isinstance(value, (int, float)):
            return SchemaError(
                message=f"Field '{field_name}' must be a number",
                field=field_name,
                guidance=f"Got {type(value).__name__}, expected float",
            )
        # Range check
        range_spec = field_spec.get("range")
        if range_spec:
            min_val, max_val = range_spec
            if min_val is not None and value < min_val:
                return SchemaError(
                    message=f"Field '{field_name}' is below minimum ({min_val})",
                    field=field_name,
                    guidance=f"Value must be >= {min_val}",
                )
            if max_val is not None and value > max_val:
                return SchemaError(
                    message=f"Field '{field_name}' exceeds maximum ({max_val})",
                    field=field_name,
                    guidance=f"Value must be <= {max_val}",
                )

    elif field_type == "enum":
        values = field_spec.get("values", [])
        if value not in values:
            return SchemaError(
                message=f"Field '{field_name}' has invalid value '{value}'",
                field=field_name,
                guidance=f"Must be one of: {', '.join(str(v) for v in values)}",
            )

    elif field_type == "list":
        if not isinstance(value, list):
            return SchemaError(
                message=f"Field '{field_name}' must be a list",
                field=field_name,
                guidance=f"Got {type(value).__name__}, expected list",
            )

    return None


def validate_node(node_data: Dict[str, Any], strict: bool = False) -> None:
    """
    Validate a node against the canonical schema.

    Args:
        node_data: The node data to validate
        strict: If True, require all fields including timestamps

    Raises:
        SchemaError: If validation fails
    """
    # Check node_type
    node_type = node_data.get("node_type")
    if not node_type:
        raise SchemaError(
            message="Missing required field 'node_type'",
            field="node_type",
            guidance=f"Must be one of: {', '.join(NODE_TYPES)}",
        )

    if node_type not in NODE_TYPES:
        raise SchemaError(
            message=f"Unknown node_type: {node_type}",
            field="node_type",
            guidance=f"Must be one of: {', '.join(NODE_TYPES)}",
        )

    # Validate base fields
    for field_name, field_spec in NODE_BASE_FIELDS.items():
        # Skip timestamp validation unless strict mode
        if not strict and field_name in ("created_at_s", "updated_at_s"):
            continue

        value = node_data.get(field_name)
        error = _validate_field(value, field_spec, field_name)
        if error:
            raise error

    # Validate type-specific fields
    type_fields = NODE_TYPE_FIELDS.get(node_type, {})
    for field_name, field_spec in type_fields.items():
        value = node_data.get(field_name)
        error = _validate_field(value, field_spec, field_name)
        if error:
            raise error


def validate_link(link_data: Dict[str, Any], strict: bool = False) -> None:
    """
    Validate a link against the canonical schema.

    Args:
        link_data: The link data to validate
        strict: If True, require all fields including timestamps

    Raises:
        SchemaError: If validation fails
    """
    # Handle field aliases (from/to -> node_a/node_b)
    normalized = dict(link_data)
    for alias, canonical in FIELD_ALIASES.items():
        if alias in normalized and canonical not in normalized:
            normalized[canonical] = normalized[alias]

    link_type = normalized.get("type")
    if not link_type:
        raise SchemaError(
            message="Missing required field 'type' for link",
            field="type",
            guidance=f"Must be one of: {', '.join(LINK_TYPES)}",
        )

    if link_type not in LINK_TYPES:
        raise SchemaError(
            message=f"Unknown link type: {link_type}",
            field="type",
            guidance=f"Must be one of: {', '.join(LINK_TYPES)}",
        )

    # Validate base fields
    for field_name, field_spec in LINK_BASE_FIELDS.items():
        # Skip optional fields and timestamps unless strict
        if not strict and field_name in ("id", "created_at_s"):
            continue

        value = normalized.get(field_name)
        error = _validate_field(value, field_spec, field_name)
        if error:
            raise error


def validate_connectivity(
    new_nodes: List[Dict[str, Any]],
    new_links: List[Dict[str, Any]],
    existing_node_ids: Set[str]
) -> None:
    """
    Validate that new nodes connect to existing graph.

    Args:
        new_nodes: Nodes being created
        new_links: Links being created
        existing_node_ids: IDs of nodes already in graph

    Raises:
        ConnectivityError: If new nodes are orphaned
    """
    if not new_nodes:
        return  # Nothing to validate

    if not existing_node_ids and len(new_nodes) == 1:
        return  # First node in empty graph is OK

    # Build set of new node IDs
    new_node_ids = {n.get("id") for n in new_nodes if n.get("id")}

    # Track which new nodes are connected
    connected_new_nodes: Set[str] = set()

    for link in new_links:
        # Handle field aliases
        from_id = link.get("node_a") or link.get("from")
        to_id = link.get("node_b") or link.get("to")

        # Check if link connects new node to existing node
        if from_id in existing_node_ids and to_id in new_node_ids:
            connected_new_nodes.add(to_id)
        elif to_id in existing_node_ids and from_id in new_node_ids:
            connected_new_nodes.add(from_id)

    # Transitively connect: new nodes connected to connected new nodes
    orphan_nodes = new_node_ids - connected_new_nodes
    changed = True
    while changed and orphan_nodes:
        changed = False
        for link in new_links:
            from_id = link.get("node_a") or link.get("from")
            to_id = link.get("node_b") or link.get("to")
            if from_id in connected_new_nodes and to_id in orphan_nodes:
                connected_new_nodes.add(to_id)
                orphan_nodes.remove(to_id)
                changed = True
            elif to_id in connected_new_nodes and from_id in orphan_nodes:
                connected_new_nodes.add(from_id)
                orphan_nodes.remove(from_id)
                changed = True

    if orphan_nodes and existing_node_ids:
        raise ConnectivityError(
            message="New nodes must connect to existing graph",
            guidance="Add a link from an existing node to your new nodes",
            examples={
                "good": "links: [{ type: contains, from: space_physics, to: space_physics_tick }]",
                "bad": "Creating nodes with no links to existing graph"
            },
            new_nodes=list(orphan_nodes)
        )


def validate_cluster(
    nodes: List[Dict[str, Any]],
    links: List[Dict[str, Any]],
    existing_node_ids: Set[str] = None,
    strict: bool = False
) -> List[SchemaError]:
    """
    Validate a complete cluster (nodes + links).

    Returns list of all errors found (empty if valid).
    """
    errors: List[SchemaError] = []
    existing_node_ids = existing_node_ids or set()

    # Validate each node
    for node in nodes:
        try:
            validate_node(node, strict=strict)
        except SchemaError as e:
            errors.append(e)

    # Validate each link
    for link in links:
        try:
            validate_link(link, strict=strict)
        except SchemaError as e:
            errors.append(e)

    # Validate connectivity
    try:
        validate_connectivity(nodes, links, existing_node_ids)
    except ConnectivityError as e:
        errors.append(e)

    return errors
