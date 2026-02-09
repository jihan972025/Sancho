"""USGS earthquake data skill executor."""

import logging
from typing import Any

from ..base import SkillExecutor
from ._data_helpers import fetch_earthquake

logger = logging.getLogger(__name__)


class UsgsExecutor(SkillExecutor):
    name = "usgs"

    def __init__(self, config):
        pass

    def is_configured(self) -> bool:
        return True

    async def execute(self, params: dict[str, Any]) -> str:
        result = await fetch_earthquake()
        return result if result else "[SKILL_ERROR] Could not fetch earthquake data."
