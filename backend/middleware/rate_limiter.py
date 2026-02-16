"""Simple in-memory rate limiter for tunnel-exposed endpoints.

Limits requests per IP address using a sliding window counter.
Only applied to requests coming through the Cloudflare tunnel
(detected by CF-Connecting-IP header).
"""

import time
import logging
from collections import defaultdict
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

logger = logging.getLogger(__name__)

# Rate limit: max requests per window (seconds)
RATE_LIMIT = 30            # max requests
RATE_WINDOW = 60           # per 60 seconds
CLEANUP_INTERVAL = 300     # clean stale entries every 5 minutes

# In-memory store: {ip: [(timestamp, ...), ...]}
_request_log: dict[str, list[float]] = defaultdict(list)
_last_cleanup: float = 0


def _cleanup_stale() -> None:
    """Remove entries older than 2x the window to prevent memory leak."""
    global _last_cleanup
    now = time.time()
    if now - _last_cleanup < CLEANUP_INTERVAL:
        return
    _last_cleanup = now
    cutoff = now - RATE_WINDOW * 2
    stale_ips = [ip for ip, ts_list in _request_log.items() if not ts_list or ts_list[-1] < cutoff]
    for ip in stale_ips:
        del _request_log[ip]


def _is_rate_limited(ip: str) -> bool:
    """Check if the IP has exceeded the rate limit."""
    now = time.time()
    cutoff = now - RATE_WINDOW

    # Remove old entries for this IP
    timestamps = _request_log[ip]
    _request_log[ip] = [t for t in timestamps if t > cutoff]

    if len(_request_log[ip]) >= RATE_LIMIT:
        return True

    _request_log[ip].append(now)
    return False


class TunnelRateLimitMiddleware(BaseHTTPMiddleware):
    """Rate-limit requests arriving through the Cloudflare tunnel."""

    async def dispatch(self, request: Request, call_next):
        # Only rate-limit tunnel traffic (has CF-Connecting-IP header)
        cf_ip = request.headers.get("cf-connecting-ip")
        if cf_ip:
            _cleanup_stale()
            if _is_rate_limited(cf_ip):
                logger.warning(f"[RateLimit] Blocked {request.method} {request.url.path} from {cf_ip}")
                return JSONResponse(
                    {"detail": "Too many requests. Please try again later."},
                    status_code=429,
                    headers={"Retry-After": str(RATE_WINDOW)},
                )
        return await call_next(request)
