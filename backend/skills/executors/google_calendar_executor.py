"""Google Calendar skill executor — list, search, create events via REST API."""

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
            else:
                return f"[SKILL_ERROR] Unknown action '{action}'. Use: list, search, create"
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
        now = datetime.now(timezone.utc).isoformat()

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(
                CALENDAR_BASE,
                headers=headers,
                params={
                    "maxResults": max_results,
                    "timeMin": now,
                    "orderBy": "startTime",
                    "singleEvents": "true",
                },
            )
            resp.raise_for_status()
            data = resp.json()

        events = data.get("items", [])
        if not events:
            return "No upcoming events found."

        return f"Upcoming {len(events)} event(s):\n\n" + "\n".join(
            _format_event(e) for e in events
        )

    async def _search_events(self, headers: dict, params: dict) -> str:
        query = params.get("query", "")
        max_results = min(params.get("max_results", 10), 50)

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(
                CALENDAR_BASE,
                headers=headers,
                params={
                    "q": query,
                    "maxResults": max_results,
                    "orderBy": "startTime",
                    "singleEvents": "true",
                    "timeMin": "2020-01-01T00:00:00Z",
                },
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
    summary = event.get("summary", "(No title)")
    start_raw = event.get("start", {})
    end_raw = event.get("end", {})
    start = start_raw.get("dateTime", start_raw.get("date", ""))
    end = end_raw.get("dateTime", end_raw.get("date", ""))
    location = event.get("location", "")

    line = f"- {summary} | {start} ~ {end}"
    if location:
        line += f" | Location: {location}"
    return line
