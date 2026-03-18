"""
Space Key Distribution and Rotation

Per-Space AES-256 symmetric key lifecycle:
- create_space_key: Generate a new 32-byte key
- grant_key: RSA-encrypt the space key with target actor's public key
- revoke_key: Remove access and optionally trigger rotation
- rotate_key: Generate new key, re-encrypt all content, re-distribute to remaining actors
- resolve_key_chain: Walk hierarchy to decrypt child space keys from ancestor access

DOCS: docs/universe/ALGORITHM_Universe_Graph.md (ALG-1, ALG-2)
"""

import os
import base64
from typing import Optional

from .aes256_content_encryptor import ContentEncryptor, CryptoError, _KEY_SIZE
from .rsa_key_manager import KeyManager
from .encrypted_field_codec import encode_b64, decode_b64

from cryptography.hazmat.primitives.asymmetric.rsa import RSAPrivateKey


class SpaceKeyManager:
    """Per-Space AES-256 symmetric key lifecycle.

    Manages creation, distribution (RSA-wrap per actor), rotation after
    adversarial revocation, and hierarchical key chain resolution.

    Does NOT touch the database directly. Returns encrypted key material
    as base64 strings suitable for storage in link content JSON.
    """

    def __init__(self, key_manager: Optional[KeyManager] = None):
        self._km = key_manager or KeyManager()

    @staticmethod
    def create_space_key() -> bytes:
        """Generate a new AES-256 key (32 random bytes).

        Returns:
            32-byte key.
        """
        return os.urandom(_KEY_SIZE)

    def grant_key(
        self,
        space_key: bytes,
        target_public_key_pem: bytes,
    ) -> str:
        """RSA-encrypt space_key with target actor's public key.

        Args:
            space_key: 32-byte AES-256 key to wrap.
            target_public_key_pem: PEM-encoded RSA public key of the target actor.

        Returns:
            Base64-encoded RSA ciphertext, ready for storage on HAS_ACCESS link content.

        Raises:
            CryptoError: If RSA encryption fails.
        """
        encrypted = self._km.rsa_encrypt(space_key, target_public_key_pem)
        return encode_b64(encrypted)

    def decrypt_granted_key(
        self,
        encrypted_key_b64: str,
        private_key: RSAPrivateKey,
    ) -> bytes:
        """Decrypt a granted space key using actor's RSA private key.

        Args:
            encrypted_key_b64: Base64-encoded RSA ciphertext from HAS_ACCESS link.
            private_key: Actor's RSA private key.

        Returns:
            32-byte AES-256 space key.

        Raises:
            CryptoError: If decryption fails.
        """
        encrypted_bytes = decode_b64(encrypted_key_b64)
        return self._km.rsa_decrypt(encrypted_bytes, private_key)

    @staticmethod
    def encrypt_child_key_with_parent(
        child_key: bytes,
        parent_key: bytes,
    ) -> str:
        """Encrypt a child Space's AES key with the parent Space's AES key.

        Used for hierarchical key resolution: each child space stores its
        key encrypted with its parent's key on the containment link.

        Args:
            child_key: 32-byte AES-256 key of the child Space.
            parent_key: 32-byte AES-256 key of the parent Space.

        Returns:
            Base64-encoded AES-GCM ciphertext of the child key.

        Raises:
            CryptoError: If encryption fails.
        """
        encrypted = ContentEncryptor.encrypt(
            child_key.hex(), parent_key
        )
        return encode_b64(encrypted)

    @staticmethod
    def decrypt_child_key_with_parent(
        encrypted_child_key_b64: str,
        parent_key: bytes,
    ) -> bytes:
        """Decrypt a child Space's AES key using the parent Space's AES key.

        Args:
            encrypted_child_key_b64: Base64-encoded ciphertext from containment link.
            parent_key: 32-byte AES-256 key of the parent Space.

        Returns:
            32-byte AES-256 key of the child Space.

        Raises:
            CryptoError: If decryption fails.
        """
        encrypted_bytes = decode_b64(encrypted_child_key_b64)
        hex_key = ContentEncryptor.decrypt(encrypted_bytes, parent_key)
        try:
            return bytes.fromhex(hex_key)
        except ValueError as exc:
            raise CryptoError(f"Decrypted child key is not valid hex: {exc}") from exc

    def rotate_key(
        self,
        old_key: bytes,
        actor_public_keys: dict[str, bytes],
    ) -> tuple[bytes, dict[str, str]]:
        """Generate a new space key and re-encrypt for all actors.

        This does NOT re-encrypt content -- the caller is responsible for
        iterating over all nodes in the Space and re-encrypting content/synthesis/embedding.

        Args:
            old_key: The current (old) AES-256 key (for content re-encryption by caller).
            actor_public_keys: Mapping of actor_id -> PEM public key for all remaining actors.

        Returns:
            Tuple of (new_key, encrypted_keys_by_actor) where encrypted_keys_by_actor
            maps actor_id -> base64-encoded RSA-wrapped new key.

        Raises:
            CryptoError: If any RSA encryption fails.
        """
        new_key = self.create_space_key()
        encrypted_keys = {}
        for actor_id, pub_pem in actor_public_keys.items():
            encrypted_keys[actor_id] = self.grant_key(new_key, pub_pem)
        return new_key, encrypted_keys

    def resolve_key_chain(
        self,
        encrypted_ancestor_key_b64: str,
        actor_private_key: RSAPrivateKey,
        encrypted_child_keys_b64: list[str],
    ) -> bytes:
        """Resolve key chain from ancestor to target space.

        ALG-1 key resolution: Actor decrypts ancestor key with RSA,
        then walks DOWN through containment hierarchy, decrypting each
        child key with its parent key.

        Args:
            encrypted_ancestor_key_b64: Base64-encoded RSA ciphertext of ancestor's space key.
            actor_private_key: Actor's RSA private key (to unwrap ancestor key).
            encrypted_child_keys_b64: Ordered list of base64-encoded child key ciphertexts,
                from ancestor's immediate child down to the target space.

        Returns:
            32-byte AES-256 key of the target space.

        Raises:
            CryptoError: If any decryption step fails.
        """
        current_key = self.decrypt_granted_key(encrypted_ancestor_key_b64, actor_private_key)

        for encrypted_child_b64 in encrypted_child_keys_b64:
            current_key = self.decrypt_child_key_with_parent(
                encrypted_child_b64, current_key
            )

        return current_key
