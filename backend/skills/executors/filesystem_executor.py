import logging
import os
import shutil
from datetime import datetime
from pathlib import Path
from typing import Any

from ..base import SkillExecutor
from ...file_ops.manager import (
    _is_protected,
    list_directory,
    create_directory,
    create_file,
    read_file,
    move_path,
)

logger = logging.getLogger(__name__)


class FilesystemExecutor(SkillExecutor):
    name = "filesystem"

    def __init__(self, config):
        self._config = config

    def is_configured(self) -> bool:
        return True

    async def execute(self, params: dict[str, Any]) -> str:
        action = params.get("action", "")
        if action == "list":
            return self._list(params)
        elif action == "mkdir":
            return self._mkdir(params)
        elif action == "move":
            return self._move(params)
        elif action == "copy":
            return self._copy(params)
        elif action == "delete":
            return self._delete(params)
        elif action == "write":
            return self._write(params)
        elif action == "read":
            return self._read(params)
        elif action == "batch":
            return self._batch(params)
        else:
            return f"[SKILL_ERROR] Unknown filesystem action: {action}. Use 'list', 'mkdir', 'move', 'copy', 'delete', 'write', 'read', or 'batch'."

    def _list(self, params: dict[str, Any]) -> str:
        path = params.get("path", "")
        if not path:
            return "[SKILL_ERROR] Missing required parameter: path"

        try:
            items = list_directory(path)
        except FileNotFoundError:
            return f"[SKILL_ERROR] Directory not found: {path}"
        except PermissionError:
            return f"[SKILL_ERROR] Access denied: {path}"

        if not items:
            return f"Directory '{path}' is empty."

        lines = [f"Directory listing of '{path}' ({len(items)} items):\n"]
        lines.append(f"{'Type':<6} {'Size':>12} {'Modified':<20} Name")
        lines.append("-" * 70)
        for item in items:
            ftype = "DIR" if item.is_dir else "FILE"
            size = "" if item.is_dir else self._format_size(item.size)
            modified = datetime.fromtimestamp(item.modified).strftime("%Y-%m-%d %H:%M") if item.modified else ""
            lines.append(f"{ftype:<6} {size:>12} {modified:<20} {item.name}")

        return "\n".join(lines)

    def _mkdir(self, params: dict[str, Any]) -> str:
        path = params.get("path", "")
        if not path:
            return "[SKILL_ERROR] Missing required parameter: path"

        try:
            result = create_directory(path)
            return f"OK: Created directory '{result.path}'"
        except PermissionError as e:
            return f"[SKILL_ERROR] {e}"

    def _move(self, params: dict[str, Any]) -> str:
        src = params.get("src", "")
        dst = params.get("dst", "")
        if not src or not dst:
            return "[SKILL_ERROR] Missing required parameters: src and dst"

        try:
            result = move_path(src, dst)
            return f"OK: Moved '{src}' → '{result.path}'"
        except FileNotFoundError as e:
            return f"[SKILL_ERROR] {e}"
        except PermissionError as e:
            return f"[SKILL_ERROR] {e}"

    def _copy(self, params: dict[str, Any]) -> str:
        src = params.get("src", "")
        dst = params.get("dst", "")
        if not src or not dst:
            return "[SKILL_ERROR] Missing required parameters: src and dst"

        if _is_protected(src) or _is_protected(dst):
            return "[SKILL_ERROR] Cannot copy to/from protected directories"

        src_path = Path(src)
        if not src_path.exists():
            return f"[SKILL_ERROR] Source not found: {src}"

        try:
            dst_path = Path(dst)
            dst_path.parent.mkdir(parents=True, exist_ok=True)
            if src_path.is_dir():
                shutil.copytree(str(src_path), str(dst_path))
            else:
                shutil.copy2(str(src_path), str(dst_path))
            return f"OK: Copied '{src}' → '{dst}'"
        except Exception as e:
            return f"[SKILL_ERROR] Copy failed: {e}"

    def _delete(self, params: dict[str, Any]) -> str:
        path = params.get("path", "")
        if not path:
            return "[SKILL_ERROR] Missing required parameter: path"

        if _is_protected(path):
            return "[SKILL_ERROR] Cannot delete protected path"

        target = Path(path)
        if not target.exists():
            return f"[SKILL_ERROR] Path not found: {path}"

        try:
            if target.is_file():
                target.unlink()
            elif target.is_dir():
                shutil.rmtree(str(target))
            return f"OK: Deleted '{path}'"
        except PermissionError as e:
            return f"[SKILL_ERROR] Access denied: {e}"
        except Exception as e:
            return f"[SKILL_ERROR] Delete failed: {e}"

    def _write(self, params: dict[str, Any]) -> str:
        path = params.get("path", "")
        content = params.get("content", "")
        if not path:
            return "[SKILL_ERROR] Missing required parameter: path"

        try:
            result = create_file(path, content)
            return f"OK: Written {result.size} bytes to '{result.path}'"
        except PermissionError as e:
            return f"[SKILL_ERROR] {e}"
        except Exception as e:
            return f"[SKILL_ERROR] Write failed: {e}"

    def _read(self, params: dict[str, Any]) -> str:
        path = params.get("path", "")
        if not path:
            return "[SKILL_ERROR] Missing required parameter: path"

        try:
            content = read_file(path)
            return f"File '{path}' ({len(content)} chars):\n\n{content}"
        except FileNotFoundError as e:
            return f"[SKILL_ERROR] {e}"
        except ValueError as e:
            return f"[SKILL_ERROR] {e}"
        except Exception as e:
            return f"[SKILL_ERROR] Read failed: {e}"

    def _batch(self, params: dict[str, Any]) -> str:
        operations = params.get("operations", [])
        if not operations:
            return "[SKILL_ERROR] Missing required parameter: operations (must be a non-empty list)"

        results = []
        success_count = 0
        fail_count = 0

        for i, op in enumerate(operations, 1):
            action = op.get("action", "")
            handler = {
                "list": self._list,
                "mkdir": self._mkdir,
                "move": self._move,
                "copy": self._copy,
                "delete": self._delete,
                "write": self._write,
                "read": self._read,
            }.get(action)

            if not handler:
                results.append(f"  [{i}] SKIP: Unknown action '{action}'")
                fail_count += 1
                continue

            result = handler(op)
            results.append(f"  [{i}] {result}")
            if "[SKILL_ERROR]" in result:
                fail_count += 1
            else:
                success_count += 1

        summary = f"Batch complete: {success_count} succeeded, {fail_count} failed ({len(operations)} total)\n"
        return summary + "\n".join(results)

    @staticmethod
    def _format_size(size: int) -> str:
        if size < 1024:
            return f"{size} B"
        elif size < 1024 * 1024:
            return f"{size / 1024:.1f} KB"
        elif size < 1024 * 1024 * 1024:
            return f"{size / (1024 * 1024):.1f} MB"
        else:
            return f"{size / (1024 * 1024 * 1024):.1f} GB"
