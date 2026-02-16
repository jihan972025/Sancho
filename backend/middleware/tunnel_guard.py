"""Middleware that restricts which endpoints are accessible via Cloudflare tunnel.

When cloudflared proxies a request, Cloudflare injects a ``CF-Connecting-IP``
header.  Requests arriving directly from localhost (Electron) will NOT have
this header.  We use it to distinguish tunnel traffic and enforce a whitelist.

Security measures:
- Endpoint whitelist: only voice/chat endpoints are exposed
- Request body size limit: prevents memory exhaustion attacks (1 MB max)
- Path traversal prevention: normalizes paths before matching
"""

import logging
from posixpath import normpath
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

logger = logging.getLogger(__name__)

# Paths allowed for external (tunnel) access
ALLOWED_TUNNEL_PATHS: list[tuple[str, str]] = [
    ("GET", "/api/voice/app"),
    ("GET", "/api/voice/info"),
    ("GET", "/api/chat/models"),
    ("POST", "/api/chat/send"),
    ("POST", "/api/conversations"),
    ("GET", "/api/health"),
    ("GET", "/api/voice/config"),  # voice app needs language config (safe — no API keys)
]

# Max request body size for tunnel traffic (1 MB)
MAX_TUNNEL_BODY_SIZE = 1 * 1024 * 1024


def _is_tunnel_request(request: Request) -> bool:
    """Detect if the request came through the Cloudflare tunnel."""
    return "cf-connecting-ip" in request.headers


def _is_allowed(method: str, path: str) -> bool:
    # Normalize path to prevent traversal (e.g., /api/voice/../settings)
    normalized = normpath(path)
    for allowed_method, allowed_path in ALLOWED_TUNNEL_PATHS:
        if method.upper() == allowed_method and normalized.rstrip("/") == allowed_path:
            return True
    return False


class TunnelGuardMiddleware(BaseHTTPMiddleware):
    """Block non-whitelisted endpoints when accessed through the tunnel."""

    async def dispatch(self, request: Request, call_next):
        if _is_tunnel_request(request):
            # Check endpoint whitelist (with path normalization)
            if not _is_allowed(request.method, request.url.path):
                logger.warning(
                    f"[TunnelGuard] Blocked {request.method} {request.url.path} "
                    f"from {request.headers.get('cf-connecting-ip', '?')}"
                )
                return JSONResponse({"detail": "Forbidden"}, status_code=403)

            # Enforce body size limit for tunnel traffic
            content_length = request.headers.get("content-length")
            if content_length and int(content_length) > MAX_TUNNEL_BODY_SIZE:
                logger.warning(
                    f"[TunnelGuard] Body too large ({content_length} bytes) "
                    f"from {request.headers.get('cf-connecting-ip', '?')}"
                )
                return JSONResponse({"detail": "Request too large"}, status_code=413)

        return await call_next(request)
