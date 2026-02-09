"""URL shortener skill executor (pyshorteners / TinyURL)."""

import logging
from typing import Any

from ..base import SkillExecutor

logger = logging.getLogger(__name__)


class PyShortenersExecutor(SkillExecutor):
    name = "pyshorteners"

    def __init__(self, config):
        pass

    def is_configured(self) -> bool:
        return True

    async def execute(self, params: dict[str, Any]) -> str:
        url = params.get("url", "")
        if not url:
            return "[SKILL_ERROR] Missing required parameter: url"

        try:
            import pyshorteners
            s = pyshorteners.Shortener()
            short = s.tinyurl.short(url)
            logger.info("URL shortened: %s → %s", url, short)
            return f"**URL Shortened**\n\nOriginal: {url}\nShort: {short}"
        except Exception as e:
            logger.warning("URL shortening failed: %s", e)
            return f"[SKILL_ERROR] URL shortening failed: {str(e)}"
