"""
RSA-2048 Key Manager

Key pair generation, PEM load/save, RSA-OAEP encrypt/decrypt.
Used to wrap/unwrap AES-256 symmetric keys for per-Space encryption.

No fallbacks. If any operation fails, CryptoError is raised.

DOCS: docs/universe/ALGORITHM_Universe_Graph.md (ALG-2)
"""

from pathlib import Path
from typing import Tuple

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa, padding
from cryptography.hazmat.primitives.asymmetric.rsa import RSAPrivateKey, RSAPublicKey

from .aes256_content_encryptor import CryptoError


_RSA_KEY_SIZE = 2048
_RSA_PUBLIC_EXPONENT = 65537


class KeyManager:
    """RSA-2048 key pair management for actors.

    All methods are static. No state.
    Private keys are PEM-encoded (PKCS8, no password).
    Public keys are PEM-encoded (SubjectPublicKeyInfo).
    """

    @staticmethod
    def generate_keypair() -> Tuple[bytes, bytes]:
        """Generate an RSA-2048 key pair.

        Returns:
            Tuple of (private_key_pem, public_key_pem) as bytes.

        Raises:
            CryptoError: If key generation fails.
        """
        try:
            private_key = rsa.generate_private_key(
                public_exponent=_RSA_PUBLIC_EXPONENT,
                key_size=_RSA_KEY_SIZE,
            )
            private_pem = private_key.private_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PrivateFormat.PKCS8,
                encryption_algorithm=serialization.NoEncryption(),
            )
            public_pem = private_key.public_key().public_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PublicFormat.SubjectPublicKeyInfo,
            )
            return private_pem, public_pem
        except Exception as exc:
            raise CryptoError(f"RSA key generation failed: {exc}") from exc

    @staticmethod
    def load_private_key(pem_data: bytes) -> RSAPrivateKey:
        """Load an RSA private key from PEM bytes.

        Args:
            pem_data: PEM-encoded private key bytes.

        Returns:
            RSAPrivateKey object.

        Raises:
            CryptoError: If PEM data is invalid.
        """
        try:
            key = serialization.load_pem_private_key(pem_data, password=None)
            if not isinstance(key, RSAPrivateKey):
                raise CryptoError("Loaded key is not an RSA private key")
            return key
        except CryptoError:
            raise
        except Exception as exc:
            raise CryptoError(f"Failed to load private key: {exc}") from exc

    @staticmethod
    def load_public_key(pem_data: bytes) -> RSAPublicKey:
        """Load an RSA public key from PEM bytes.

        Args:
            pem_data: PEM-encoded public key bytes.

        Returns:
            RSAPublicKey object.

        Raises:
            CryptoError: If PEM data is invalid.
        """
        try:
            key = serialization.load_pem_public_key(pem_data)
            if not isinstance(key, RSAPublicKey):
                raise CryptoError("Loaded key is not an RSA public key")
            return key
        except CryptoError:
            raise
        except Exception as exc:
            raise CryptoError(f"Failed to load public key: {exc}") from exc

    @staticmethod
    def load_private_key_from_file(path: str) -> RSAPrivateKey:
        """Load an RSA private key from a PEM file.

        Args:
            path: Path to the PEM file.

        Returns:
            RSAPrivateKey object.

        Raises:
            CryptoError: If file does not exist or PEM data is invalid.
        """
        filepath = Path(path)
        if not filepath.exists():
            raise CryptoError(f"Private key file not found: {path}")
        try:
            pem_data = filepath.read_bytes()
            return KeyManager.load_private_key(pem_data)
        except CryptoError:
            raise
        except Exception as exc:
            raise CryptoError(f"Failed to read private key file: {exc}") from exc

    @staticmethod
    def save_private_key(pem_data: bytes, path: str) -> None:
        """Save PEM-encoded private key to file.

        Args:
            pem_data: PEM-encoded private key bytes.
            path: Destination file path.

        Raises:
            CryptoError: If write fails.
        """
        try:
            filepath = Path(path)
            filepath.parent.mkdir(parents=True, exist_ok=True)
            filepath.write_bytes(pem_data)
            filepath.chmod(0o600)  # Owner-read-write only
        except Exception as exc:
            raise CryptoError(f"Failed to save private key: {exc}") from exc

    @staticmethod
    def save_public_key(pem_data: bytes, path: str) -> None:
        """Save PEM-encoded public key to file.

        Args:
            pem_data: PEM-encoded public key bytes.
            path: Destination file path.

        Raises:
            CryptoError: If write fails.
        """
        try:
            filepath = Path(path)
            filepath.parent.mkdir(parents=True, exist_ok=True)
            filepath.write_bytes(pem_data)
        except Exception as exc:
            raise CryptoError(f"Failed to save public key: {exc}") from exc

    @staticmethod
    def rsa_encrypt(data: bytes, public_key_pem: bytes) -> bytes:
        """Encrypt data with RSA-OAEP (SHA-256).

        Typically used to wrap an AES-256 key (32 bytes).
        Maximum plaintext size for RSA-2048 with OAEP-SHA256 is 190 bytes.

        Args:
            data: Plaintext bytes to encrypt (max ~190 bytes for RSA-2048).
            public_key_pem: PEM-encoded RSA public key.

        Returns:
            RSA ciphertext bytes.

        Raises:
            CryptoError: If encryption fails.
        """
        try:
            public_key = KeyManager.load_public_key(public_key_pem)
            ciphertext = public_key.encrypt(
                data,
                padding.OAEP(
                    mgf=padding.MGF1(algorithm=hashes.SHA256()),
                    algorithm=hashes.SHA256(),
                    label=None,
                ),
            )
            return ciphertext
        except CryptoError:
            raise
        except Exception as exc:
            raise CryptoError(f"RSA encryption failed: {exc}") from exc

    @staticmethod
    def rsa_decrypt(ciphertext: bytes, private_key: RSAPrivateKey) -> bytes:
        """Decrypt RSA-OAEP (SHA-256) ciphertext.

        Args:
            ciphertext: RSA ciphertext bytes.
            private_key: RSA private key object.

        Returns:
            Decrypted plaintext bytes.

        Raises:
            CryptoError: If decryption fails (wrong key, corrupt data).
        """
        try:
            plaintext = private_key.decrypt(
                ciphertext,
                padding.OAEP(
                    mgf=padding.MGF1(algorithm=hashes.SHA256()),
                    algorithm=hashes.SHA256(),
                    label=None,
                ),
            )
            return plaintext
        except Exception as exc:
            raise CryptoError(f"RSA decryption failed: {exc}") from exc
