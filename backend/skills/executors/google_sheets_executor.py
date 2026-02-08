import logging
from typing import Any

from ..base import SkillExecutor

logger = logging.getLogger(__name__)


class GoogleSheetsExecutor(SkillExecutor):
    name = "google_sheets"

    def __init__(self, config):
        self._client_id = config.api.google_sheets_client_id
        self._client_secret = config.api.google_sheets_client_secret

    def is_configured(self) -> bool:
        return bool(self._client_id and self._client_secret)

    async def execute(self, params: dict[str, Any]) -> str:
        # Placeholder — Google Sheets API requires OAuth2 token flow
        # which needs user interaction for initial auth.
        return (
            "[SKILL_ERROR] Google Sheets skill is not yet fully implemented. "
            "Google Sheets API requires OAuth2 authentication flow. "
            "This feature is planned for a future update."
        )
