"""
Base Health Checker

Abstract base for all physics health checkers.

DOCS: docs/physics/HEALTH_Energy_Physics.md
"""

import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import List, Dict, Any, Optional

logger = logging.getLogger(__name__)


class HealthStatus(Enum):
    """Health check result status."""
    OK = "ok"
    WARN = "warn"
    ERROR = "error"
    UNKNOWN = "unknown"


@dataclass
class HealthResult:
    """Result of a health check."""
    checker_name: str
    status: HealthStatus
    message: str
    timestamp: datetime = field(default_factory=datetime.utcnow)
    details: Dict[str, Any] = field(default_factory=dict)
    validation_ids: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to JSON-serializable dict."""
        return {
            "checker": self.checker_name,
            "status": self.status.value,
            "message": self.message,
            "timestamp": self.timestamp.isoformat(),
            "details": self.details,
            "validation_ids": self.validation_ids,
        }


class BaseChecker(ABC):
    """
    Base class for physics health checkers.

    Each checker verifies specific invariants from VALIDATION_Energy_Physics.md.
    """

    # Override in subclasses
    name: str = "base"
    validation_ids: List[str] = []
    priority: str = "med"  # high, med, low

    def __init__(self, graph_queries=None, graph_ops=None):
        """
        Initialize checker with graph access.

        Args:
            graph_queries: GraphQueries instance for reading
            graph_ops: GraphOps instance for any writes (rare)
        """
        self.read = graph_queries
        self.write = graph_ops

    @abstractmethod
    def check(self) -> HealthResult:
        """
        Run the health check.

        Returns:
            HealthResult with status and details
        """
        pass

    def ok(self, message: str, details: Optional[Dict] = None) -> HealthResult:
        """Helper to create OK result."""
        return HealthResult(
            checker_name=self.name,
            status=HealthStatus.OK,
            message=message,
            details=details or {},
            validation_ids=self.validation_ids,
        )

    def warn(self, message: str, details: Optional[Dict] = None) -> HealthResult:
        """Helper to create WARN result."""
        return HealthResult(
            checker_name=self.name,
            status=HealthStatus.WARN,
            message=message,
            details=details or {},
            validation_ids=self.validation_ids,
        )

    def error(self, message: str, details: Optional[Dict] = None) -> HealthResult:
        """Helper to create ERROR result."""
        return HealthResult(
            checker_name=self.name,
            status=HealthStatus.ERROR,
            message=message,
            details=details or {},
            validation_ids=self.validation_ids,
        )

    def unknown(self, message: str, details: Optional[Dict] = None) -> HealthResult:
        """Helper to create UNKNOWN result (e.g., check couldn't run)."""
        return HealthResult(
            checker_name=self.name,
            status=HealthStatus.UNKNOWN,
            message=message,
            details=details or {},
            validation_ids=self.validation_ids,
        )
