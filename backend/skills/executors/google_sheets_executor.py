"""Google Sheets skill executor — read, write, list via Sheets REST API."""

import logging
import re
from typing import Any

import httpx

from ..base import SkillExecutor
from ...google_token import get_valid_access_token, GoogleAuthError

logger = logging.getLogger(__name__)

SHEETS_BASE = "https://sheets.googleapis.com/v4/spreadsheets"


class GoogleSheetsExecutor(SkillExecutor):
    name = "google_sheets"

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
            if action == "read":
                return await self._read(headers, params)
            elif action == "write":
                return await self._write(headers, params)
            elif action == "list":
                return await self._list_sheets(headers, params)
            else:
                return f"[SKILL_ERROR] Unknown action '{action}'. Use: read, write, list"
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 403:
                return (
                    "[SKILL_ERROR] Insufficient permissions. "
                    "Please log out and log back in from Settings > Profile to grant Sheets access."
                )
            if e.response.status_code == 404:
                return "[SKILL_ERROR] Spreadsheet not found. Please check the spreadsheet_id."
            return f"[SKILL_ERROR] Sheets API error: {e.response.status_code} {e.response.text[:200]}"
        except Exception as e:
            logger.error("Sheets executor error: %s", e, exc_info=True)
            return f"[SKILL_ERROR] Sheets error: {e}"

    async def _read(self, headers: dict, params: dict) -> str:
        spreadsheet_id = _extract_spreadsheet_id(params.get("spreadsheet_id", ""))
        range_str = params.get("range", "Sheet1")

        if not spreadsheet_id:
            return "[SKILL_ERROR] 'spreadsheet_id' is required for read"

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(
                f"{SHEETS_BASE}/{spreadsheet_id}/values/{range_str}",
                headers=headers,
            )
            resp.raise_for_status()
            data = resp.json()

        values = data.get("values", [])
        if not values:
            return f"No data found in range: {range_str}"

        # Format as markdown table
        lines = []
        for i, row in enumerate(values):
            line = " | ".join(str(cell) for cell in row)
            lines.append(line)
            if i == 0:
                lines.append(" | ".join("---" for _ in row))

        return f"Data from {range_str} ({len(values)} rows):\n\n" + "\n".join(lines)

    async def _write(self, headers: dict, params: dict) -> str:
        spreadsheet_id = _extract_spreadsheet_id(params.get("spreadsheet_id", ""))
        range_str = params.get("range", "Sheet1!A1")
        values = params.get("values", [])

        if not spreadsheet_id:
            return "[SKILL_ERROR] 'spreadsheet_id' is required for write"
        if not values:
            return "[SKILL_ERROR] 'values' (2D array) is required for write"

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.put(
                f"{SHEETS_BASE}/{spreadsheet_id}/values/{range_str}",
                headers={**headers, "Content-Type": "application/json"},
                params={"valueInputOption": "USER_ENTERED"},
                json={"values": values},
            )
            resp.raise_for_status()
            result = resp.json()

        updated_cells = result.get("updatedCells", 0)
        updated_range = result.get("updatedRange", range_str)
        return f"Successfully wrote {updated_cells} cells to {updated_range}"

    async def _list_sheets(self, headers: dict, params: dict) -> str:
        spreadsheet_id = _extract_spreadsheet_id(params.get("spreadsheet_id", ""))

        if not spreadsheet_id:
            return "[SKILL_ERROR] 'spreadsheet_id' is required for list"

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(
                f"{SHEETS_BASE}/{spreadsheet_id}",
                headers=headers,
                params={"fields": "properties.title,sheets.properties"},
            )
            resp.raise_for_status()
            data = resp.json()

        title = data.get("properties", {}).get("title", "Untitled")
        sheets = data.get("sheets", [])

        lines = [f"Spreadsheet: {title}\n"]
        for sheet in sheets:
            props = sheet.get("properties", {})
            name = props.get("title", "?")
            rows = props.get("gridProperties", {}).get("rowCount", 0)
            cols = props.get("gridProperties", {}).get("columnCount", 0)
            lines.append(f"- {name} ({rows} rows x {cols} cols)")

        return "\n".join(lines)


def _extract_spreadsheet_id(raw: str) -> str:
    """Extract spreadsheet ID from a URL or return as-is if already an ID."""
    if not raw:
        return ""
    # Match Google Sheets URL pattern
    m = re.search(r"/spreadsheets/d/([a-zA-Z0-9_-]+)", raw)
    if m:
        return m.group(1)
    return raw.strip()
