import logging
from typing import Any

from ..base import SkillExecutor

logger = logging.getLogger(__name__)


class GmailExecutor(SkillExecutor):
    name = "gmail"

    def __init__(self, config):
        self._client_id = config.api.gmail_client_id
        self._client_secret = config.api.gmail_client_secret

    def is_configured(self) -> bool:
        return bool(self._client_id and self._client_secret)

    async def execute(self, params: dict[str, Any]) -> str:
        # Placeholder — Gmail API requires OAuth2 token flow
        # which needs user interaction for initial auth.
        return (
            "[SKILL_ERROR] Gmail skill is not yet fully implemented. "
            "Gmail API requires OAuth2 authentication flow. "
            "This feature is planned for a future update."
        )
