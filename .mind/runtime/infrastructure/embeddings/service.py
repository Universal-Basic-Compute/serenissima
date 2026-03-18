"""
Embedding Service

Generates embeddings for semantic search using sentence-transformers.
Includes disk-based cache to avoid re-embedding unchanged text across
mind init / deploy cycles.

Cache: .mind/cache/embeddings.json — maps SHA-256(text) → vector.
Survives deploys. Only recomputes when text changes.

DOCS: docs/infrastructure/embeddings/
"""

import hashlib
import json
import logging
import os
from pathlib import Path
from typing import List, Dict, Any, Optional
import numpy as np

logger = logging.getLogger(__name__)

# Singleton instance
_embedding_service: Optional['EmbeddingService'] = None

# Disk cache location (relative to project root)
_CACHE_DIR = Path(os.environ.get("MIND_EMBEDDING_CACHE_DIR", ".mind/cache"))
_CACHE_FILE = _CACHE_DIR / "embeddings.json"


class _EmbeddingCache:
    """Disk-persisted embedding cache. Hash(text) → vector."""

    def __init__(self, cache_path: Path = _CACHE_FILE):
        self._path = cache_path
        self._cache: Dict[str, List[float]] = {}
        self._dirty = False
        self._load()

    def _load(self):
        if self._path.exists():
            try:
                with open(self._path) as f:
                    self._cache = json.load(f)
                logger.debug(f"Embedding cache loaded: {len(self._cache)} entries")
            except (json.JSONDecodeError, OSError):
                self._cache = {}

    def get(self, text: str) -> Optional[List[float]]:
        key = hashlib.sha256(text.encode()).hexdigest()[:16]
        return self._cache.get(key)

    def put(self, text: str, embedding: List[float]):
        key = hashlib.sha256(text.encode()).hexdigest()[:16]
        self._cache[key] = embedding
        self._dirty = True

    def flush(self):
        if not self._dirty:
            return
        self._path.parent.mkdir(parents=True, exist_ok=True)
        try:
            with open(self._path, "w") as f:
                json.dump(self._cache, f)
            logger.debug(f"Embedding cache flushed: {len(self._cache)} entries")
        except OSError as e:
            logger.warning(f"Failed to flush embedding cache: {e}")
        self._dirty = False

    def __len__(self):
        return len(self._cache)


class EmbeddingService:
    """
    Embedding service using sentence-transformers.

    Uses all-mpnet-base-v2 (768 dimensions) for high-quality embeddings.
    Disk cache avoids recomputing embeddings for unchanged text.
    """

    def __init__(self, model_name: str = "sentence-transformers/all-mpnet-base-v2"):
        """
        Initialize embedding service.

        Args:
            model_name: HuggingFace model name
        """
        self.model_name = model_name
        self.model = None
        self.dimension = 768  # all-mpnet-base-v2 dimension
        self._cache = _EmbeddingCache()
        self._cache_hits = 0
        self._cache_misses = 0

        logger.info(f"[EmbeddingService] Initializing with {model_name}")

    def _load_model(self):
        """Lazy load the model. Fails if sentence-transformers not installed."""
        if self.model is None:
            try:
                from sentence_transformers import SentenceTransformer
                self.model = SentenceTransformer(self.model_name)
                self.dimension = self.model.get_sentence_embedding_dimension()
                logger.info(f"[EmbeddingService] Loaded model ({self.dimension} dimensions)")
            except ImportError as e:
                raise ImportError(
                    "sentence-transformers is required for embeddings. "
                    "Install with: pip install sentence-transformers"
                ) from e

    def embed(self, text: str) -> List[float]:
        """
        Generate embedding for text. Uses disk cache to skip recomputation.

        Args:
            text: Text to embed

        Returns:
            List of floats (768 dimensions)
        """
        if not text or not text.strip():
            return [0.0] * self.dimension

        # Check cache first
        cached = self._cache.get(text)
        if cached is not None:
            self._cache_hits += 1
            return cached

        self._load_model()
        self._cache_misses += 1

        embedding = self.model.encode(text, normalize_embeddings=True)
        result = embedding.tolist()

        self._cache.put(text, result)
        return result

    def embed_batch(self, texts: List[str]) -> List[List[float]]:
        """
        Generate embeddings for multiple texts. Cache-aware: only computes
        embeddings for texts not already cached.

        Args:
            texts: List of texts to embed

        Returns:
            List of embedding vectors
        """
        if not texts:
            return []

        results: List[Optional[List[float]]] = [None] * len(texts)
        to_compute: List[tuple[int, str]] = []  # (original_index, text)

        for i, text in enumerate(texts):
            clean = text if text and text.strip() else " "
            cached = self._cache.get(clean)
            if cached is not None:
                results[i] = cached
                self._cache_hits += 1
            else:
                to_compute.append((i, clean))
                self._cache_misses += 1

        # Batch compute only uncached texts
        if to_compute:
            self._load_model()
            uncached_texts = [t for _, t in to_compute]
            computed = self.model.encode(uncached_texts, normalize_embeddings=True)

            for (orig_idx, text), vec in zip(to_compute, computed):
                vec_list = vec.tolist()
                results[orig_idx] = vec_list
                self._cache.put(text, vec_list)

        return results  # type: ignore

    def flush_cache(self):
        """Persist the embedding cache to disk. Call after bulk operations."""
        self._cache.flush()
        if self._cache_hits + self._cache_misses > 0:
            total = self._cache_hits + self._cache_misses
            hit_pct = round(100 * self._cache_hits / total, 1)
            logger.info(
                f"Embedding cache: {self._cache_hits} hits, {self._cache_misses} misses "
                f"({hit_pct}% hit rate, {len(self._cache)} total entries)"
            )

    def embed_node(self, node: Dict[str, Any]) -> List[float]:
        """
        Generate embedding for a node based on its type.

        Args:
            node: Node dict with 'type' and relevant fields

        Returns:
            Embedding vector
        """
        node_type = node.get('type', '')
        text = self._node_to_text(node, node_type)
        return self.embed(text)

    def _node_to_text(self, node: Dict[str, Any], node_type: str) -> str:
        """Convert node to embeddable text."""
        parts = []

        if node_type == 'character':
            parts.append(f"{node.get('name', '')}")
            if node.get('backstory_wound'):
                parts.append(f"Wound: {node['backstory_wound']}")
            if node.get('backstory_why_here'):
                parts.append(f"Why here: {node['backstory_why_here']}")
            if node.get('values'):
                vals = node['values']
                if isinstance(vals, list):
                    parts.append(f"Values: {', '.join(vals)}")

        elif node_type == 'place':
            parts.append(f"{node.get('name', '')}, {node.get('place_type', 'place')}")
            if node.get('mood'):
                parts.append(f"Mood: {node['mood']}")
            if node.get('details'):
                details = node['details']
                if isinstance(details, list):
                    parts.append(f"Details: {', '.join(details)}")

        elif node_type == 'thing':
            parts.append(f"{node.get('name', '')}")
            if node.get('content'):
                parts.append(node['content'])
            if node.get('significance') and node['significance'] != 'mundane':
                parts.append(f"Significance: {node['significance']}")

        elif node_type == 'narrative':
            parts.append(f"{node.get('name', '')}: {node.get('content', '')}")
            if node.get('interpretation'):
                parts.append(f"Meaning: {node['interpretation']}")

        elif node_type == 'moment':
            if node.get('speaker'):
                parts.append(f"{node['speaker']}: {node.get('content', '')}")
            else:
                parts.append(node.get('content', ''))

        else:
            # Generic fallback: name + content
            parts.append(node.get('name', ''))
            parts.append(node.get('content', ''))

        return '. '.join(p for p in parts if p)

    def embed_link(self, props: Dict[str, Any], link_type: str) -> List[float]:
        """
        Generate embedding for a link based on its semantic properties.

        Mirrors LinkBase.embeddable_text() pattern:
        - type and direction
        - name and description
        - role
        - emotions (if present)

        Args:
            props: Link properties dict
            link_type: Link type string (e.g., 'RELATES', 'ABOUT')

        Returns:
            Embedding vector (768 dimensions)
        """
        parts = [f"{link_type} link"]

        if props.get('name'):
            parts.append(props['name'])

        if props.get('direction'):
            parts.append(f"direction: {props['direction']}")

        if props.get('role'):
            parts.append(f"role: {props['role']}")

        if props.get('description'):
            parts.append(props['description'])

        # Emotions are stored as list of [name, intensity]
        emotions = props.get('emotions', [])
        if emotions and isinstance(emotions, list):
            emotion_strs = []
            for e in emotions[:3]:
                if isinstance(e, list) and len(e) >= 1:
                    emotion_strs.append(str(e[0]))
                elif isinstance(e, str):
                    emotion_strs.append(e)
            if emotion_strs:
                parts.append(f"emotions: {', '.join(emotion_strs)}")

        text = ". ".join(parts)
        return self.embed(text)

    def similarity(self, vec1: List[float], vec2: List[float]) -> float:
        """
        Compute cosine similarity between two vectors.

        Args:
            vec1: First vector
            vec2: Second vector

        Returns:
            Similarity score (0-1 for normalized vectors)
        """
        a = np.array(vec1)
        b = np.array(vec2)
        return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))


def get_embedding_service() -> EmbeddingService:
    """Get singleton embedding service instance."""
    global _embedding_service
    if _embedding_service is None:
        _embedding_service = EmbeddingService()
    return _embedding_service
