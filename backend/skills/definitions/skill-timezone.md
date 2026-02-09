### timezone — Timezone Lookup

Get timezone and current local time for any location.

**Parameters:**
- `location` (string): City or place name (e.g., "Seoul", "New York", "London")
- OR `lat` + `lon` (number): Coordinates

**Examples:**
```
[SKILL_CALL]{"skill": "timezone", "params": {"location": "New York"}}[/SKILL_CALL]
```
```
[SKILL_CALL]{"skill": "timezone", "params": {"lat": 35.6762, "lon": 139.6503}}[/SKILL_CALL]
```
