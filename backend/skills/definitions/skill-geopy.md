### geopy — Geocoding

Convert addresses to coordinates (geocoding) or coordinates to addresses (reverse geocoding) using OpenStreetMap.

**Parameters:**
- `address` (string): Address to geocode (e.g., "Gangnam Station, Seoul")
- OR `lat` + `lon` (number): Coordinates to reverse-geocode

**Examples:**
```
[SKILL_CALL]{"skill": "geopy", "params": {"address": "Eiffel Tower, Paris"}}[/SKILL_CALL]
```
```
[SKILL_CALL]{"skill": "geopy", "params": {"lat": 37.4979, "lon": 127.0276}}[/SKILL_CALL]
```
