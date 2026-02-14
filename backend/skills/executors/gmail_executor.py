"""Gmail skill executor — search, read, and send emails via Gmail REST API."""

import base64
import logging
from email.message import EmailMessage
from typing import Any

import httpx

from ..base import SkillExecutor
from ...google_token import get_valid_access_token, GoogleAuthError

logger = logging.getLogger(__name__)

GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me"


class GmailExecutor(SkillExecutor):
    name = "gmail"

    def __init__(self, config):
        self._config = config

    def is_configured(self) -> bool:
        return bool(self._config.google_auth.logged_in)

    async def execute(self, params: dict[str, Any]) -> str:
        action = params.get("action", "")

        try:
            token = await get_valid_access_token()
        except GoogleAuthError as e:
            return f"[SKILL_ERROR] {e}"

        headers = {"Authorization": f"Bearer {token}"}

        try:
            if action == "search":
                return await self._search(headers, params)
            elif action == "read":
                return await self._read(headers, params)
            elif action == "send":
                return await self._send(headers, params)
            else:
                return f"[SKILL_ERROR] Unknown action '{action}'. Use: search, read, send"
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 403:
                return (
                    "[SKILL_ERROR] Insufficient permissions. "
                    "Please log out and log back in from Settings > Profile to grant Gmail access."
                )
            return f"[SKILL_ERROR] Gmail API error: {e.response.status_code} {e.response.text[:200]}"
        except Exception as e:
            logger.error("Gmail executor error: %s", e, exc_info=True)
            return f"[SKILL_ERROR] Gmail error: {e}"

    async def _search(self, headers: dict, params: dict) -> str:
        query = params.get("query", "")
        max_results = min(params.get("max_results", 10), 20)

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(
                f"{GMAIL_BASE}/messages",
                headers=headers,
                params={"q": query, "maxResults": max_results},
            )
            resp.raise_for_status()
            data = resp.json()

        messages = data.get("messages", [])
        if not messages:
            return f"No emails found for query: {query}"

        results = []
        async with httpx.AsyncClient(timeout=30) as client:
            for msg in messages[:max_results]:
                msg_resp = await client.get(
                    f"{GMAIL_BASE}/messages/{msg['id']}",
                    headers=headers,
                    params={"format": "metadata", "metadataHeaders": ["From", "To", "Subject", "Date"]},
                )
                msg_resp.raise_for_status()
                msg_data = msg_resp.json()
                h = _extract_headers(msg_data)
                snippet = msg_data.get("snippet", "")
                results.append(
                    f"[{msg['id']}] {h.get('Date', '')} | From: {h.get('From', '')} | "
                    f"Subject: {h.get('Subject', '')} | {snippet[:100]}"
                )

        return f"Found {len(results)} email(s):\n\n" + "\n".join(results)

    async def _read(self, headers: dict, params: dict) -> str:
        message_id = params.get("message_id", "")
        if not message_id:
            return "[SKILL_ERROR] message_id is required for read action"

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(
                f"{GMAIL_BASE}/messages/{message_id}",
                headers=headers,
                params={"format": "full"},
            )
            resp.raise_for_status()
            msg = resp.json()

        h = _extract_headers(msg)
        body = _extract_body(msg.get("payload", {}))

        return (
            f"From: {h.get('From', '')}\n"
            f"To: {h.get('To', '')}\n"
            f"Subject: {h.get('Subject', '')}\n"
            f"Date: {h.get('Date', '')}\n"
            f"---\n{body}"
        )

    async def _send(self, headers: dict, params: dict) -> str:
        to = params.get("to", "")
        subject = params.get("subject", "")
        body = params.get("body", "")

        if not to:
            return "[SKILL_ERROR] 'to' (recipient email) is required for send"
        if not subject:
            return "[SKILL_ERROR] 'subject' is required for send"

        msg = EmailMessage()
        msg["To"] = to
        msg["Subject"] = subject
        msg.set_content(body or "")

        # Gmail API expects base64url-encoded RFC 2822 message
        raw = base64.urlsafe_b64encode(msg.as_bytes()).decode("ascii")

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{GMAIL_BASE}/messages/send",
                headers={**headers, "Content-Type": "application/json"},
                json={"raw": raw},
            )
            resp.raise_for_status()
            result = resp.json()

        return f"Email sent successfully. Message ID: {result.get('id', 'unknown')}"


def _extract_headers(msg_data: dict) -> dict[str, str]:
    """Extract headers from Gmail message metadata."""
    headers = {}
    payload = msg_data.get("payload", {})
    for h in payload.get("headers", []):
        name = h.get("name", "")
        if name in ("From", "To", "Subject", "Date", "Cc", "Bcc"):
            headers[name] = h.get("value", "")
    return headers


def _extract_body(payload: dict) -> str:
    """Extract plain text body from Gmail message payload (handles multipart)."""
    mime_type = payload.get("mimeType", "")

    # Direct text body
    if mime_type == "text/plain":
        data = payload.get("body", {}).get("data", "")
        if data:
            return base64.urlsafe_b64decode(data).decode("utf-8", errors="replace")

    # Multipart — recurse into parts
    parts = payload.get("parts", [])
    if parts:
        # Prefer text/plain
        for part in parts:
            if part.get("mimeType") == "text/plain":
                data = part.get("body", {}).get("data", "")
                if data:
                    return base64.urlsafe_b64decode(data).decode("utf-8", errors="replace")

        # Fall back to text/html (strip tags simply)
        for part in parts:
            if part.get("mimeType") == "text/html":
                data = part.get("body", {}).get("data", "")
                if data:
                    html = base64.urlsafe_b64decode(data).decode("utf-8", errors="replace")
                    return _strip_html(html)

        # Nested multipart
        for part in parts:
            result = _extract_body(part)
            if result:
                return result

    # Direct body data (no parts)
    data = payload.get("body", {}).get("data", "")
    if data:
        return base64.urlsafe_b64decode(data).decode("utf-8", errors="replace")

    return "(No body content)"


def _strip_html(html: str) -> str:
    """Simple HTML tag stripper."""
    import re
    text = re.sub(r"<br\s*/?>", "\n", html, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", "", text)
    text = re.sub(r"&nbsp;", " ", text)
    text = re.sub(r"&amp;", "&", text)
    text = re.sub(r"&lt;", "<", text)
    text = re.sub(r"&gt;", ">", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()
