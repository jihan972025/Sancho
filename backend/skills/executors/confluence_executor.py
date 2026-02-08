import logging
from base64 import b64encode
from typing import Any

import httpx

from ..base import SkillExecutor

logger = logging.getLogger(__name__)


class ConfluenceExecutor(SkillExecutor):
    name = "confluence"

    def __init__(self, config):
        self._url = config.api.confluence_url.rstrip("/") if config.api.confluence_url else ""
        self._email = config.api.confluence_email
        self._token = config.api.confluence_api_token

    def is_configured(self) -> bool:
        return bool(self._url and self._email and self._token)

    def _auth_header(self) -> dict[str, str]:
        creds = b64encode(f"{self._email}:{self._token}".encode()).decode()
        return {
            "Authorization": f"Basic {creds}",
            "Content-Type": "application/json",
        }

    async def execute(self, params: dict[str, Any]) -> str:
        action = params.get("action", "")
        if action == "search":
            return await self._search(params)
        elif action == "get":
            return await self._get(params)
        else:
            return f"[SKILL_ERROR] Unknown Confluence action: {action}. Use 'search' or 'get'."

    async def _search(self, params: dict[str, Any]) -> str:
        query = params.get("query", "")
        if not query:
            return "[SKILL_ERROR] Missing required parameter: query"
        space = params.get("space", "")
        max_results = params.get("max_results", 10)

        cql = f'text ~ "{query}"'
        if space:
            cql += f' AND space = "{space}"'

        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.get(
                    f"{self._url}/rest/api/content/search",
                    params={"cql": cql, "limit": max_results},
                    headers=self._auth_header(),
                )
                resp.raise_for_status()
                data = resp.json()

            results = data.get("results", [])
            if not results:
                return f"No Confluence pages found for: {query}"

            formatted = []
            for r in results:
                title = r.get("title", "Untitled")
                page_id = r.get("id", "")
                space_key = r.get("space", {}).get("key", "")
                formatted.append(f"- **{title}** (ID: {page_id}, Space: {space_key})")

            return f"Confluence search results ({len(results)} pages):\n\n" + "\n".join(formatted)
        except Exception as e:
            logger.error(f"Confluence search failed: {e}", exc_info=True)
            return f"[SKILL_ERROR] Confluence search failed: {str(e)}"

    async def _get(self, params: dict[str, Any]) -> str:
        page_id = params.get("page_id", "")
        if not page_id:
            return "[SKILL_ERROR] Missing required parameter: page_id"

        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.get(
                    f"{self._url}/rest/api/content/{page_id}",
                    params={"expand": "body.storage,space,version"},
                    headers=self._auth_header(),
                )
                resp.raise_for_status()
                data = resp.json()

            title = data.get("title", "Untitled")
            space_key = data.get("space", {}).get("key", "")
            version = data.get("version", {}).get("number", "?")
            body_html = data.get("body", {}).get("storage", {}).get("value", "No content")

            # Simple HTML tag stripping for readability
            import re
            body_text = re.sub(r"<[^>]+>", "", body_html).strip()
            if len(body_text) > 3000:
                body_text = body_text[:3000] + "\n\n... (truncated)"

            return (
                f"**{title}**\n"
                f"Space: {space_key} | Version: {version}\n\n"
                f"{body_text}"
            )
        except Exception as e:
            logger.error(f"Confluence get failed: {e}", exc_info=True)
            return f"[SKILL_ERROR] Failed to get Confluence page {page_id}: {str(e)}"
