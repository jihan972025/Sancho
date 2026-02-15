"""Timezone lookup skill executor."""

import logging
from typing import Any

from ..base import SkillExecutor

logger = logging.getLogger(__name__)


class TimezoneExecutor(SkillExecutor):
    name = "timezone"

    def __init__(self, config):
        pass

    def is_configured(self) -> bool:
        return True

    async def execute(self, params: dict[str, Any]) -> str:
        location = params.get("location", "")
        lat = params.get("lat")
        lon = params.get("lon")

        try:
            if location and (lat is None or lon is None):
                from geopy.geocoders import Nominatim
                geolocator = Nominatim(user_agent="sancho", timeout=10)
                geo = geolocator.geocode(location)
                if not geo:
                    return f"Could not find location: {location}"
                lat, lon = geo.latitude, geo.longitude

            if lat is None or lon is None:
                return "[SKILL_ERROR] Provide location name or lat/lon coordinates."

            import httpx
            from datetime import datetime
            import zoneinfo

            # Use free timeapi.io to get timezone from coordinates
            resp = httpx.get(
                f"https://timeapi.io/api/timezone/coordinate?latitude={lat}&longitude={lon}",
                timeout=10,
            )
            resp.raise_for_status()
            tz_name = resp.json().get("timeZone")
            if not tz_name:
                return f"Could not determine timezone for ({lat}, {lon})"

            zone = zoneinfo.ZoneInfo(tz_name)
            now = datetime.now(zone)

            lines = [
                f"**Timezone Info{' — ' + location if location else ''}**\n",
                f"Coordinates: ({float(lat):.4f}, {float(lon):.4f})",
                f"Timezone: {tz_name}",
                f"Current Time: {now.strftime('%Y-%m-%d %H:%M:%S %Z')}",
                f"UTC Offset: {now.strftime('%z')}",
            ]
            logger.info("Timezone resolved: %s → %s", location or f"({lat},{lon})", tz_name)
            return "\n".join(lines)
        except Exception as e:
            logger.warning("Timezone lookup failed: %s", e)
            return f"[SKILL_ERROR] Timezone lookup failed: {str(e)}"
