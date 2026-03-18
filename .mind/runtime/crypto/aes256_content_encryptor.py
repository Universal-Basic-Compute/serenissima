"""
AES-256-GCM Content Encryptor

Encrypts and decrypts node content, synthesis, and embedding fields
using AES-256-GCM (authenticated encryption with associated data).

Wire format: 12-byte IV + ciphertext + 16-byte tag
Key: 32 bytes (AES-256)

No fallbacks. If decryption fails, CryptoError is raised.

DOCS: docs/universe/ALGORITHM_Universe_Graph.md (ALG-2)
"""

import os
import struct
from typing import List

from cryptography.hazmat.primitives.ciphers.aead import AESGCM


class CryptoError(Exception):
    """Raised on any encryption/decryption failure. No fallback."""
    pass


# AES-256-GCM constants
_IV_SIZE = 12   # 96-bit nonce (GCM recommended)
_KEY_SIZE = 32  # 256-bit key
_TAG_SIZE = 16  # 128-bit authentication tag (appended by AESGCM)


class ContentEncryptor:
    """AES-256-GCM encryption for node content, synthesis, and embedding fields.

    All methods are static. No state. Key provided per call.
    Wire format for all encrypt methods: IV (12B) + ciphertext + tag (16B).
    """

    @staticmethod
    def encrypt(plaintext: str, key: bytes) -> bytes:
        """Encrypt a string field.

        Args:
            plaintext: The string to encrypt.
            key: 32-byte AES-256 key.

        Returns:
            Bytes: IV + ciphertext + tag.

        Raises:
            CryptoError: If key is wrong size or encryption fails.
        """
        _validate_key(key)
        try:
            iv = os.urandom(_IV_SIZE)
            aesgcm = AESGCM(key)
            ciphertext_with_tag = aesgcm.encrypt(iv, plaintext.encode("utf-8"), None)
            return iv + ciphertext_with_tag
        except Exception as exc:
            raise CryptoError(f"Encryption failed: {exc}") from exc

    @staticmethod
    def decrypt(ciphertext: bytes, key: bytes) -> str:
        """Decrypt a string field.

        Args:
            ciphertext: IV + ciphertext + tag bytes.
            key: 32-byte AES-256 key.

        Returns:
            Decrypted plaintext string.

        Raises:
            CryptoError: If key is wrong, data is corrupt, or tag verification fails.
        """
        _validate_key(key)
        if len(ciphertext) < _IV_SIZE + _TAG_SIZE:
            raise CryptoError("Ciphertext too short: missing IV or tag")
        try:
            iv = ciphertext[:_IV_SIZE]
            ct_with_tag = ciphertext[_IV_SIZE:]
            aesgcm = AESGCM(key)
            plaintext_bytes = aesgcm.decrypt(iv, ct_with_tag, None)
            return plaintext_bytes.decode("utf-8")
        except CryptoError:
            raise
        except Exception as exc:
            raise CryptoError(f"Decryption failed: {exc}") from exc

    @staticmethod
    def encrypt_embedding(embedding: List[float], key: bytes) -> bytes:
        """Encrypt a float vector (embedding).

        Serializes the float list as a packed array of IEEE-754 doubles,
        then encrypts with AES-256-GCM.

        Args:
            embedding: List of floats (the embedding vector).
            key: 32-byte AES-256 key.

        Returns:
            Bytes: IV + ciphertext + tag.

        Raises:
            CryptoError: If key is wrong size or encryption fails.
        """
        _validate_key(key)
        try:
            packed = struct.pack(f"<{len(embedding)}d", *embedding)
            iv = os.urandom(_IV_SIZE)
            aesgcm = AESGCM(key)
            ciphertext_with_tag = aesgcm.encrypt(iv, packed, None)
            return iv + ciphertext_with_tag
        except Exception as exc:
            raise CryptoError(f"Embedding encryption failed: {exc}") from exc

    @staticmethod
    def decrypt_embedding(ciphertext: bytes, key: bytes) -> List[float]:
        """Decrypt a float vector (embedding).

        Args:
            ciphertext: IV + ciphertext + tag bytes.
            key: 32-byte AES-256 key.

        Returns:
            List of floats (the embedding vector).

        Raises:
            CryptoError: If key is wrong, data is corrupt, or tag verification fails.
        """
        _validate_key(key)
        if len(ciphertext) < _IV_SIZE + _TAG_SIZE:
            raise CryptoError("Ciphertext too short: missing IV or tag")
        try:
            iv = ciphertext[:_IV_SIZE]
            ct_with_tag = ciphertext[_IV_SIZE:]
            aesgcm = AESGCM(key)
            packed = aesgcm.decrypt(iv, ct_with_tag, None)
            num_floats = len(packed) // 8
            return list(struct.unpack(f"<{num_floats}d", packed))
        except CryptoError:
            raise
        except Exception as exc:
            raise CryptoError(f"Embedding decryption failed: {exc}") from exc


def _validate_key(key: bytes) -> None:
    """Validate AES-256 key size."""
    if not isinstance(key, bytes) or len(key) != _KEY_SIZE:
        raise CryptoError(f"AES-256 key must be exactly {_KEY_SIZE} bytes, got {len(key) if isinstance(key, bytes) else type(key)}")
