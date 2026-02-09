"""REST Countries skill executor."""

import logging
from typing import Any

import httpx

from ..base import SkillExecutor

logger = logging.getLogger(__name__)


class RestCountriesExecutor(SkillExecutor):
    name = "restcountries"

    def __init__(self, config):
        pass

    def is_configured(self) -> bool:
        return True

    async def execute(self, params: dict[str, Any]) -> str:
        name = params.get("name", "")
        if not name:
            return "[SKILL_ERROR] Missing required parameter: name"

        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(f"https://restcountries.com/v3.1/name/{name}")
                resp.raise_for_status()
                data = resp.json()

            c = data[0]
            common = c.get("name", {}).get("common", name)
            official = c.get("name", {}).get("official", "")
            capital = ", ".join(c.get("capital", ["N/A"]))
            population = c.get("population", 0)
            region = c.get("region", "N/A")
            subregion = c.get("subregion", "N/A")
            languages = ", ".join(c.get("languages", {}).values()) if c.get("languages") else "N/A"
            currencies_raw = c.get("currencies", {})
            currencies = ", ".join(
                f"{v.get('name', k)} ({v.get('symbol', '')})" for k, v in currencies_raw.items()
            ) if currencies_raw else "N/A"
            area = c.get("area", 0)
            timezones = ", ".join(c.get("timezones", []))
            borders = ", ".join(c.get("borders", [])) or "None (island/isolated)"

            lines = [
                f"**{common}** ({official})\n",
                f"Capital: {capital}",
                f"Population: {population:,}",
                f"Area: {area:,.0f} km²",
                f"Region: {region} / {subregion}",
                f"Languages: {languages}",
                f"Currencies: {currencies}",
                f"Timezones: {timezones}",
                f"Borders: {borders}",
            ]
            logger.info("REST Countries fetched: %s", common)
            return "\n".join(lines)
        except Exception as e:
            logger.warning("REST Countries failed for '%s': %s", name, e)
            return f"[SKILL_ERROR] Country lookup failed: {str(e)}"
