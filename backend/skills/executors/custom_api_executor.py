import json
import logging
import re
from typing import Any

import httpx

from ..base import SkillExecutor
from ...config import CustomApiDef

logger = logging.getLogger(__name__)


def _resolve_path(data: Any, path: str) -> Any:
    """Extract a value from nested dict/list using dot-notation path."""
    for key in path.split("."):
        if isinstance(data, dict):
            data = data.get(key)
        elif isinstance(data, list) and key.isdigit():
            data = data[int(key)]
        else:
            return None
        if data is None:
            return None
    return data


class CustomApiExecutor(SkillExecutor):
    """Executor for user-registered custom REST APIs."""

    def __init__(self, api_def: CustomApiDef):
        self.name = api_def.name
        self._def = api_def

    def is_configured(self) -> bool:
        return bool(self._def.url)

    async def execute(self, params: dict[str, Any]) -> str:
        query = params.get("query", "")
        if not query:
            return "[SKILL_ERROR] Missing required parameter: query"

        try:
            # Substitute placeholders in URL
            url = self._substitute(self._def.url, params)

            # Build headers
            headers = {
                k: self._substitute(v, params)
                for k, v in self._def.headers.items()
            }

            async with httpx.AsyncClient(timeout=30) as client:
                if self._def.method.upper() == "POST":
                    body_str = self._substitute(self._def.body_template, params)
                    try:
                        body = json.loads(body_str)
                    except (json.JSONDecodeError, TypeError):
                        body = body_str
                    if isinstance(body, (dict, list)):
                        resp = await client.post(url, json=body, headers=headers)
                    else:
                        headers.setdefault("Content-Type", "text/plain")
                        resp = await client.post(url, content=str(body), headers=headers)
                else:
                    resp = await client.get(url, headers=headers)

                resp.raise_for_status()

            # Extract response
            if self._def.response_path:
                try:
                    data = resp.json()
                    extracted = _resolve_path(data, self._def.response_path)
                    if extracted is None:
                        return f"No data found at path '{self._def.response_path}' in response."
                    if isinstance(extracted, (dict, list)):
                        return json.dumps(extracted, ensure_ascii=False, indent=2)
                    return str(extracted)
                except json.JSONDecodeError:
                    return resp.text[:4000]
            else:
                # Return raw text, try pretty-printing JSON
                try:
                    data = resp.json()
                    return json.dumps(data, ensure_ascii=False, indent=2)
                except (json.JSONDecodeError, ValueError):
                    return resp.text[:4000]

        except httpx.HTTPStatusError as e:
            logger.error(f"Custom API '{self.name}' HTTP error: {e}", exc_info=True)
            return f"[SKILL_ERROR] HTTP {e.response.status_code}: {e.response.text[:500]}"
        except Exception as e:
            logger.error(f"Custom API '{self.name}' failed: {e}", exc_info=True)
            return f"[SKILL_ERROR] Custom API '{self.name}' failed: {str(e)}"

    @staticmethod
    def _substitute(template: str, params: dict[str, Any]) -> str:
        """Replace {key} placeholders with values from params."""
        def replacer(match: re.Match) -> str:
            key = match.group(1)
            return str(params.get(key, match.group(0)))
        return re.sub(r"\{(\w+)\}", replacer, template)
