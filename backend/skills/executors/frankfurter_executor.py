"""Frankfurter exchange rate skill executor."""

import logging
from typing import Any

import httpx

from ..base import SkillExecutor

logger = logging.getLogger(__name__)


class FrankfurterExecutor(SkillExecutor):
    name = "frankfurter"

    def __init__(self, config):
        pass

    def is_configured(self) -> bool:
        return True

    async def execute(self, params: dict[str, Any]) -> str:
        base = params.get("base", "USD")
        targets = params.get("targets", "")

        try:
            req_params: dict[str, str] = {"base": base.upper()}
            if targets:
                req_params["symbols"] = targets.upper()

            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(
                    "https://api.frankfurter.dev/v1/latest",
                    params=req_params,
                )
                resp.raise_for_status()
                data = resp.json()

            lines = [f"**Exchange Rates** (Base: {data['base']}, Date: {data['date']})\n"]
            for currency, rate in data.get("rates", {}).items():
                lines.append(f"  1 {data['base']} = {rate:,.4f} {currency}")

            logger.info("Frankfurter exchange rates fetched: base=%s", base)
            return "\n".join(lines)
        except Exception as e:
            logger.warning("Frankfurter fetch failed: %s", e)
            return f"[SKILL_ERROR] Exchange rate lookup failed: {str(e)}"
