"""ip-api IP geolocation skill executor."""

import logging
from typing import Any

import httpx

from ..base import SkillExecutor

logger = logging.getLogger(__name__)


class IpApiExecutor(SkillExecutor):
    name = "ipapi"

    def __init__(self, config):
        pass

    def is_configured(self) -> bool:
        return True

    async def execute(self, params: dict[str, Any]) -> str:
        ip = params.get("ip", "")

        try:
            url = f"http://ip-api.com/json/{ip}" if ip else "http://ip-api.com/json/"
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(url)
                resp.raise_for_status()
                data = resp.json()

            if data.get("status") != "success":
                return f"IP lookup failed: {data.get('message', 'Unknown error')}"

            lines = [
                f"**IP Geolocation{' — ' + data.get('query', '') if data.get('query') else ''}**\n",
                f"Country: {data.get('country', 'N/A')} ({data.get('countryCode', '')})",
                f"Region: {data.get('regionName', 'N/A')}",
                f"City: {data.get('city', 'N/A')}",
                f"ZIP: {data.get('zip', 'N/A')}",
                f"Coordinates: ({data.get('lat', 'N/A')}, {data.get('lon', 'N/A')})",
                f"Timezone: {data.get('timezone', 'N/A')}",
                f"ISP: {data.get('isp', 'N/A')}",
                f"Organization: {data.get('org', 'N/A')}",
            ]
            logger.info("ip-api lookup: %s → %s, %s", data.get("query"), data.get("city"), data.get("country"))
            return "\n".join(lines)
        except Exception as e:
            logger.warning("ip-api lookup failed: %s", e)
            return f"[SKILL_ERROR] IP lookup failed: {str(e)}"
