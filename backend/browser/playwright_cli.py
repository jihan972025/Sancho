import asyncio
import logging
import os
import re
import sys
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# Session name used for all playwright-cli commands
SESSION = "sancho"


def _find_cli_path() -> str:
    """Resolve playwright-cli executable path."""
    # 1. Explicit env var (set by Electron in production)
    env_path = os.environ.get("SANCHO_PLAYWRIGHT_CLI_PATH")
    if env_path and os.path.isfile(env_path):
        return env_path

    # 2. Local node_modules/.bin (dev)
    if sys.platform == "win32":
        local = Path(__file__).resolve().parents[2] / "node_modules" / ".bin" / "playwright-cli.cmd"
    else:
        local = Path(__file__).resolve().parents[2] / "node_modules" / ".bin" / "playwright-cli"
    if local.is_file():
        return str(local)

    # 3. Global fallback
    return "playwright-cli"


CLI_PATH = _find_cli_path()


async def _run_cmd(*args: str, timeout: float = 30) -> str:
    """Run a playwright-cli command and return stdout."""
    cmd = [CLI_PATH, f"-s={SESSION}"] + list(args)
    logger.debug("playwright-cli: %s", " ".join(cmd))
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(
            proc.communicate(), timeout=timeout
        )
        out = stdout.decode("utf-8", errors="replace").strip()
        err = stderr.decode("utf-8", errors="replace").strip()
        if proc.returncode != 0:
            raise RuntimeError(err or out or f"playwright-cli exited with code {proc.returncode}")
        if err:
            logger.debug("playwright-cli stderr: %s", err)
        return out
    except asyncio.TimeoutError:
        proc.kill()
        raise RuntimeError(f"playwright-cli timed out after {timeout}s")


def _extract_snapshot_path(output: str) -> Optional[str]:
    """Extract snapshot file path from CLI output like '- [Snapshot](.playwright-cli\\page-....yml)'."""
    m = re.search(r"\[Snapshot\]\(([^)]+)\)", output)
    return m.group(1) if m else None


def _extract_screenshot_path(output: str) -> Optional[str]:
    """Extract screenshot file path from CLI output like '- [Screenshot...](.playwright-cli\\page-....png)'."""
    m = re.search(r"\[Screenshot[^\]]*\]\(([^)]+)\)", output)
    return m.group(1) if m else None


def _extract_file_path(output: str, extension: str) -> Optional[str]:
    """Extract a file path with given extension from CLI markdown link output."""
    m = re.search(r"\]\(([^)]+\." + re.escape(extension) + r")\)", output)
    return m.group(1) if m else None


class PlaywrightCLI:
    """Async wrapper around playwright-cli subprocess — all commands."""

    # ═══════════════════════════════════════════
    # Core
    # ═══════════════════════════════════════════

    async def open(self, url: Optional[str] = None, headed: bool = False) -> str:
        args = ["open"]
        if url:
            args.append(url)
        if headed:
            args.append("--headed")
        return await _run_cmd(*args, timeout=30)

    async def close(self) -> str:
        return await _run_cmd("close", timeout=10)

    async def goto(self, url: str) -> str:
        return await _run_cmd("goto", url, timeout=30)

    async def type_text(self, text: str) -> str:
        return await _run_cmd("type", text, timeout=10)

    async def click(self, ref: str, button: str = "left") -> str:
        args = ["click", ref]
        if button != "left":
            args.append(button)
        return await _run_cmd(*args, timeout=10)

    async def dblclick(self, ref: str, button: str = "left") -> str:
        args = ["dblclick", ref]
        if button != "left":
            args.append(button)
        return await _run_cmd(*args, timeout=10)

    async def fill(self, ref: str, text: str) -> str:
        return await _run_cmd("fill", ref, text, timeout=10)

    async def drag(self, start_ref: str, end_ref: str) -> str:
        return await _run_cmd("drag", start_ref, end_ref, timeout=10)

    async def hover(self, ref: str) -> str:
        return await _run_cmd("hover", ref, timeout=10)

    async def select(self, ref: str, value: str) -> str:
        return await _run_cmd("select", ref, value, timeout=10)

    async def upload(self, file_path: str) -> str:
        return await _run_cmd("upload", file_path, timeout=15)

    async def check(self, ref: str) -> str:
        return await _run_cmd("check", ref, timeout=10)

    async def uncheck(self, ref: str) -> str:
        return await _run_cmd("uncheck", ref, timeout=10)

    async def snapshot(self) -> str:
        """Take a text snapshot and return the accessibility tree content."""
        out = await _run_cmd("snapshot", timeout=15)
        snap_path = _extract_snapshot_path(out)
        if snap_path:
            root = Path(__file__).resolve().parents[2]
            full_path = root / snap_path
            if full_path.is_file():
                content = full_path.read_text(encoding="utf-8", errors="replace")
                return content
        return out

    async def eval_js(self, code: str, ref: Optional[str] = None) -> str:
        args = ["eval", code]
        if ref:
            args.append(ref)
        return await _run_cmd(*args, timeout=15)

    async def dialog_accept(self, prompt_text: Optional[str] = None) -> str:
        args = ["dialog-accept"]
        if prompt_text:
            args.append(prompt_text)
        return await _run_cmd(*args, timeout=10)

    async def dialog_dismiss(self) -> str:
        return await _run_cmd("dialog-dismiss", timeout=10)

    async def resize(self, width: int, height: int) -> str:
        return await _run_cmd("resize", str(width), str(height), timeout=10)

    async def delete_data(self) -> str:
        return await _run_cmd("delete-data", timeout=10)

    # ═══════════════════════════════════════════
    # Navigation
    # ═══════════════════════════════════════════

    async def go_back(self) -> str:
        return await _run_cmd("go-back", timeout=15)

    async def go_forward(self) -> str:
        return await _run_cmd("go-forward", timeout=15)

    async def reload(self) -> str:
        return await _run_cmd("reload", timeout=30)

    # ═══════════════════════════════════════════
    # Keyboard
    # ═══════════════════════════════════════════

    async def press(self, key: str) -> str:
        return await _run_cmd("press", key, timeout=10)

    async def keydown(self, key: str) -> str:
        return await _run_cmd("keydown", key, timeout=10)

    async def keyup(self, key: str) -> str:
        return await _run_cmd("keyup", key, timeout=10)

    # ═══════════════════════════════════════════
    # Mouse
    # ═══════════════════════════════════════════

    async def mousemove(self, x: int, y: int) -> str:
        return await _run_cmd("mousemove", str(x), str(y), timeout=10)

    async def mousedown(self, button: str = "left") -> str:
        args = ["mousedown"]
        if button != "left":
            args.append(button)
        return await _run_cmd(*args, timeout=10)

    async def mouseup(self, button: str = "left") -> str:
        args = ["mouseup"]
        if button != "left":
            args.append(button)
        return await _run_cmd(*args, timeout=10)

    async def mousewheel(self, dx: int, dy: int) -> str:
        return await _run_cmd("mousewheel", str(dx), str(dy), timeout=10)

    async def scroll(self, direction: str = "down", amount: int = 500) -> str:
        """Convenience: scroll up/down via mousewheel."""
        dy = amount if direction == "down" else -amount
        return await self.mousewheel(0, dy)

    # ═══════════════════════════════════════════
    # Save as
    # ═══════════════════════════════════════════

    async def screenshot(self, ref: Optional[str] = None) -> bytes:
        """Take a screenshot and return the PNG bytes."""
        args = ["screenshot"]
        if ref:
            args.append(ref)
        out = await _run_cmd(*args, timeout=15)
        img_path = _extract_screenshot_path(out)
        if img_path:
            root = Path(__file__).resolve().parents[2]
            full_path = root / img_path
            if full_path.is_file():
                data = full_path.read_bytes()
                try:
                    full_path.unlink()
                except OSError:
                    pass
                return data
        raise RuntimeError("Failed to capture screenshot")

    async def pdf(self) -> bytes:
        """Save page as PDF and return the bytes."""
        out = await _run_cmd("pdf", timeout=15)
        pdf_path = _extract_file_path(out, "pdf")
        if pdf_path:
            root = Path(__file__).resolve().parents[2]
            full_path = root / pdf_path
            if full_path.is_file():
                data = full_path.read_bytes()
                try:
                    full_path.unlink()
                except OSError:
                    pass
                return data
        raise RuntimeError("Failed to save PDF")

    # ═══════════════════════════════════════════
    # Tabs
    # ═══════════════════════════════════════════

    async def tab_list(self) -> str:
        return await _run_cmd("tab-list", timeout=10)

    async def tab_new(self, url: Optional[str] = None) -> str:
        args = ["tab-new"]
        if url:
            args.append(url)
        return await _run_cmd(*args, timeout=15)

    async def tab_close(self, index: Optional[int] = None) -> str:
        args = ["tab-close"]
        if index is not None:
            args.append(str(index))
        return await _run_cmd(*args, timeout=10)

    async def tab_select(self, index: int) -> str:
        return await _run_cmd("tab-select", str(index), timeout=10)

    # ═══════════════════════════════════════════
    # Storage — State
    # ═══════════════════════════════════════════

    async def state_load(self, filename: str) -> str:
        return await _run_cmd("state-load", filename, timeout=10)

    async def state_save(self, filename: Optional[str] = None) -> str:
        args = ["state-save"]
        if filename:
            args.append(filename)
        return await _run_cmd(*args, timeout=10)

    # ═══════════════════════════════════════════
    # Storage — Cookies
    # ═══════════════════════════════════════════

    async def cookie_list(self) -> str:
        return await _run_cmd("cookie-list", timeout=10)

    async def cookie_get(self, name: str) -> str:
        return await _run_cmd("cookie-get", name, timeout=10)

    async def cookie_set(self, name: str, value: str) -> str:
        return await _run_cmd("cookie-set", name, value, timeout=10)

    async def cookie_delete(self, name: str) -> str:
        return await _run_cmd("cookie-delete", name, timeout=10)

    async def cookie_clear(self) -> str:
        return await _run_cmd("cookie-clear", timeout=10)

    # ═══════════════════════════════════════════
    # Storage — LocalStorage
    # ═══════════════════════════════════════════

    async def localstorage_list(self) -> str:
        return await _run_cmd("localstorage-list", timeout=10)

    async def localstorage_get(self, key: str) -> str:
        return await _run_cmd("localstorage-get", key, timeout=10)

    async def localstorage_set(self, key: str, value: str) -> str:
        return await _run_cmd("localstorage-set", key, value, timeout=10)

    async def localstorage_delete(self, key: str) -> str:
        return await _run_cmd("localstorage-delete", key, timeout=10)

    async def localstorage_clear(self) -> str:
        return await _run_cmd("localstorage-clear", timeout=10)

    # ═══════════════════════════════════════════
    # Storage — SessionStorage
    # ═══════════════════════════════════════════

    async def sessionstorage_list(self) -> str:
        return await _run_cmd("sessionstorage-list", timeout=10)

    async def sessionstorage_get(self, key: str) -> str:
        return await _run_cmd("sessionstorage-get", key, timeout=10)

    async def sessionstorage_set(self, key: str, value: str) -> str:
        return await _run_cmd("sessionstorage-set", key, value, timeout=10)

    async def sessionstorage_delete(self, key: str) -> str:
        return await _run_cmd("sessionstorage-delete", key, timeout=10)

    async def sessionstorage_clear(self) -> str:
        return await _run_cmd("sessionstorage-clear", timeout=10)

    # ═══════════════════════════════════════════
    # Network
    # ═══════════════════════════════════════════

    async def route(self, pattern: str) -> str:
        return await _run_cmd("route", pattern, timeout=10)

    async def route_list(self) -> str:
        return await _run_cmd("route-list", timeout=10)

    async def unroute(self, pattern: Optional[str] = None) -> str:
        args = ["unroute"]
        if pattern:
            args.append(pattern)
        return await _run_cmd(*args, timeout=10)

    # ═══════════════════════════════════════════
    # DevTools
    # ═══════════════════════════════════════════

    async def console(self, min_level: Optional[str] = None) -> str:
        args = ["console"]
        if min_level:
            args.append(min_level)
        return await _run_cmd(*args, timeout=10)

    async def run_code(self, code: str) -> str:
        return await _run_cmd("run-code", code, timeout=30)

    async def network(self) -> str:
        return await _run_cmd("network", timeout=10)

    async def tracing_start(self) -> str:
        return await _run_cmd("tracing-start", timeout=10)

    async def tracing_stop(self) -> str:
        return await _run_cmd("tracing-stop", timeout=10)

    async def video_start(self) -> str:
        return await _run_cmd("video-start", timeout=10)

    async def video_stop(self) -> str:
        return await _run_cmd("video-stop", timeout=10)

    # ═══════════════════════════════════════════
    # Utility
    # ═══════════════════════════════════════════

    async def get_page_info(self) -> dict:
        """Extract page URL and title from snapshot output."""
        out = await _run_cmd("snapshot", timeout=15)
        info: dict = {"url": "", "title": ""}
        for line in out.splitlines():
            if line.startswith("- Page URL:"):
                info["url"] = line.split(":", 1)[1].strip()
            elif line.startswith("- Page Title:"):
                info["title"] = line.split(":", 1)[1].strip()
        return info
