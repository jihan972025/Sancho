"""Shared Google OAuth token helper — auto-refresh for Gmail, Calendar, Sheets."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta

import httpx

from .config import get_config, update_config, GoogleAuthConfig

logger = logging.getLogger(__name__)

GOOGLE_CLIENT_ID = "324405890477-dkcl4mncv9q1o2kvkmlg8ob4mcpvadil.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET = "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"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"


class GoogleAuthError(Exception):
    """Raised when Google auth is not available or token refresh fails."""
    pass


async def get_valid_access_token() -> str:
    """Return a valid Google access token, refreshing if necessary."""
    config = get_config()
    ga = config.google_auth

    if not ga.logged_in or not ga.access_token:
        raise GoogleAuthError(
            "Not logged in with Google. Please log in via Settings > Profile."
        )

    # Check if token is expired or about to expire (5-minute buffer)
    if ga.token_expiry:
        try:
            expiry = datetime.fromisoformat(ga.token_expiry)
            if datetime.utcnow() >= expiry - timedelta(minutes=5):
                await _refresh_token()
                config = get_config()
        except ValueError:
            pass  # If expiry is malformed, try with existing token

    return config.google_auth.access_token


async def _refresh_token() -> None:
    """Refresh the access token using stored refresh_token."""
    config = get_config()
    ga = config.google_auth

    if not ga.refresh_token:
        raise GoogleAuthError("No refresh token available. Please re-login via Settings > Profile.")

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            GOOGLE_TOKEN_URL,
            data={
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "refresh_token": ga.refresh_token,
                "grant_type": "refresh_token",
            },
        )

    if resp.status_code != 200:
        config.google_auth = GoogleAuthConfig()
        update_config(config)
        raise GoogleAuthError(
            "Token refresh failed. Your session has expired — please log in again via Settings > Profile."
        )

    tokens = resp.json()
    config.google_auth.access_token = tokens["access_token"]
    expires_in = tokens.get("expires_in", 3600)
    config.google_auth.token_expiry = (
        datetime.utcnow() + timedelta(seconds=expires_in)
    ).isoformat()
    update_config(config)
    logger.info("Google access token refreshed successfully")
