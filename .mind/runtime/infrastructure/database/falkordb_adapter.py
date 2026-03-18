"""
FalkorDB Adapter Implementation

Implements the DatabaseAdapter interface for FalkorDB (Redis-based graph database).

DOCS: docs/infrastructure/database-adapter/ALGORITHM_DatabaseAdapter.md
"""

import logging
from typing import List, Dict, Any, Optional
from contextlib import contextmanager

from falkordb import FalkorDB

from .adapter import (
    DatabaseAdapter,
    TransactionAdapter,
    DatabaseError,
    ConnectionError,
    QueryError,
)

logger = logging.getLogger(__name__)


class FalkorDBAdapter(DatabaseAdapter):
    """
    FalkorDB implementation of DatabaseAdapter.

    Uses Redis protocol to connect to FalkorDB.
    """

    def __init__(
        self,
        graph_name: str = "blood_ledger",
        host: str = "localhost",
        port: int = 6379,
    ):
        """
        Initialize FalkorDB connection.

        Args:
            graph_name: Name of the graph to use
            host: FalkorDB/Redis host
            port: FalkorDB/Redis port (default 6379)
        """
        self._graph_name = graph_name
        self._host = host
        self._port = port
        self._db: Optional[FalkorDB] = None
        self._graph = None

        self._connect()

    def _connect(self) -> None:
        """Establish connection to FalkorDB."""
        try:
            self._db = FalkorDB(host=self._host, port=self._port)
            self._graph = self._db.select_graph(self._graph_name)
            logger.info(f"[FalkorDBAdapter] Connected to {self._graph_name} at {self._host}:{self._port}")
        except Exception as e:
            raise ConnectionError(
                f"Cannot connect to FalkorDB at {self._host}:{self._port}: {e}"
            )

    @property
    def graph_name(self) -> str:
        """Return the current graph name."""
        return self._graph_name

    @property
    def graph(self):
        """Return the raw FalkorDB graph object (for backward compatibility)."""
        return self._graph

    def query(self, cypher: str, params: Optional[Dict[str, Any]] = None) -> List[Any]:
        """
        Execute a Cypher query and return results.

        Args:
            cypher: The Cypher query string
            params: Optional parameters for the query

        Returns:
            List of result rows
        """
        try:
            result = self._graph.query(cypher, params or {})
            return result.result_set if result.result_set else []
        except Exception as e:
            # Try reconnecting once
            if self._is_connection_error(e):
                try:
                    self._connect()
                    result = self._graph.query(cypher, params or {})
                    return result.result_set if result.result_set else []
                except Exception as retry_error:
                    raise QueryError(f"Query failed after reconnect: {retry_error}")
            raise QueryError(f"Query failed: {e}")

    def execute(self, cypher: str, params: Optional[Dict[str, Any]] = None) -> None:
        """
        Execute a Cypher mutation without returning results.

        Args:
            cypher: The Cypher mutation string
            params: Optional parameters for the mutation
        """
        try:
            self._graph.query(cypher, params or {})
        except Exception as e:
            if self._is_connection_error(e):
                try:
                    self._connect()
                    self._graph.query(cypher, params or {})
                    return
                except Exception as retry_error:
                    raise QueryError(f"Execute failed after reconnect: {retry_error}")
            raise QueryError(f"Execute failed: {e}")

    @contextmanager
    def transaction(self):
        """
        Return a context manager for transactional operations.

        Note: FalkorDB transactions are per-query atomic.
        This provides a batch execution pattern.
        """
        tx = FalkorDBTransaction(self._graph)
        try:
            yield tx
            tx._commit()
        except Exception as e:
            # On exception, commands are not executed (implicit rollback)
            raise

    def create_index(self, label: str, property_name: str) -> None:
        """
        Create an index on a node label and property.

        FalkorDB syntax: CREATE INDEX FOR (n:Label) ON (n.property)
        """
        try:
            cypher = f"CREATE INDEX FOR (n:{label}) ON (n.{property_name})"
            self._graph.query(cypher)
            logger.info(f"[FalkorDBAdapter] Created index on {label}.{property_name}")
        except Exception as e:
            # Index might already exist
            if "already indexed" not in str(e).lower():
                logger.warning(f"[FalkorDBAdapter] Index creation warning: {e}")

    def health_check(self) -> bool:
        """
        Check if FalkorDB is reachable.

        Returns:
            True if database responds, False otherwise.
        """
        try:
            self._graph.query("RETURN 1")
            return True
        except Exception:
            return False

    def close(self) -> None:
        """Close FalkorDB connection."""
        # FalkorDB uses Redis connection pool, no explicit close needed
        self._db = None
        self._graph = None
        logger.info("[FalkorDBAdapter] Connection closed")

    def _is_connection_error(self, error: Exception) -> bool:
        """Check if error is a connection error."""
        error_str = str(error).lower()
        return any(keyword in error_str for keyword in [
            "connection", "refused", "timeout", "reset", "broken pipe"
        ])


class FalkorDBTransaction(TransactionAdapter):
    """
    FalkorDB transaction implementation.

    Batches commands and executes them on commit.
    """

    def __init__(self, graph):
        self._graph = graph
        self._commands: List[tuple] = []

    def query(self, cypher: str, params: Optional[Dict[str, Any]] = None) -> List[Any]:
        """
        Execute a query within the transaction.

        Note: Returns result immediately for FalkorDB.
        """
        result = self._graph.query(cypher, params or {})
        return result.result_set if result.result_set else []

    def execute(self, cypher: str, params: Optional[Dict[str, Any]] = None) -> None:
        """Queue a mutation for batch execution."""
        self._commands.append((cypher, params))

    def _commit(self) -> None:
        """Execute all queued commands."""
        for cypher, params in self._commands:
            self._graph.query(cypher, params or {})
        self._commands = []
