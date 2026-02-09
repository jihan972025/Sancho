### ipapi — IP Geolocation

Look up geolocation information (country, city, ISP, timezone) from an IP address.

**Parameters:**
- `ip` (string, optional): IP address to look up. Omit to check the server's own IP.

**Examples:**
```
[SKILL_CALL]{"skill": "ipapi", "params": {"ip": "8.8.8.8"}}[/SKILL_CALL]
```
```
[SKILL_CALL]{"skill": "ipapi", "params": {}}[/SKILL_CALL]
```
