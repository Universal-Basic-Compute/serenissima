"""
Database Adapter Factory

Creates the appropriate database adapter based on configuration.

Usage:
    from runtime.infrastructure.database import get_database_adapter

    # Uses configuration from database_config.yaml
    adapter = get_database_adapter()

    # Or specify graph name
    adapter = get_database_adapter(graph_name="my_graph")

DOCS: docs/infrastructure/database-adapter/PATTERNS_DatabaseAdapter.md
"""

import os
import logging
import subprocess
from pathlib import Path
from typing import Dict, Any, Optional

import yaml

from .adapter import DatabaseAdapter, ConnectionError

logger = logging.getLogger(__name__)

# Singleton instances per graph name
_instances: Dict[str, DatabaseAdapter] = {}


def _get_repo_name() -> str:
    """Get repository name from git or directory name, normalized for database use."""
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            capture_output=True, text=True, timeout=5
        )
        if result.returncode == 0:
            name = Path(result.stdout.strip()).name
        else:
            name = Path.cwd().name
    except Exception:
        name = Path.cwd().name
    # Normalize: lowercase, replace hyphens/spaces with underscores
    return name.lower().replace("-", "_").replace(" ", "_")


# Default configuration (graph_name derived at runtime)
DEFAULT_CONFIG = {
    "database": {
        "backend": "falkordb",
        "falkordb": {
            "host": "localhost",
            "port": 6379,
            "graph_name": None,  # Will be set to repo name
        },
        "neo4j": {
            "uri": "bolt://localhost:7687",
            "user": "neo4j",
            "password": "",
            "database": "neo4j",
        },
    }
}


def load_database_config() -> Dict[str, Any]:
    """
    Load database configuration from YAML file.

    Looks for configuration in:
    1. engine/data/database_config.yaml
    2. Falls back to defaults

    Environment variables can override:
    - DATABASE_BACKEND: "falkordb" or "neo4j"
    - FALKORDB_HOST, FALKORDB_PORT, FALKORDB_GRAPH
    - NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD, NEO4J_DATABASE
    """
    config = DEFAULT_CONFIG.copy()

    # Try to load from file (check .mind/ first, then data/)
    mind_config = Path.cwd() / ".mind" / "database_config.yaml"
    legacy_config = Path(__file__).parent.parent.parent / "data" / "database_config.yaml"
    config_path = mind_config if mind_config.exists() else legacy_config
    if config_path.exists():
        try:
            with open(config_path, "r") as f:
                file_config = yaml.safe_load(f)
                if file_config and "database" in file_config:
                    # Deep merge
                    config["database"].update(file_config["database"])
                    if "falkordb" in file_config["database"]:
                        config["database"]["falkordb"].update(file_config["database"]["falkordb"])
                    if "neo4j" in file_config["database"]:
                        config["database"]["neo4j"].update(file_config["database"]["neo4j"])
        except Exception as e:
            logger.warning(f"Failed to load database config: {e}")

    # Override with environment variables
    if os.environ.get("DATABASE_BACKEND"):
        config["database"]["backend"] = os.environ["DATABASE_BACKEND"]

    # FalkorDB env vars
    if os.environ.get("FALKORDB_HOST"):
        config["database"]["falkordb"]["host"] = os.environ["FALKORDB_HOST"]
    if os.environ.get("FALKORDB_PORT"):
        config["database"]["falkordb"]["port"] = int(os.environ["FALKORDB_PORT"])
    if os.environ.get("FALKORDB_GRAPH"):
        config["database"]["falkordb"]["graph_name"] = os.environ["FALKORDB_GRAPH"]

    # Neo4j env vars
    if os.environ.get("NEO4J_URI"):
        config["database"]["neo4j"]["uri"] = os.environ["NEO4J_URI"]
    if os.environ.get("NEO4J_USER"):
        config["database"]["neo4j"]["user"] = os.environ["NEO4J_USER"]
    if os.environ.get("NEO4J_PASSWORD"):
        config["database"]["neo4j"]["password"] = os.environ["NEO4J_PASSWORD"]
    if os.environ.get("NEO4J_DATABASE"):
        config["database"]["neo4j"]["database"] = os.environ["NEO4J_DATABASE"]

    return config


def get_database_adapter(
    graph_name: Optional[str] = None,
    force_new: bool = False,
) -> DatabaseAdapter:
    """
    Get or create a database adapter.

    Args:
        graph_name: Optional graph name override. If not provided,
                   uses the default from configuration.
        force_new: If True, create a new instance even if one exists.

    Returns:
        DatabaseAdapter instance

    Raises:
        ConnectionError: If database connection fails
        ValueError: If unknown backend specified
    """
    config = load_database_config()
    backend = config["database"]["backend"]

    # Determine graph name (default to repo name)
    if graph_name is None:
        if backend == "falkordb":
            graph_name = config["database"]["falkordb"].get("graph_name") or _get_repo_name()
        else:
            graph_name = config["database"]["neo4j"].get("database") or _get_repo_name()

    # Check for existing instance
    cache_key = f"{backend}:{graph_name}"
    if not force_new and cache_key in _instances:
        return _instances[cache_key]

    # Create new adapter
    if backend == "falkordb":
        from .falkordb_adapter import FalkorDBAdapter

        falkor_config = config["database"]["falkordb"]
        adapter = FalkorDBAdapter(
            graph_name=graph_name,
            host=falkor_config.get("host", "localhost"),
            port=falkor_config.get("port", 6379),
        )
    elif backend == "neo4j":
        from .neo4j_adapter import Neo4jAdapter

        neo4j_config = config["database"]["neo4j"]
        adapter = Neo4jAdapter(
            uri=neo4j_config.get("uri", "bolt://localhost:7687"),
            user=neo4j_config.get("user", "neo4j"),
            password=neo4j_config.get("password", ""),
            database=graph_name,
        )
    else:
        raise ValueError(f"Unknown database backend: {backend}")

    # Cache the instance
    _instances[cache_key] = adapter
    return adapter


def clear_adapter_cache() -> None:
    """Clear all cached adapter instances."""
    global _instances
    for adapter in _instances.values():
        try:
            adapter.close()
        except Exception:
            pass
    _instances = {}
