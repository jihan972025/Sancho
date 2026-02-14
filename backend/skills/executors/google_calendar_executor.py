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
            return f"[SKILL_ERROR] Calendar API error: {e.response.status_code} {e.response.text[:200]}"
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

        if not summary:
            return "[SKILL_ERROR] 'summary' (event title) is required"
        if not start:
            return "[SKILL_ERROR] 'start' datetime is required (ISO 8601)"
        if not end:
            return "[SKILL_ERROR] 'end' datetime is required (ISO 8601)"

        event_body: dict[str, Any] = {
            "summary": summary,
            "start": {"dateTime": start},
            "end": {"dateTime": end},
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
