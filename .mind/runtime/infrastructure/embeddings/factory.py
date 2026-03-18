"""
Embedding Service Factory

Creates embedding service based on configuration.

DOCS: docs/infrastructure/embeddings/

Usage:
    from runtime.infrastructure.embeddings import get_embedding_service

    # Uses EMBEDDING_PROVIDER env var (default: local)
    embeddings = get_embedding_service()

    # Or specify provider
    embeddings = get_embedding_service(provider="openai")
"""

import os
import logging
from pathlib import Path
from typing import Optional, Protocol, List, Dict, Any

import yaml

logger = logging.getLogger(__name__)

# Singleton instances
_instances: Dict[str, Any] = {}

# Dimensions by provider
DIMENSIONS = {
    "local": 768,
    "openai": {"text-embedding-3-small": 1536, "text-embedding-3-large": 3072},
}


class EmbeddingProvider(Protocol):
    """Protocol for embedding providers."""
    dimension: int

    def embed(self, text: str) -> List[float]: ...
    def embed_batch(self, texts: List[str]) -> List[List[float]]: ...
    def embed_node(self, node: Dict[str, Any]) -> List[float]: ...
    def similarity(self, vec1: List[float], vec2: List[float]) -> float: ...


class EmbeddingConfigError(Exception):
    """Raised when embedding config doesn't match stored config."""
    pass


def _check_dimension_mismatch(current_dim: int) -> None:
    """Fail if current dimension doesn't match stored config."""
    # Check .mind/database_config.yaml in current directory
    config_path = Path(".mind/database_config.yaml")
    if not config_path.exists():
        return

    try:
        config = yaml.safe_load(config_path.read_text())
        stored = config.get("embedding", {})
        stored_dim = stored.get("dimension")
        stored_provider = stored.get("provider", "unknown")

        if stored_dim and stored_dim != current_dim:
            raise EmbeddingConfigError(
                f"\n"
                f"Embedding dimension mismatch!\n"
                f"  Stored:  {stored_provider} ({stored_dim}d)\n"
                f"  Current: {current_dim}d\n"
                f"\n"
                f"Vector indexes were created with {stored_dim}d. Fix:\n"
                f"  1. Revert: unset EMBEDDING_PROVIDER\n"
                f"  2. Recreate: delete .mind/ and graph, run 'mind init'\n"
                f"  3. Force: EMBEDDING_SKIP_CHECK=1 (indexes won't work)\n"
            )
    except EmbeddingConfigError:
        raise
    except Exception:
        pass  # Silently ignore config read errors


def get_embedding_service(provider: str = None, check_config: bool = True) -> EmbeddingProvider:
    """
    Get embedding service instance.

    Args:
        provider: Provider name ("local", "openai").
                  Defaults to EMBEDDING_PROVIDER env var or "local".
        check_config: If True, warn if dimension doesn't match stored config.

    Returns:
        Embedding service instance

    Environment variables:
        EMBEDDING_PROVIDER: "local" or "openai" (default: local)
        OPENAI_API_KEY: Required if provider is "openai"
        OPENAI_EMBEDDING_MODEL: OpenAI model (default: text-embedding-3-large)
    """
    provider = provider or os.getenv("EMBEDDING_PROVIDER", "local")

    # Return cached instance
    if provider in _instances:
        return _instances[provider]

    if provider == "openai":
        from .openai_adapter import OpenAIEmbeddingAdapter
        instance = OpenAIEmbeddingAdapter()
        logger.info(f"[EmbeddingFactory] Using OpenAI ({instance.dimension}d)")

    elif provider == "local":
        from .service import EmbeddingService
        instance = EmbeddingService()
        logger.info(f"[EmbeddingFactory] Using local sentence-transformers ({instance.dimension}d)")

    else:
        raise ValueError(f"Unknown embedding provider: {provider}. Use 'local' or 'openai'.")

    # Check for dimension mismatch with stored config
    if check_config and not os.getenv("EMBEDDING_SKIP_CHECK"):
        _check_dimension_mismatch(instance.dimension)

    _instances[provider] = instance
    return instance


def clear_cache():
    """Clear cached instances (for testing)."""
    global _instances
    _instances = {}
