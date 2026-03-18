"""
OpenAI Embedding Adapter

Uses OpenAI's text-embedding-3-small (1536 dimensions) or text-embedding-3-large (3072 dimensions).

DOCS: docs/infrastructure/embeddings/
"""

import os
import logging
from typing import List, Dict, Any, Optional

import numpy as np

logger = logging.getLogger(__name__)

# Model configurations
MODELS = {
    "text-embedding-3-small": {"dimension": 1536, "max_tokens": 8191},
    "text-embedding-3-large": {"dimension": 3072, "max_tokens": 8191},
}

DEFAULT_MODEL = "text-embedding-3-large"


class OpenAIEmbeddingAdapter:
    """
    OpenAI embedding adapter using text-embedding-3-* models.

    Requires OPENAI_API_KEY environment variable.
    """

    def __init__(
        self,
        model_name: str = None,
        api_key: str = None,
    ):
        """
        Initialize OpenAI embedding adapter.

        Args:
            model_name: Model to use (text-embedding-3-small or text-embedding-3-large)
            api_key: OpenAI API key (defaults to OPENAI_API_KEY env var)
        """
        self.model_name = model_name or os.getenv("OPENAI_EMBEDDING_MODEL", DEFAULT_MODEL)
        self.api_key = api_key or os.getenv("OPENAI_API_KEY")

        if self.model_name not in MODELS:
            raise ValueError(f"Unknown model: {self.model_name}. Use: {list(MODELS.keys())}")

        self.dimension = MODELS[self.model_name]["dimension"]
        self._client = None

        logger.info(f"[OpenAIEmbedding] Using {self.model_name} ({self.dimension} dimensions)")

    def _get_client(self):
        """Lazy load OpenAI client."""
        if self._client is None:
            if not self.api_key:
                raise ValueError(
                    "OpenAI API key required. Set OPENAI_API_KEY environment variable."
                )
            try:
                from openai import OpenAI
                self._client = OpenAI(api_key=self.api_key)
            except ImportError:
                raise ImportError(
                    "openai package required. Install with: pip install openai"
                )
        return self._client

    def embed(self, text: str) -> List[float]:
        """
        Generate embedding for text.

        Args:
            text: Text to embed

        Returns:
            List of floats (1536 or 3072 dimensions)
        """
        if not text or not text.strip():
            return [0.0] * self.dimension

        client = self._get_client()
        response = client.embeddings.create(
            model=self.model_name,
            input=text,
        )
        return response.data[0].embedding

    def embed_batch(self, texts: List[str]) -> List[List[float]]:
        """
        Generate embeddings for multiple texts.

        Args:
            texts: List of texts to embed

        Returns:
            List of embedding vectors
        """
        if not texts:
            return []

        # Filter empty texts
        valid_texts = [t if t and t.strip() else " " for t in texts]

        client = self._get_client()
        response = client.embeddings.create(
            model=self.model_name,
            input=valid_texts,
        )

        # Sort by index to maintain order
        embeddings = sorted(response.data, key=lambda x: x.index)
        return [e.embedding for e in embeddings]

    def embed_node(self, node: Dict[str, Any]) -> List[float]:
        """
        Generate embedding for a node based on its synthesis field.

        Args:
            node: Node dict with 'synthesis' or relevant fields

        Returns:
            Embedding vector
        """
        # Use synthesis if available (v1.8 schema)
        text = node.get("synthesis", "")
        if not text:
            # Fallback to name + content
            text = f"{node.get('name', '')} {node.get('content', '')}".strip()
        return self.embed(text)

    def similarity(self, vec1: List[float], vec2: List[float]) -> float:
        """
        Compute cosine similarity between two vectors.

        Args:
            vec1: First vector
            vec2: Second vector

        Returns:
            Similarity score (-1 to 1)
        """
        a = np.array(vec1)
        b = np.array(vec2)
        norm_a = np.linalg.norm(a)
        norm_b = np.linalg.norm(b)
        if norm_a == 0 or norm_b == 0:
            return 0.0
        return float(np.dot(a, b) / (norm_a * norm_b))
