### info — Location, Country, Holiday, Timezone & IP Lookup

Get country details, public holidays, timezone info, geocoding, and IP geolocation.

**Parameters:**
- `action` (string, required): One of `country`, `holiday`, `timezone`, `geocode`, `ip_lookup`

**Action: `country`** — Get country information
- `name` (string, required): Country name (e.g., "South Korea", "Japan")

**Action: `holiday`** — Get public holidays
- `country_code` (string, optional, default: "KR"): ISO 3166-1 alpha-2 code
- `year` (integer, optional, default: 2026): Year

**Action: `timezone`** — Get timezone and current time
- `location` (string): City or place name (e.g., "Seoul", "New York")
- OR `lat`/`lon` (number): Coordinates

**Action: `geocode`** — Address ↔ coordinates
- `address` (string): Address to geocode
- OR `lat`/`lon` (number): Coordinates to reverse-geocode

**Action: `ip_lookup`** — IP geolocation
- `ip` (string, optional): IP address (omit for current server IP)

**Examples:**
```
[SKILL_CALL]{"skill": "info", "params": {"action": "country", "name": "South Korea"}}[/SKILL_CALL]
```
```
[SKILL_CALL]{"skill": "info", "params": {"action": "holiday", "country_code": "KR", "year": 2026}}[/SKILL_CALL]
```
```
[SKILL_CALL]{"skill": "info", "params": {"action": "timezone", "location": "New York"}}[/SKILL_CALL]
```
```
[SKILL_CALL]{"skill": "info", "params": {"action": "geocode", "address": "Gangnam Station, Seoul"}}[/SKILL_CALL]
```
```
[SKILL_CALL]{"skill": "info", "params": {"action": "ip_lookup", "ip": "8.8.8.8"}}[/SKILL_CALL]
```
