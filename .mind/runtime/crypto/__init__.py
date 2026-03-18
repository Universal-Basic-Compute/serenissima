"""
Cryptographic Primitives for Universe Graph

AES-256-GCM content encryption, RSA-2048 key management,
per-Space key distribution and rotation.

Architecture:
- ContentEncryptor: AES-256-GCM encrypt/decrypt for content, synthesis, embedding
- KeyManager: RSA-2048 key pair generation, PEM load/save, RSA-OAEP wrap/unwrap
- SpaceKeyManager: Per-Space symmetric key lifecycle (create, distribute, rotate, revoke)
- EncryptedFieldCodec: Encode/decode encrypted fields for graph storage

DOCS: docs/universe/IMPLEMENTATION_Universe_Graph.md (Phase U3)
"""

from .aes256_content_encryptor import ContentEncryptor, CryptoError
from .rsa_key_manager import KeyManager
from .space_key_distribution_and_rotation import SpaceKeyManager
from .encrypted_field_codec import encode_b64, decode_b64, is_plaintext, is_plaintext_vector

__all__ = [
    "ContentEncryptor",
    "CryptoError",
    "KeyManager",
    "SpaceKeyManager",
    "encode_b64",
    "decode_b64",
    "is_plaintext",
    "is_plaintext_vector",
]
