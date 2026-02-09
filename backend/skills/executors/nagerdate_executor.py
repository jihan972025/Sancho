"""Nager.Date public holidays skill executor."""

import logging
from typing import Any

import httpx

from ..base import SkillExecutor

logger = logging.getLogger(__name__)


class NagerDateExecutor(SkillExecutor):
    name = "nagerdate"

    def __init__(self, config):
        pass

    def is_configured(self) -> bool:
        return True

    async def execute(self, params: dict[str, Any]) -> str:
        country_code = params.get("country_code", "KR")
        year = params.get("year", 2026)

        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(
                    f"https://date.nager.at/api/v3/PublicHolidays/{year}/{country_code}"
                )
                resp.raise_for_status()
                holidays = resp.json()

            if not holidays:
                return f"No public holidays found for {country_code} in {year}."

            lines = [f"**Public Holidays — {country_code} ({year})**\n"]
            lines.append(f"{'Date':<12} {'Name':<30} {'Local Name'}")
            lines.append("-" * 70)
            for h in holidays:
                lines.append(
                    f"{h['date']:<12} {h.get('name', ''):<30} {h.get('localName', '')}"
                )

            logger.info("Nager.Date holidays fetched: %s/%s, %d items", country_code, year, len(holidays))
            return "\n".join(lines)
        except Exception as e:
            logger.warning("Nager.Date failed for '%s/%s': %s", country_code, year, e)
            return f"[SKILL_ERROR] Holiday lookup failed: {str(e)}"
