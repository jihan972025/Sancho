"""Google Calendar skill executor — list, search, create, delete events via REST API."""

import logging
from datetime import datetime, timezone
from typing import Any

import httpx

from ..base import SkillExecutor
from ...google_token import get_valid_access_token, GoogleAuthError

logger = logging.getLogger(__name__)

CALENDAR_BASE = "https://www.googleapis.com/calendar/v3/calendars/primary/events"


class GoogleCalendarExecutor(SkillExecutor):
    name = "google_calendar"

    def __init__(self, config):
        self._config = config

    def is_configured(self) -> bool:
        return bool(self._config.google_auth.logged_in)

    async def execute(self, params: dict[str, Any]) -> str:
        action = params.get("action", "")

        try:
            token = await get_valid_access_token()
        except GoogleAuthError as e:
            return f"[SKILL_ERROR] {e}"

        headers = {"Authorization": f"Bearer {token}"}

        try:
            if action == "list":
                return await self._list_events(headers, params)
            elif action == "search":
                return await self._search_events(headers, params)
            elif action == "create":
                return await self._create_event(headers, params)
            elif action == "delete":
                return await self._delete_events(headers, params)
            else:
                return f"[SKILL_ERROR] Unknown action '{action}'. Use: list, search, create, delete"
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 403:
                return (
                    "[SKILL_ERROR] Insufficient permissions. "
                    "Please log out and log back in from Settings > Profile to grant Calendar access."
                )
            body = e.response.text[:300]
            if e.response.status_code == 400:
                return (
                    f"[SKILL_ERROR] Bad request (400). Check datetime format (ISO 8601 with timezone). "
                    f"Details: {body}"
                )
            return f"[SKILL_ERROR] Calendar API error: {e.response.status_code} {body}"
        except Exception as e:
            logger.error("Calendar executor error: %s", e, exc_info=True)
            return f"[SKILL_ERROR] Calendar error: {e}"

    async def _list_events(self, headers: dict, params: dict) -> str:
        max_results = min(params.get("max_results", 10), 50)
        time_min = params.get("timeMin") or params.get("time_min") or datetime.now(timezone.utc).isoformat()
        time_max = params.get("timeMax") or params.get("time_max") or ""

        query_params: dict[str, Any] = {
            "maxResults": max_results,
            "timeMin": time_min,
            "orderBy": "startTime",
            "singleEvents": "true",
        }
        if time_max:
            query_params["timeMax"] = time_max

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(
                CALENDAR_BASE,
                headers=headers,
                params=query_params,
            )
            resp.raise_for_status()
            data = resp.json()

        events = data.get("items", [])
        if not events:
            return "No events found in the specified range."

        return f"Found {len(events)} event(s):\n\n" + "\n".join(
            _format_event(e) for e in events
        )

    async def _search_events(self, headers: dict, params: dict) -> str:
        query = params.get("query", "")
        max_results = min(params.get("max_results", 10), 50)
        time_min = params.get("timeMin") or params.get("time_min") or "2020-01-01T00:00:00Z"
        time_max = params.get("timeMax") or params.get("time_max") or ""

        query_params: dict[str, Any] = {
            "q": query,
            "maxResults": max_results,
            "orderBy": "startTime",
            "singleEvents": "true",
            "timeMin": time_min,
        }
        if time_max:
            query_params["timeMax"] = time_max

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(
                CALENDAR_BASE,
                headers=headers,
                params=query_params,
            )
            resp.raise_for_status()
            data = resp.json()

        events = data.get("items", [])
        if not events:
            return f"No events found for: {query}"

        return f"Found {len(events)} event(s) for '{query}':\n\n" + "\n".join(
            _format_event(e) for e in events
        )

    async def _create_event(self, headers: dict, params: dict) -> str:
        summary = params.get("summary", "")
        start = params.get("start", "")
        end = params.get("end", "")
        tz = params.get("timeZone", "") or params.get("timezone", "")

        if not summary:
            return "[SKILL_ERROR] 'summary' (event title) is required"
        if not start:
            return "[SKILL_ERROR] 'start' datetime is required (ISO 8601)"
        if not end:
            return "[SKILL_ERROR] 'end' datetime is required (ISO 8601)"

        # Resolve timezone: from params, USER.md, or fallback
        if not tz:
            tz = _resolve_user_timezone()

        start_obj: dict[str, str] = {"dateTime": start, "timeZone": tz}
        end_obj: dict[str, str] = {"dateTime": end, "timeZone": tz}

        event_body: dict[str, Any] = {
            "summary": summary,
            "start": start_obj,
            "end": end_obj,
        }
        if params.get("location"):
            event_body["location"] = params["location"]
        if params.get("description"):
            event_body["description"] = params["description"]

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                CALENDAR_BASE,
                headers={**headers, "Content-Type": "application/json"},
                json=event_body,
            )
            resp.raise_for_status()
            result = resp.json()

        link = result.get("htmlLink", "")
        return (
            f"Event created: {result.get('summary', summary)}\n"
            f"Start: {start}\nEnd: {end}\n"
            f"Link: {link}"
        )


    async def _delete_events(self, headers: dict, params: dict) -> str:
        """Delete one or more events by event_id or by date range.

        Supports:
        - Single: {"event_id": "abc123"}
        - Multiple: {"event_ids": ["abc123", "def456"]}
        - By date range: {"timeMin": "...", "timeMax": "..."} — deletes ALL events in range
        """
        event_id = params.get("event_id", "")
        event_ids = params.get("event_ids", [])

        # Collect IDs to delete
        ids_to_delete: list[tuple[str, str]] = []  # (id, summary)

        if event_id:
            ids_to_delete.append((event_id, event_id))
        if event_ids:
            for eid in event_ids:
                ids_to_delete.append((eid, eid))

        # If no explicit IDs, look for events in date range to delete
        if not ids_to_delete:
            time_min = params.get("timeMin") or params.get("time_min") or ""
            time_max = params.get("timeMax") or params.get("time_max") or ""
            if not time_min:
                return "[SKILL_ERROR] 'event_id', 'event_ids', or 'timeMin'+'timeMax' date range is required for delete"

            # Fetch events in the date range first
            query_params: dict[str, Any] = {
                "maxResults": 50,
                "timeMin": time_min,
                "orderBy": "startTime",
                "singleEvents": "true",
            }
            if time_max:
                query_params["timeMax"] = time_max

            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.get(CALENDAR_BASE, headers=headers, params=query_params)
                resp.raise_for_status()
                data = resp.json()

            events = data.get("items", [])
            if not events:
                return "No events found in the specified date range to delete."

            for ev in events:
                ids_to_delete.append((ev["id"], ev.get("summary", "(No title)")))

        # Delete each event
        deleted = []
        errors = []
        async with httpx.AsyncClient(timeout=30) as client:
            for eid, label in ids_to_delete:
                try:
                    resp = await client.delete(
                        f"{CALENDAR_BASE}/{eid}",
                        headers=headers,
                    )
                    resp.raise_for_status()
                    deleted.append(label)
                except Exception as e:
                    errors.append(f"{label}: {e}")

        lines = []
        if deleted:
            lines.append(f"Deleted {len(deleted)} event(s):")
            for d in deleted:
                lines.append(f"  ✓ {d}")
        if errors:
            lines.append(f"\nFailed to delete {len(errors)} event(s):")
            for err in errors:
                lines.append(f"  ✗ {err}")

        return "\n".join(lines) if lines else "No events were deleted."


_TZ_LABEL_TO_IANA = {
    "NZST": "Pacific/Auckland", "AEST": "Australia/Sydney", "ACST": "Australia/Adelaide",
    "AWST": "Australia/Perth", "JST": "Asia/Tokyo", "KST": "Asia/Seoul",
    "CST (CN)": "Asia/Shanghai", "HKT": "Asia/Hong_Kong", "SGT": "Asia/Singapore",
    "ICT": "Asia/Bangkok", "IST": "Asia/Kolkata", "GST": "Asia/Dubai",
    "MSK": "Europe/Moscow", "EET": "Europe/Athens", "CET": "Europe/Berlin",
    "WET": "Europe/London", "GMT": "Europe/London", "BRT": "America/Sao_Paulo",
    "AST": "America/Halifax", "EST": "America/New_York", "CST": "America/Chicago",
    "MST": "America/Denver", "PST": "America/Los_Angeles",
    "UTC+9": "Asia/Seoul", "UTC+8": "Asia/Shanghai", "UTC+7": "Asia/Bangkok",
    "UTC+5:30": "Asia/Kolkata", "UTC+0": "Europe/London",
}


def _resolve_user_timezone() -> str:
    """Read timezone from USER.md and return IANA timezone string."""
    try:
        from ...config import load_user_md
        user_md = load_user_md()
        if user_md:
            import re
            # Match patterns like "Timezone: KST" or "timezone: Asia/Seoul"
            m = re.search(r'(?i)timezone?\s*[:：]\s*(.+)', user_md)
            if m:
                raw = m.group(1).strip().split('\n')[0].strip()
                # Already IANA format (contains '/')
                if '/' in raw:
                    return raw
                # Try label lookup
                for label, iana in _TZ_LABEL_TO_IANA.items():
                    if label.lower() in raw.lower():
                        return iana
                # Try offset pattern like "GMT+9", "UTC+9"
                offset_m = re.search(r'[+-]\d+', raw)
                if offset_m:
                    offset = int(offset_m.group())
                    if offset == 9:
                        return "Asia/Seoul"
                    elif offset == 8:
                        return "Asia/Shanghai"
                    elif offset == 0:
                        return "Europe/London"
    except Exception:
        pass
    return "Asia/Seoul"


def _format_event(event: dict) -> str:
    """Format a single calendar event for display."""
    event_id = event.get("id", "")
    summary = event.get("summary", "(No title)")
    start_raw = event.get("start", {})
    end_raw = event.get("end", {})
    start = start_raw.get("dateTime", start_raw.get("date", ""))
    end = end_raw.get("dateTime", end_raw.get("date", ""))
    location = event.get("location", "")

    line = f"- [{event_id}] {summary} | {start} ~ {end}"
    if location:
        line += f" | Location: {location}"
    return line
