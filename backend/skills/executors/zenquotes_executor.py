"""ZenQuotes inspirational quotes skill executor."""

import logging
from typing import Any

import httpx

from ..base import SkillExecutor

logger = logging.getLogger(__name__)


class ZenQuotesExecutor(SkillExecutor):
    name = "zenquotes"

    def __init__(self, config):
        pass

    def is_configured(self) -> bool:
        return True

    async def execute(self, params: dict[str, Any]) -> str:
        mode = params.get("mode", "random")

        try:
            endpoint = "random" if mode != "today" else "today"
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(f"https://zenquotes.io/api/{endpoint}")
                resp.raise_for_status()
                data = resp.json()

            if not data:
                return "No quotes available."

            lines = ["**Inspirational Quote**\n"]
            for q in data[:3]:
                quote_text = q.get("q", "")
                author = q.get("a", "Unknown")
                lines.append(f'> "{quote_text}"\n> — {author}\n')

            logger.info("ZenQuotes fetched: %d quotes", len(data[:3]))
            return "\n".join(lines)
        except Exception as e:
            logger.warning("ZenQuotes fetch failed: %s", e)
            return f"[SKILL_ERROR] Quote fetch failed: {str(e)}"
