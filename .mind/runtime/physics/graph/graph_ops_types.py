"""
Graph Operations: Types and Exceptions

Common types and exceptions used by graph operations.
Extracted from graph_ops.py to reduce file size.

Usage:
    from runtime.physics.graph.graph_ops_types import (
        WriteError,
        SimilarNode,
        ApplyResult,
        SIMILARITY_THRESHOLD
    )
"""

from dataclasses import dataclass, field
from typing import Dict, Any, List


# Similarity threshold for duplicate detection
SIMILARITY_THRESHOLD = 0.85


class WriteError(Exception):
    """Error with helpful fix instructions."""

    def __init__(self, message: str, fix: str):
        self.message = message
        self.fix = fix
        super().__init__(f"{message}\n\nHOW TO FIX:\n{fix}")


@dataclass
class SimilarNode:
    """A node that is similar to one being created."""
    id: str
    name: str
    node_type: str
    similarity: float

    def __str__(self):
        return f"{self.name} ({self.id}) - {self.similarity:.0%} similar"


@dataclass
class ApplyResult:
    """Result of applying a mutation file."""
    persisted: List[str] = field(default_factory=list)
    rejected: List[str] = field(default_factory=list)
    errors: List[Dict[str, str]] = field(default_factory=list)
    duplicates: List[Dict[str, Any]] = field(default_factory=list)  # Similar nodes found

    @property
    def success(self) -> bool:
        return len(self.errors) == 0

    @property
    def has_duplicates(self) -> bool:
        return len(self.duplicates) > 0
