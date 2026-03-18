"""
Encrypted Field Codec

Utilities for encoding/decoding encrypted fields for graph storage:
- Base64 encode/decode for storing binary ciphertext as strings
- Plaintext detection heuristics for INV-3 validation
- Node dict encrypt/decrypt codec for batch field operations

DOCS: docs/universe/IMPLEMENTATION_Universe_Graph.md (Phase U3)
"""

import base64
import re
from typing import Any, Dict, List, Optional

from .aes256_content_encryptor import ContentEncryptor, CryptoError


# Fields that get encrypted in node dicts
ENCRYPTED_FIELDS = ("content", "synthesis")
ENCRYPTED_VECTOR_FIELD = "embedding"

# Base64 detection: valid base64 is [A-Za-z0-9+/=] with length divisible by 4
# and minimum length for AES-GCM output (12 IV + 16 tag = 28 bytes -> 40 base64 chars)
_MIN_CIPHERTEXT_B64_LEN = 40
_B64_PATTERN = re.compile(r"^[A-Za-z0-9+/]+=*$")


def encode_b64(data: bytes) -> str:
    """Encode bytes to base64 string for graph storage.

    Args:
        data: Raw bytes to encode.

    Returns:
        Base64-encoded string.
    """
    return base64.b64encode(data).decode("ascii")


def decode_b64(s: str) -> bytes:
    """Decode base64 string back to bytes.

    Args:
        s: Base64-encoded string.

    Returns:
        Raw bytes.

    Raises:
        CryptoError: If string is not valid base64.
    """
    try:
        return base64.b64decode(s)
    except Exception as exc:
        raise CryptoError(f"Invalid base64: {exc}") from exc


def is_plaintext(value: str) -> bool:
    """Check if a string looks like plaintext (not base64-encoded ciphertext).

    Heuristic for INV-3 validation: encrypted content is always base64-encoded
    AES-GCM output. If a string is short, contains whitespace, or does not
    match the base64 pattern, it is likely plaintext.

    Args:
        value: String to check.

    Returns:
        True if the string appears to be plaintext.
    """
    if not isinstance(value, str):
        return True
    if not value:
        return True
    # Short strings are almost certainly plaintext
    if len(value) < _MIN_CIPHERTEXT_B64_LEN:
        return True
    # Contains whitespace, newlines, or non-base64 characters -> plaintext
    if " " in value or "\n" in value or "\t" in value:
        return True
    # Does not match base64 pattern
    if not _B64_PATTERN.match(value):
        return True
    # Passes all heuristics -- looks like it could be ciphertext
    return False


def is_plaintext_vector(value: Any) -> bool:
    """Check if an embedding value is an unencrypted float list.

    Encrypted embeddings are stored as base64 strings. Unencrypted embeddings
    are stored as list[float]. Used by INV-3 validation.

    Args:
        value: Embedding field value to check.

    Returns:
        True if the value appears to be a plaintext (unencrypted) embedding.
    """
    if value is None:
        return False
    if isinstance(value, (list, tuple)):
        return True  # A list of floats is plaintext
    if isinstance(value, str):
        return is_plaintext(value)
    return True  # Unknown type -- assume plaintext


def encrypt_node_fields(node: Dict[str, Any], key: bytes) -> Dict[str, Any]:
    """Encrypt content, synthesis, and embedding fields of a node dict.

    Args:
        node: Node properties dict. Modified in place and returned.
        key: 32-byte AES-256 key.

    Returns:
        The same dict with encrypted fields replaced by base64-encoded ciphertext.

    Raises:
        CryptoError: If encryption fails for any field.
    """
    result = dict(node)

    for field in ENCRYPTED_FIELDS:
        value = result.get(field)
        if value is not None and isinstance(value, str) and value:
            encrypted = ContentEncryptor.encrypt(value, key)
            result[field] = encode_b64(encrypted)

    embedding = result.get(ENCRYPTED_VECTOR_FIELD)
    if embedding is not None and isinstance(embedding, (list, tuple)):
        encrypted = ContentEncryptor.encrypt_embedding(list(embedding), key)
        result[ENCRYPTED_VECTOR_FIELD] = encode_b64(encrypted)

    return result


def decrypt_node_fields(node: Dict[str, Any], key: bytes) -> Dict[str, Any]:
    """Decrypt content, synthesis, and embedding fields of a node dict.

    Args:
        node: Node properties dict with base64-encoded encrypted fields.
        key: 32-byte AES-256 key.

    Returns:
        A new dict with decrypted fields.

    Raises:
        CryptoError: If decryption fails for any field (no fallback).
    """
    result = dict(node)

    for field in ENCRYPTED_FIELDS:
        value = result.get(field)
        if value is not None and isinstance(value, str) and not is_plaintext(value):
            encrypted_bytes = decode_b64(value)
            result[field] = ContentEncryptor.decrypt(encrypted_bytes, key)

    embedding_val = result.get(ENCRYPTED_VECTOR_FIELD)
    if embedding_val is not None and isinstance(embedding_val, str) and not is_plaintext(embedding_val):
        encrypted_bytes = decode_b64(embedding_val)
        result[ENCRYPTED_VECTOR_FIELD] = ContentEncryptor.decrypt_embedding(encrypted_bytes, key)

    return result
