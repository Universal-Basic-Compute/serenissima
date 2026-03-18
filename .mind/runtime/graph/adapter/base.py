"""
Database Adapter - Abstract Base Class

Defines the interface for graph database operations.
Both FalkorDB and Neo4j adapters must implement this interface.

Usage:
    from runtime.infrastructure.database import get_database_adapter

    adapter = get_database_adapter()
    result = adapter.query("MATCH (n) RETURN n LIMIT 10")

DOCS: docs/infrastructure/database-adapter/PATTERNS_DatabaseAdapter.md
"""

from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional, ContextManager


class DatabaseAdapter(ABC):
    """
    Abstract interface for graph database operations.

    All graph database backends must implement this interface.
    Results are normalized to plain Python dicts.
    """

    @property
    @abstractmethod
    def graph_name(self) -> str:
        """Return the current graph name."""
        pass

    @abstractmethod
    def query(self, cypher: str, params: Optional[Dict[str, Any]] = None) -> List[Any]:
        """
        Execute a Cypher query and return results.

        Args:
            cypher: The Cypher query string
            params: Optional parameters for the query

        Returns:
            List of result rows (each row is a list of values)
        """
        pass

    @abstractmethod
    def execute(self, cypher: str, params: Optional[Dict[str, Any]] = None) -> None:
        """
        Execute a Cypher mutation without returning results.

        Args:
            cypher: The Cypher mutation string
            params: Optional parameters for the mutation
        """
        pass

    @abstractmethod
    def transaction(self) -> ContextManager['TransactionAdapter']:
        """
        Return a context manager for transactional operations.

        Usage:
            with adapter.transaction() as tx:
                tx.execute("CREATE ...")
                tx.execute("CREATE ...")
            # Committed on exit, rolled back on exception
        """
        pass

    @abstractmethod
    def create_index(self, label: str, property_name: str) -> None:
        """
        Create an index on a node label and property.

        Args:
            label: The node label (e.g., "Actor")
            property_name: The property to index (e.g., "id")
        """
        pass

    @abstractmethod
    def health_check(self) -> bool:
        """
        Check if the database is reachable.

        Returns:
            True if database is healthy, False otherwise.
            Never raises exceptions.
        """
        pass

    @abstractmethod
    def close(self) -> None:
        """Close database connections."""
        pass


class TransactionAdapter(ABC):
    """Abstract interface for transaction operations."""

    @abstractmethod
    def query(self, cypher: str, params: Optional[Dict[str, Any]] = None) -> List[Any]:
        """Execute a query within the transaction."""
        pass

    @abstractmethod
    def execute(self, cypher: str, params: Optional[Dict[str, Any]] = None) -> None:
        """Execute a mutation within the transaction."""
        pass


class DatabaseError(Exception):
    """Base exception for database errors."""
    pass


class ConnectionError(DatabaseError):
    """Raised when database connection fails."""
    pass


class QueryError(DatabaseError):
    """Raised when a query fails."""
    pass
