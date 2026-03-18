"""
Database Adapter Module

Provides a unified interface for graph database operations.
Supports FalkorDB and Neo4j backends via configuration.

Usage:
    from runtime.infrastructure.database import get_database_adapter

    adapter = get_database_adapter()
    result = adapter.query("MATCH (n) RETURN n LIMIT 10")

Configuration:
    Set backend in engine/data/database_config.yaml or via environment variables:
    - DATABASE_BACKEND: "falkordb" or "neo4j"
    - FALKORDB_HOST, FALKORDB_PORT, FALKORDB_GRAPH
    - NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD, NEO4J_DATABASE

DOCS: docs/infrastructure/database-adapter/PATTERNS_DatabaseAdapter.md
"""

from .adapter import (
    DatabaseAdapter,
    TransactionAdapter,
    DatabaseError,
    ConnectionError,
    QueryError,
)
from .factory import (
    get_database_adapter,
    load_database_config,
    clear_adapter_cache,
)
from .falkordb_adapter import FalkorDBAdapter

# Neo4j adapter is lazy-loaded to avoid requiring the neo4j package

__all__ = [
    # Abstract classes
    "DatabaseAdapter",
    "TransactionAdapter",
    # Exceptions
    "DatabaseError",
    "ConnectionError",
    "QueryError",
    # Factory
    "get_database_adapter",
    "load_database_config",
    "clear_adapter_cache",
    # Implementations
    "FalkorDBAdapter",
]
