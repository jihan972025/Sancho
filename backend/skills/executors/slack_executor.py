import logging
from typing import Any

import httpx

from ..base import SkillExecutor

logger = logging.getLogger(__name__)


class SlackExecutor(SkillExecutor):
    name = "slack"

    def __init__(self, config):
        self._bot_token = config.api.slack_bot_token

    def is_configured(self) -> bool:
        return bool(self._bot_token)

    def _auth_header(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self._bot_token}",
            "Content-Type": "application/json",
        }

    async def execute(self, params: dict[str, Any]) -> str:
        action = params.get("action", "")
        if action == "search":
            return await self._search(params)
        elif action == "channels":
            return await self._channels()
        else:
            return f"[SKILL_ERROR] Unknown Slack action: {action}. Use 'search' or 'channels'."

    async def _search(self, params: dict[str, Any]) -> str:
        query = params.get("query", "")
        if not query:
            return "[SKILL_ERROR] Missing required parameter: query"
        max_results = params.get("max_results", 10)

        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.get(
                    "https://slack.com/api/search.messages",
                    params={"query": query, "count": max_results},
                    headers=self._auth_header(),
                )
                resp.raise_for_status()
                data = resp.json()

            if not data.get("ok"):
                return f"[SKILL_ERROR] Slack API error: {data.get('error', 'Unknown error')}"

            matches = data.get("messages", {}).get("matches", [])
            if not matches:
                return f"No Slack messages found for: {query}"

            formatted = []
            for m in matches:
                user = m.get("username", "Unknown")
                text = m.get("text", "")[:200]
                channel = m.get("channel", {}).get("name", "unknown")
                formatted.append(f"- **#{channel}** @{user}: {text}")

            return f"Slack search results ({len(matches)} messages):\n\n" + "\n".join(formatted)
        except Exception as e:
            logger.error(f"Slack search failed: {e}", exc_info=True)
            return f"[SKILL_ERROR] Slack search failed: {str(e)}"

    async def _channels(self) -> str:
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.get(
                    "https://slack.com/api/conversations.list",
                    params={"types": "public_channel,private_channel", "limit": 100},
                    headers=self._auth_header(),
                )
                resp.raise_for_status()
                data = resp.json()

            if not data.get("ok"):
                return f"[SKILL_ERROR] Slack API error: {data.get('error', 'Unknown error')}"

            channels = data.get("channels", [])
            if not channels:
                return "No channels found."

            formatted = []
            for ch in channels:
                name = ch.get("name", "unnamed")
                purpose = ch.get("purpose", {}).get("value", "")
                member_count = ch.get("num_members", 0)
                line = f"- **#{name}** ({member_count} members)"
                if purpose:
                    line += f" — {purpose[:100]}"
                formatted.append(line)

            return f"Slack channels ({len(channels)}):\n\n" + "\n".join(formatted)
        except Exception as e:
            logger.error(f"Slack channels failed: {e}", exc_info=True)
            return f"[SKILL_ERROR] Failed to list Slack channels: {str(e)}"
