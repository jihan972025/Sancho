from datetime import datetime, timedelta

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..config import get_config, update_config, OutlookAuthConfig
from ..skills.registry import reset_skills

router = APIRouter(prefix="/api/auth/outlook", tags=["outlook-auth"])

MS_TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token"
MS_GRAPH_ME_URL = "https://graph.microsoft.com/v1.0/me"


class AuthCodeRequest(BaseModel):
    code: str
    redirect_uri: str
    client_id: str
    client_secret: str = ""


@router.post("/exchange")
async def exchange_auth_code(req: AuthCodeRequest):
    """Exchange authorization code for tokens, fetch user info, store in config."""
    data = {
        "client_id": req.client_id,
        "code": req.code,
        "redirect_uri": req.redirect_uri,
        "grant_type": "authorization_code",
        "scope": "openid profile email offline_access Mail.Read Mail.Send User.Read",
    }
    if req.client_secret:
        data["client_secret"] = req.client_secret

    async with httpx.AsyncClient() as client:
        token_resp = await client.post(MS_TOKEN_URL, data=data)

    if token_resp.status_code != 200:
        detail = token_resp.json() if token_resp.headers.get("content-type", "").startswith("application/json") else token_resp.text
        raise HTTPException(status_code=400, detail=f"Token exchange failed: {detail}")

    tokens = token_resp.json()
    access_token = tokens["access_token"]
    refresh_token = tokens.get("refresh_token", "")
    expires_in = tokens.get("expires_in", 3600)
    expiry = (datetime.utcnow() + timedelta(seconds=expires_in)).isoformat()

    # Fetch user info from Microsoft Graph
    async with httpx.AsyncClient() as client:
        userinfo_resp = await client.get(
            MS_GRAPH_ME_URL,
            headers={"Authorization": f"Bearer {access_token}"},
        )

    if userinfo_resp.status_code != 200:
        raise HTTPException(status_code=400, detail="Failed to fetch user info from Microsoft Graph")

    userinfo = userinfo_resp.json()

    # Update config
    config = get_config()
    config.outlook_auth.access_token = access_token
    config.outlook_auth.refresh_token = refresh_token or config.outlook_auth.refresh_token
    config.outlook_auth.token_expiry = expiry
    config.outlook_auth.email = userinfo.get("mail") or userinfo.get("userPrincipalName", "")
    config.outlook_auth.name = userinfo.get("displayName", "")
    config.outlook_auth.logged_in = True
    update_config(config)
    reset_skills()  # Activate Outlook executor

    return {
        "email": config.outlook_auth.email,
        "name": config.outlook_auth.name,
    }


@router.get("/status")
async def auth_status():
    """Return current Outlook auth state."""
    config = get_config()
    oa = config.outlook_auth
    if not oa.logged_in:
        return {"logged_in": False}
    return {
        "logged_in": True,
        "email": oa.email,
        "name": oa.name,
    }


@router.post("/refresh")
async def refresh_access_token():
    """Refresh the access token using stored refresh_token."""
    config = get_config()
    oa = config.outlook_auth
    if not oa.refresh_token:
        raise HTTPException(status_code=400, detail="No refresh token stored")

    client_id = config.api.outlook_client_id
    client_secret = config.api.outlook_client_secret

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
        raise HTTPException(status_code=401, detail="Refresh failed, logged out")

    tokens = resp.json()
    config.outlook_auth.access_token = tokens["access_token"]
    if tokens.get("refresh_token"):
        config.outlook_auth.refresh_token = tokens["refresh_token"]
    expires_in = tokens.get("expires_in", 3600)
    config.outlook_auth.token_expiry = (datetime.utcnow() + timedelta(seconds=expires_in)).isoformat()
    update_config(config)

    return {"status": "ok"}


@router.post("/logout")
async def logout():
    """Clear Outlook auth data from config."""
    config = get_config()
    config.outlook_auth = OutlookAuthConfig()
    update_config(config)
    reset_skills()  # Deactivate Outlook executor
    return {"status": "ok"}
