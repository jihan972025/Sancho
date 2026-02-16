"""Voice web app routes — serves a standalone mobile voice interface."""

import socket
import logging
import sys
from pathlib import Path

from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse

from ..config import get_config

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/voice", tags=["voice"])

# Active tunnel URL (set by Electron via POST /api/voice/tunnel-url)
_tunnel_url: str = ""


def _html_path() -> Path:
    """Resolve path to vocice_chat.html (works in dev and PyInstaller)."""
    if getattr(sys, "frozen", False):
        # PyInstaller bundle: html/ is bundled as data
        base = Path(sys._MEIPASS)  # type: ignore[attr-defined]
    else:
        base = Path(__file__).resolve().parent.parent.parent
    return base / "html" / "vocice_chat.html"


@router.post("/tunnel-url")
async def set_tunnel_url(request: Request):
    """Called by Electron to inform backend of the active tunnel URL."""
    global _tunnel_url
    body = await request.json()
    _tunnel_url = body.get("url", "")
    logger.info(f"Tunnel URL updated: {_tunnel_url or '(cleared)'}")
    return {"status": "ok"}


@router.get("/info")
async def voice_info():
    """Return voice app URL — tunnel URL if available, otherwise LAN."""
    if _tunnel_url:
        return {
            "ip": "",
            "port": 8765,
            "url": f"{_tunnel_url}/api/voice/app",
            "tunnel": True,
        }
    # Fallback: LAN IP
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
    except Exception:
        ip = "127.0.0.1"
    return {"ip": ip, "port": 8765, "url": f"http://{ip}:8765/api/voice/app", "tunnel": False}


@router.get("/app")
async def voice_app():
    """Serve the standalone voice web app from html/vocice_chat.html."""
    html_file = _html_path()
    try:
        content = html_file.read_text(encoding="utf-8")
    except FileNotFoundError:
        logger.error(f"Voice HTML not found: {html_file}")
        return HTMLResponse(
            content="<h1>Voice app not found</h1><p>Missing html/vocice_chat.html</p>",
            status_code=404,
        )
    return HTMLResponse(content=content)


@router.get("/config")
async def voice_config():
    """Return ONLY the language config needed by the voice web app.

    This is the safe alternative to /api/settings for tunnel-exposed access.
    Unlike /api/settings which returns ALL config including API keys,
    this endpoint returns only the language setting.
    """
    config = get_config()
    return {"language": config.language}
