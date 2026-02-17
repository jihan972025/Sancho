"""At-rest encryption for sensitive config values.

Uses Fernet symmetric encryption (AES-128-CBC + HMAC-SHA256) from the
``cryptography`` library.  Encrypted values are prefixed with ``ENC:`` so
that plaintext configs (pre-upgrade) are transparently migrated on the
next save.

Key management
--------------
A random Fernet key is generated once and stored at ``~/.sancho/.key``
with owner-only permissions.  The key file is **separate** from the
config, so leaking ``config.json`` alone does not expose secrets.
"""

import logging
import os
import platform
import subprocess
from pathlib import Path
from typing import Optional

from cryptography.fernet import Fernet, InvalidToken

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_ENC_PREFIX = "ENC:"

_config_dir = Path(os.environ.get("SANCHO_CONFIG_DIR", Path.home() / ".sancho"))
_key_file = _config_dir / ".key"

# Module-level cached Fernet instance
_fernet: Optional[Fernet] = None

# ---------------------------------------------------------------------------
# File-permission helper
# ---------------------------------------------------------------------------


def set_strict_permissions(filepath: Path) -> None:
    """Set owner-only read/write permissions on *filepath*.

    On Windows this uses ``icacls``; on POSIX it uses ``chmod 600``.
    Failures are **logged as warnings** instead of being silently ignored.
    """
    try:
        if platform.system() == "Windows":
            username = os.environ.get("USERNAME", "")
            if not username:
                logger.warning(
                    "Cannot set permissions on %s: USERNAME env var not set",
                    filepath,
                )
                return
            result = subprocess.run(
                [
                    "icacls",
                    str(filepath),
                    "/inheritance:r",
                    "/grant:r",
                    f"{username}:F",
                ],
                capture_output=True,
                text=True,
                timeout=5,
            )
            if result.returncode != 0:
                logger.warning(
                    "icacls failed for %s: %s", filepath, result.stderr.strip()
                )
        else:
            os.chmod(str(filepath), 0o600)
    except FileNotFoundError:
        logger.warning("Cannot set permissions: %s does not exist", filepath)
    except subprocess.TimeoutExpired:
        logger.warning("Timeout setting permissions on %s", filepath)
    except Exception as e:
        logger.warning("Failed to set permissions on %s: %s", filepath, e)


# ---------------------------------------------------------------------------
# Key management
# ---------------------------------------------------------------------------


def _get_or_create_key() -> bytes:
    """Load the Fernet key from disk, or generate and persist a new one."""
    _config_dir.mkdir(parents=True, exist_ok=True)

    if _key_file.exists():
        key = _key_file.read_bytes().strip()
        try:
            Fernet(key)  # validate
            return key
        except (ValueError, Exception):
            logger.warning("Existing .key file is invalid — generating new key")

    key = Fernet.generate_key()
    _key_file.write_bytes(key)
    set_strict_permissions(_key_file)
    logger.info("Generated new encryption key at %s", _key_file)
    return key


def _get_fernet() -> Fernet:
    """Return a cached :class:`Fernet` instance (singleton)."""
    global _fernet
    if _fernet is None:
        _fernet = Fernet(_get_or_create_key())
    return _fernet


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def encrypt_value(plaintext: str) -> str:
    """Encrypt a non-empty string → ``"ENC:<fernet-token>"``."""
    if not plaintext:
        return plaintext
    f = _get_fernet()
    token = f.encrypt(plaintext.encode("utf-8"))
    return _ENC_PREFIX + token.decode("ascii")


def decrypt_value(ciphertext: str) -> str:
    """Decrypt an ``"ENC:..."`` string back to plaintext.

    * Values **without** the ``ENC:`` prefix are returned unchanged
      (backward-compatible with pre-encryption configs).
    * If decryption fails (wrong key / corrupted), returns ``""`` and
      logs a warning so the user can re-enter the key in Settings.
    """
    if not ciphertext:
        return ciphertext
    if not ciphertext.startswith(_ENC_PREFIX):
        return ciphertext  # plaintext — migration case
    token = ciphertext[len(_ENC_PREFIX) :]
    f = _get_fernet()
    try:
        return f.decrypt(token.encode("ascii")).decode("utf-8")
    except InvalidToken:
        logger.warning(
            "Failed to decrypt a config value (key may have changed). "
            "The value will be treated as empty. Re-enter it in Settings."
        )
        return ""
    except Exception as e:
        logger.warning("Unexpected decryption error: %s", e)
        return ""


def encrypt_dict_values(d: dict[str, str]) -> dict[str, str]:
    """Encrypt every *value* in a ``str→str`` dict (e.g. HTTP headers)."""
    return {k: encrypt_value(v) for k, v in d.items()}


def decrypt_dict_values(d: dict[str, str]) -> dict[str, str]:
    """Decrypt every *value* in a ``str→str`` dict."""
    return {k: decrypt_value(v) for k, v in d.items()}
