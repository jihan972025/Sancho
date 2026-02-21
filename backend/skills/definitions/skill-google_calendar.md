### google_calendar — Google Calendar

Create, search, delete, and manage Google Calendar events.

**Parameters:**
- `action` (string, required): One of "list", "create", "search", "delete"
- `query` (string, for search): Search query for events
- `timeMin` (string, optional): Start of time range (ISO 8601, e.g. "2026-02-18T00:00:00+09:00"). For list: defaults to now. For search: defaults to 2020-01-01.
- `timeMax` (string, optional): End of time range (ISO 8601, e.g. "2026-02-19T00:00:00+09:00"). If omitted, no upper bound.
- `summary` (string, for create): Event title
- `start` (string, for create): Start datetime (ISO 8601)
- `end` (string, for create): End datetime (ISO 8601)
- `timeZone` (string, for create, optional): IANA timezone (e.g. "Asia/Seoul"). Auto-detected from user profile if omitted.
- `location` (string, for create, optional): Event location
- `description` (string, for create, optional): Event description
- `event_id` (string, for delete): Single event ID to delete
- `event_ids` (array of strings, for delete): Multiple event IDs to delete
- `max_results` (integer, optional, default: 10): Max results for list/search

**Important:** When the user asks about events on a specific date, always use `timeMin` and `timeMax` to define the exact date range. For example, to get events on Feb 18, set `timeMin` to the start of that day and `timeMax` to the start of the next day.

**Deleting events:** To delete events, you can either:
1. Provide specific `event_id` or `event_ids` (obtained from a previous list/search result)
2. Provide a `timeMin`+`timeMax` date range to delete ALL events in that range
3. First list events to get their IDs, then delete specific ones by ID

When deleting by date range, all events in that range will be deleted. Each event in list/search results includes an `[event_id]` prefix you can use.

**Examples:**
```
[SKILL_CALL]{"skill": "google_calendar", "params": {"action": "list", "max_results": 5}}[/SKILL_CALL]
```
```
[SKILL_CALL]{"skill": "google_calendar", "params": {"action": "list", "timeMin": "2026-02-18T00:00:00+09:00", "timeMax": "2026-02-19T00:00:00+09:00"}}[/SKILL_CALL]
```
```
[SKILL_CALL]{"skill": "google_calendar", "params": {"action": "search", "query": "team meeting"}}[/SKILL_CALL]
```
```
[SKILL_CALL]{"skill": "google_calendar", "params": {"action": "search", "query": "meeting", "timeMin": "2026-02-01T00:00:00+09:00", "timeMax": "2026-03-01T00:00:00+09:00"}}[/SKILL_CALL]
```
```
[SKILL_CALL]{"skill": "google_calendar", "params": {"action": "create", "summary": "Team Standup", "start": "2026-02-09T10:00:00", "end": "2026-02-09T10:30:00"}}[/SKILL_CALL]
```
```
[SKILL_CALL]{"skill": "google_calendar", "params": {"action": "delete", "timeMin": "2026-02-23T00:00:00+09:00", "timeMax": "2026-02-24T00:00:00+09:00"}}[/SKILL_CALL]
```
```
[SKILL_CALL]{"skill": "google_calendar", "params": {"action": "delete", "event_id": "abc123def456"}}[/SKILL_CALL]
```
```
[SKILL_CALL]{"skill": "google_calendar", "params": {"action": "delete", "event_ids": ["abc123", "def456"]}}[/SKILL_CALL]
```
