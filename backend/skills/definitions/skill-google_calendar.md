### google_calendar — Google Calendar

Create, search, and manage Google Calendar events.

**Parameters:**
- `action` (string, required): One of "list", "create", "search"
- `query` (string, for search): Search query for events
- `summary` (string, for create): Event title
- `start` (string, for create): Start datetime (ISO 8601)
- `end` (string, for create): End datetime (ISO 8601)
- `max_results` (integer, optional, default: 10): Max results for list/search

**Examples:**
```
[SKILL_CALL]{"skill": "google_calendar", "params": {"action": "list", "max_results": 5}}[/SKILL_CALL]
```
```
[SKILL_CALL]{"skill": "google_calendar", "params": {"action": "search", "query": "team meeting"}}[/SKILL_CALL]
```
```
[SKILL_CALL]{"skill": "google_calendar", "params": {"action": "create", "summary": "Team Standup", "start": "2026-02-09T10:00:00", "end": "2026-02-09T10:30:00"}}[/SKILL_CALL]
```
