from datetime import datetime, timedelta

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..config import get_config, update_config, GoogleAuthConfig
from ..skills.registry import reset_skills

router = APIRouter(prefix="/api/auth/google", tags=["google-auth"])

# Google OAuth constants (app-level, shared by all users)
GOOGLE_CLIENT_ID = "324405890477-dkcl4mncv9q1o2kvkmlg8ob4mcpvadil.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET = "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"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"


class AuthCodeRequest(BaseModel):
    code: str
    redirect_uri: str


@router.post("/exchange")
async def exchange_auth_code(req: AuthCodeRequest):
    """Exchange authorization code for tokens, fetch user info, store in config."""
    async with httpx.AsyncClient() as client:
        token_resp = await client.post(
            GOOGLE_TOKEN_URL,
            data={
                "code": req.code,
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "redirect_uri": req.redirect_uri,
                "grant_type": "authorization_code",
            },
        )

    if token_resp.status_code != 200:
        detail = token_resp.json() if token_resp.headers.get("content-type", "").startswith("application/json") else token_resp.text
        raise HTTPException(status_code=400, detail=f"Token exchange failed: {detail}")

    tokens = token_resp.json()
    access_token = tokens["access_token"]
    refresh_token = tokens.get("refresh_token", "")
    expires_in = tokens.get("expires_in", 3600)
    expiry = (datetime.utcnow() + timedelta(seconds=expires_in)).isoformat()

    # Fetch user info
    async with httpx.AsyncClient() as client:
        userinfo_resp = await client.get(
            GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"},
        )

    if userinfo_resp.status_code != 200:
        raise HTTPException(status_code=400, detail="Failed to fetch user info")

    userinfo = userinfo_resp.json()

    # Update config
    config = get_config()
    config.google_auth.access_token = access_token
    config.google_auth.refresh_token = refresh_token or config.google_auth.refresh_token
    config.google_auth.token_expiry = expiry
    config.google_auth.email = userinfo.get("email", "")
    config.google_auth.name = userinfo.get("name", "")
    config.google_auth.picture_url = userinfo.get("picture", "")
    config.google_auth.logged_in = True
    update_config(config)
    reset_skills()  # Activate Gmail/Calendar/Sheets executors

    return {
        "email": config.google_auth.email,
        "name": config.google_auth.name,
        "picture_url": config.google_auth.picture_url,
    }


@router.get("/status")
async def auth_status():
    """Return current Google auth state."""
    config = get_config()
    ga = config.google_auth
    if not ga.logged_in:
        return {"logged_in": False}
    return {
        "logged_in": True,
        "email": ga.email,
        "name": ga.name,
        "picture_url": ga.picture_url,
    }


@router.post("/refresh")
async def refresh_access_token():
    """Refresh the access token using stored refresh_token."""
    config = get_config()
    ga = config.google_auth
    if not ga.refresh_token:
        raise HTTPException(status_code=400, detail="No refresh token stored")

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
        # Token expired or revoked — force logout
        config.google_auth = GoogleAuthConfig()
        update_config(config)
        raise HTTPException(status_code=401, detail="Refresh failed, logged out")

    tokens = resp.json()
    config.google_auth.access_token = tokens["access_token"]
    expires_in = tokens.get("expires_in", 3600)
    config.google_auth.token_expiry = (datetime.utcnow() + timedelta(seconds=expires_in)).isoformat()
    update_config(config)

    return {"status": "ok"}


@router.post("/logout")
async def logout():
    """Clear Google auth data from config."""
    config = get_config()
    config.google_auth = GoogleAuthConfig()
    update_config(config)
    reset_skills()  # Deactivate Gmail/Calendar/Sheets executors
    return {"status": "ok"}
