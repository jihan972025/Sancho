"""Microsoft Outlook OAuth token helper — auto-refresh for Outlook Mail."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta

import httpx

from .config import get_config, update_config, OutlookAuthConfig

logger = logging.getLogger(__name__)

MS_TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token"


class OutlookAuthError(Exception):
    """Raised when Outlook auth is not available or token refresh fails."""
    pass


async def get_valid_access_token() -> str:
    """Return a valid Outlook access token, refreshing if necessary."""
    config = get_config()
    oa = config.outlook_auth

    if not oa.logged_in or not oa.access_token:
        raise OutlookAuthError(
            "Not logged in with Microsoft. Please log in via Settings > Profile."
        )

    # Check if token is expired or about to expire (5-minute buffer)
    if oa.token_expiry:
        try:
            expiry = datetime.fromisoformat(oa.token_expiry)
            if datetime.utcnow() >= expiry - timedelta(minutes=5):
                await _refresh_token()
                config = get_config()
        except ValueError:
            pass  # If expiry is malformed, try with existing token

    return config.outlook_auth.access_token


async def _refresh_token() -> None:
    """Refresh the access token using stored refresh_token."""
    config = get_config()
    oa = config.outlook_auth

    if not oa.refresh_token:
        raise OutlookAuthError("No refresh token available. Please re-login via Settings > Profile.")

    client_id = config.api.outlook_client_id
    client_secret = config.api.outlook_client_secret

    if not client_id:
        raise OutlookAuthError("Outlook Client ID is not configured. Set it in Settings > API.")

    data = {
        "client_id": client_id,
        "refresh_token": oa.refresh_token,
        "grant_type": "refresh_token",
        "scope": "openid profile email offline_access Mail.Read Mail.Send User.Read",
    }
    if client_secret:
        data["client_secret"] = client_secret

    async with httpx.AsyncClient() as client:
        resp = await client.post(MS_TOKEN_URL, data=data)

    if resp.status_code != 200:
        config.outlook_auth = OutlookAuthConfig()
        update_config(config)
        raise OutlookAuthError(
            "Token refresh failed. Your session has expired — please log in again via Settings > Profile."
        )

    tokens = resp.json()
    config.outlook_auth.access_token = tokens["access_token"]
    if tokens.get("refresh_token"):
        config.outlook_auth.refresh_token = tokens["refresh_token"]
    expires_in = tokens.get("expires_in", 3600)
    config.outlook_auth.token_expiry = (
        datetime.utcnow() + timedelta(seconds=expires_in)
    ).isoformat()
    update_config(config)
    logger.info("Outlook access token refreshed successfully")
