import os
import shutil
import time
import uuid
import logging
from pathlib import Path
from typing import Optional

from pydantic import BaseModel

logger = logging.getLogger(__name__)

PROTECTED_DIRS = [
    "C:\\Windows",
    "C:\\Program Files",
    "C:\\Program Files (x86)",
    "C:\\ProgramData",
    "C:\\$Recycle.Bin",
    "C:\\System Volume Information",
    "C:\\Recovery",
]

PROTECTED_DIRS_LOWER = [p.lower() for p in PROTECTED_DIRS]


class FileInfo(BaseModel):
    name: str
    path: str
    is_dir: bool
    size: int = 0
    modified: float = 0


class DeleteToken(BaseModel):
    token: str
    path: str
    expires_at: float
    item_count: int
    total_size: int


_pending_deletes: dict[str, DeleteToken] = {}


def _sancho_config_dir() -> str:
    """Get Sancho config dir path to protect it from file operations."""
    return os.path.realpath(
        os.environ.get("SANCHO_CONFIG_DIR", str(Path.home() / ".sancho"))
    ).lower()


def _is_protected(path: str) -> bool:
    # Resolve symlinks to prevent symlink traversal attacks
    try:
        resolved = os.path.realpath(path).lower()
    except (OSError, ValueError):
        return True  # If we can't resolve, treat as protected
    for protected in PROTECTED_DIRS_LOWER:
        if resolved == protected or resolved.startswith(protected + "\\"):
            return True
    # Block access to Sancho config directory (contains API keys, tokens)
    sancho_dir = _sancho_config_dir()
    if resolved == sancho_dir or resolved.startswith(sancho_dir + "\\"):
        return True
    return False


def list_directory(path: str) -> list[FileInfo]:
    target = Path(path)
    if not target.exists():
        raise FileNotFoundError(f"Directory not found: {path}")
    if not target.is_dir():
        raise ValueError(f"Not a directory: {path}")

    items = []
    try:
        for entry in sorted(target.iterdir(), key=lambda e: (not e.is_dir(), e.name.lower())):
            try:
                stat = entry.stat()
                items.append(
                    FileInfo(
                        name=entry.name,
                        path=str(entry),
                        is_dir=entry.is_dir(),
                        size=stat.st_size if entry.is_file() else 0,
                        modified=stat.st_mtime,
                    )
                )
            except PermissionError:
                items.append(
                    FileInfo(
                        name=entry.name,
                        path=str(entry),
                        is_dir=entry.is_dir(),
                    )
                )
    except PermissionError:
        raise PermissionError(f"Access denied: {path}")
    return items


def create_file(path: str, content: str = "") -> FileInfo:
    if _is_protected(path):
        raise PermissionError(f"Cannot create files in protected directory")
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")
    stat = target.stat()
    return FileInfo(
        name=target.name,
        path=str(target),
        is_dir=False,
        size=stat.st_size,
        modified=stat.st_mtime,
    )


def create_directory(path: str) -> FileInfo:
    if _is_protected(path):
        raise PermissionError(f"Cannot create directories in protected directory")
    target = Path(path)
    target.mkdir(parents=True, exist_ok=True)
    return FileInfo(
        name=target.name,
        path=str(target),
        is_dir=True,
    )


def _analyze_path(path: str) -> tuple[int, int]:
    """Returns (item_count, total_size) for deletion analysis."""
    target = Path(path)
    if target.is_file():
        return 1, target.stat().st_size
    count = 0
    total = 0
    for root, dirs, files in os.walk(path):
        count += len(files) + len(dirs)
        for f in files:
            try:
                total += os.path.getsize(os.path.join(root, f))
            except OSError:
                pass
    return count + 1, total


def request_delete(path: str) -> DeleteToken:
    if _is_protected(path):
        raise PermissionError(f"Cannot delete protected path")
    target = Path(path)
    if not target.exists():
        raise FileNotFoundError(f"Path not found: {path}")

    item_count, total_size = _analyze_path(path)
    token = DeleteToken(
        token=str(uuid.uuid4()),
        path=os.path.abspath(path),
        expires_at=time.time() + 30,  # 30 seconds to confirm
        item_count=item_count,
        total_size=total_size,
    )
    _pending_deletes[token.token] = token
    logger.info(f"Delete requested: {path} (token={token.token}, items={item_count})")
    return token


def confirm_delete(token: str) -> bool:
    pending = _pending_deletes.pop(token, None)
    if not pending:
        raise ValueError("Invalid or expired delete token")
    if time.time() > pending.expires_at:
        raise ValueError("Delete token has expired")

    path = Path(pending.path)
    if path.is_file():
        path.unlink()
    elif path.is_dir():
        shutil.rmtree(path)
    else:
        raise FileNotFoundError(f"Path no longer exists: {pending.path}")

    logger.info(f"Deleted: {pending.path}")
    return True


def move_path(src: str, dst: str) -> FileInfo:
    if _is_protected(src) or _is_protected(dst):
        raise PermissionError("Cannot move protected paths")
    src_path = Path(src)
    if not src_path.exists():
        raise FileNotFoundError(f"Source not found: {src}")

    dst_path = Path(dst)
    dst_path.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(src_path), str(dst_path))
    stat = dst_path.stat()
    return FileInfo(
        name=dst_path.name,
        path=str(dst_path),
        is_dir=dst_path.is_dir(),
        size=stat.st_size if dst_path.is_file() else 0,
        modified=stat.st_mtime,
    )


def read_file(path: str, max_size: int = 1_000_000) -> str:
    target = Path(path)
    if not target.exists():
        raise FileNotFoundError(f"File not found: {path}")
    if not target.is_file():
        raise ValueError(f"Not a file: {path}")
    if target.stat().st_size > max_size:
        raise ValueError(f"File too large (>{max_size} bytes)")
    return target.read_text(encoding="utf-8", errors="replace")
