"""Outlook skill executor — search, read, and send emails via Microsoft Graph API."""

import logging
import re
from typing import Any

import httpx

from ..base import SkillExecutor
from ...outlook_token import get_valid_access_token, OutlookAuthError

logger = logging.getLogger(__name__)

GRAPH_BASE = "https://graph.microsoft.com/v1.0/me"


class OutlookExecutor(SkillExecutor):
    name = "outlook"

    def __init__(self, config):
        self._config = config

    def is_configured(self) -> bool:
        return bool(self._config.outlook_auth.logged_in)

    async def execute(self, params: dict[str, Any]) -> str:
        action = params.get("action", "")

        try:
            token = await get_valid_access_token()
        except OutlookAuthError as e:
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
                    "Please log out and log back in from Settings > Profile to grant Outlook access."
                )
            body = e.response.text[:300]
            if e.response.status_code == 400:
                return f"[SKILL_ERROR] Bad request (400). Details: {body}"
            return f"[SKILL_ERROR] Outlook API error: {e.response.status_code} {body}"
        except Exception as e:
            logger.error("Outlook executor error: %s", e, exc_info=True)
            return f"[SKILL_ERROR] Outlook error: {e}"

    async def _search(self, headers: dict, params: dict) -> str:
        query = params.get("query", "")
        max_results = min(params.get("max_results", 10), 20)

        query_params: dict[str, Any] = {
            "$top": max_results,
            "$select": "id,subject,from,receivedDateTime,bodyPreview",
            "$orderby": "receivedDateTime desc",
        }
        if query:
            query_params["$search"] = f'"{query}"'

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(
                f"{GRAPH_BASE}/messages",
                headers=headers,
                params=query_params,
            )
            resp.raise_for_status()
            data = resp.json()

        messages = data.get("value", [])
        if not messages:
            return f"No emails found for query: {query}" if query else "No emails found."

        results = []
        for msg in messages:
            msg_id = msg.get("id", "")
            subject = msg.get("subject", "(No subject)")
            from_info = msg.get("from", {}).get("emailAddress", {})
            from_str = f"{from_info.get('name', '')} <{from_info.get('address', '')}>"
            date = msg.get("receivedDateTime", "")
            preview = msg.get("bodyPreview", "")[:100]
            results.append(
                f"[{msg_id}] {date} | From: {from_str} | Subject: {subject} | {preview}"
            )

        return f"Found {len(results)} email(s):\n\n" + "\n".join(results)

    async def _read(self, headers: dict, params: dict) -> str:
        message_id = params.get("message_id", "")
        if not message_id:
            return "[SKILL_ERROR] message_id is required for read action"

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(
                f"{GRAPH_BASE}/messages/{message_id}",
                headers=headers,
                params={"$select": "subject,from,toRecipients,ccRecipients,receivedDateTime,body"},
            )
            resp.raise_for_status()
            msg = resp.json()

        subject = msg.get("subject", "(No subject)")
        from_info = msg.get("from", {}).get("emailAddress", {})
        from_str = f"{from_info.get('name', '')} <{from_info.get('address', '')}>"

        to_list = msg.get("toRecipients", [])
        to_str = ", ".join(
            f"{r.get('emailAddress', {}).get('name', '')} <{r.get('emailAddress', {}).get('address', '')}>"
            for r in to_list
        )

        cc_list = msg.get("ccRecipients", [])
        cc_str = ", ".join(
            f"{r.get('emailAddress', {}).get('name', '')} <{r.get('emailAddress', {}).get('address', '')}>"
            for r in cc_list
        ) if cc_list else ""

        date = msg.get("receivedDateTime", "")
        body_obj = msg.get("body", {})
        body_content = body_obj.get("content", "")
        content_type = body_obj.get("contentType", "text")

        # Strip HTML if content is HTML
        if content_type.lower() == "html":
            body_content = _strip_html(body_content)

        result = (
            f"From: {from_str}\n"
            f"To: {to_str}\n"
        )
        if cc_str:
            result += f"Cc: {cc_str}\n"
        result += (
            f"Subject: {subject}\n"
            f"Date: {date}\n"
            f"---\n{body_content}"
        )
        return result

    async def _send(self, headers: dict, params: dict) -> str:
        to = params.get("to", "")
        subject = params.get("subject", "")
        body = params.get("body", "")

        if not to:
            return "[SKILL_ERROR] 'to' (recipient email) is required for send"
        if not subject:
            return "[SKILL_ERROR] 'subject' is required for send"

        # Build Microsoft Graph sendMail payload
        message = {
            "subject": subject,
            "body": {
                "contentType": "Text",
                "content": body or "",
            },
            "toRecipients": [
                {"emailAddress": {"address": addr.strip()}}
                for addr in to.split(",")
            ],
        }

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{GRAPH_BASE}/sendMail",
                headers={**headers, "Content-Type": "application/json"},
                json={"message": message, "saveToSentItems": True},
            )
            resp.raise_for_status()

        return f"Email sent successfully to {to}."


def _strip_html(html: str) -> str:
    """Simple HTML tag stripper."""
    text = re.sub(r"<br\s*/?>", "\n", html, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", "", text)
    text = re.sub(r"&nbsp;", " ", text)
    text = re.sub(r"&amp;", "&", text)
    text = re.sub(r"&lt;", "<", text)
    text = re.sub(r"&gt;", ">", text)
    text = re.sub(r"&quot;", '"', text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()
