import logging
from typing import Any

import httpx

from ..base import SkillExecutor

logger = logging.getLogger(__name__)


class InfoExecutor(SkillExecutor):
    name = "info"

    def __init__(self, config):
        pass  # No API keys needed

    def is_configured(self) -> bool:
        return True

    async def execute(self, params: dict[str, Any]) -> str:
        action = params.get("action", "")
        if not action:
            return "[SKILL_ERROR] Missing required parameter: action"

        handlers = {
            "country": self._country,
            "holiday": self._holiday,
            "timezone": self._timezone,
            "geocode": self._geocode,
            "ip_lookup": self._ip_lookup,
        }
        handler = handlers.get(action)
        if not handler:
            return f"[SKILL_ERROR] Unknown action: {action}. Available: {', '.join(handlers.keys())}"

        return await handler(params)

    async def _country(self, params: dict[str, Any]) -> str:
        """Get country information from REST Countries API."""
        name = params.get("name", "")
        if not name:
            return "[SKILL_ERROR] Missing parameter: name"
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

    async def _holiday(self, params: dict[str, Any]) -> str:
        """Get public holidays from Nager.Date API."""
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

    async def _timezone(self, params: dict[str, Any]) -> str:
        """Get timezone and current time for a location."""
        location = params.get("location", "")
        lat = params.get("lat")
        lon = params.get("lon")

        try:
            # If location name given, geocode first
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
            from datetime import datetime, timezone as tz
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
                f"Coordinates: ({lat:.4f}, {lon:.4f})",
                f"Timezone: {tz_name}",
                f"Current Time: {now.strftime('%Y-%m-%d %H:%M:%S %Z')}",
                f"UTC Offset: {now.strftime('%z')}",
            ]
            logger.info("Timezone resolved: %s → %s", location or f"({lat},{lon})", tz_name)
            return "\n".join(lines)
        except Exception as e:
            logger.warning("Timezone lookup failed: %s", e)
            return f"[SKILL_ERROR] Timezone lookup failed: {str(e)}"

    async def _geocode(self, params: dict[str, Any]) -> str:
        """Geocode an address or reverse-geocode coordinates."""
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

    async def _ip_lookup(self, params: dict[str, Any]) -> str:
        """Lookup IP address geolocation using ip-api.com."""
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
