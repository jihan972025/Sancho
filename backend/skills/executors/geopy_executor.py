"""Geopy geocoding skill executor."""

import logging
from typing import Any

from ..base import SkillExecutor

logger = logging.getLogger(__name__)


class GeopyExecutor(SkillExecutor):
    name = "geopy"

    def __init__(self, config):
        pass

    def is_configured(self) -> bool:
        return True

    async def execute(self, params: dict[str, Any]) -> str:
        address = params.get("address", "")
        lat = params.get("lat")
        lon = params.get("lon")

        try:
            from geopy.geocoders import Nominatim
            geolocator = Nominatim(user_agent="sancho", timeout=10)

            if address:
                location = geolocator.geocode(address, addressdetails=True)
                if not location:
                    return f"Could not geocode: {address}"
                lines = [
                    f"**Geocoding: '{address}'**\n",
                    f"Address: {location.address}",
                    f"Latitude: {location.latitude:.6f}",
                    f"Longitude: {location.longitude:.6f}",
                ]
                logger.info("Geocoded '%s' → (%s, %s)", address, location.latitude, location.longitude)
                return "\n".join(lines)
            elif lat is not None and lon is not None:
                location = geolocator.reverse(f"{lat}, {lon}")
                if not location:
                    return f"Could not reverse geocode: ({lat}, {lon})"
                lines = [
                    f"**Reverse Geocoding: ({lat}, {lon})**\n",
                    f"Address: {location.address}",
                ]
                logger.info("Reverse geocoded (%s, %s) → %s", lat, lon, location.address)
                return "\n".join(lines)
            else:
                return "[SKILL_ERROR] Provide 'address' or 'lat'+'lon' parameters."
        except Exception as e:
            logger.warning("Geocoding failed: %s", e)
            return f"[SKILL_ERROR] Geocoding failed: {str(e)}"
