"""wttr.in weather skill executor."""

import logging
from typing import Any

from ..base import SkillExecutor
from ._data_helpers import fetch_weather

logger = logging.getLogger(__name__)


class WttrExecutor(SkillExecutor):
    name = "wttr"

    def __init__(self, config):
        pass

    def is_configured(self) -> bool:
        return True

    async def execute(self, params: dict[str, Any]) -> str:
        location = params.get("location", "")
        if not location:
            return "[SKILL_ERROR] Missing required parameter: location"
        result = await fetch_weather(location)
        return result if result else f"[SKILL_ERROR] Could not fetch weather for: {location}"
