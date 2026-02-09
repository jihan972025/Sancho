import json
import logging
from base64 import b64encode
from typing import Any

import httpx

from ..base import SkillExecutor

logger = logging.getLogger(__name__)


class JiraExecutor(SkillExecutor):
    name = "jira"

    def __init__(self, config):
        self._url = config.api.jira_url.rstrip("/") if config.api.jira_url else ""
        self._email = config.api.jira_email
        self._token = config.api.jira_api_token

    def is_configured(self) -> bool:
        return bool(self._url and self._email and self._token)

    def _auth_header(self) -> dict[str, str]:
        creds = b64encode(f"{self._email}:{self._token}".encode()).decode()
        return {
            "Authorization": f"Basic {creds}",
            "Content-Type": "application/json",
        }

    async def execute(self, params: dict[str, Any]) -> str:
        action = params.get("action", "")
        if action == "search":
            return await self._search(params)
        elif action == "get":
            return await self._get(params)
        elif action == "create":
            return await self._create(params)
        else:
            return f"[SKILL_ERROR] Unknown Jira action: {action}. Use 'search', 'get', or 'create'."

    async def _search(self, params: dict[str, Any]) -> str:
        jql = params.get("jql", "")
        if not jql:
            return "[SKILL_ERROR] Missing required parameter: jql"
        max_results = params.get("max_results", 10)

        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.get(
                    f"{self._url}/rest/api/3/search",
                    params={"jql": jql, "maxResults": max_results},
                    headers=self._auth_header(),
                )
                resp.raise_for_status()
                data = resp.json()

            issues = data.get("issues", [])
            if not issues:
                return f"No issues found for JQL: {jql}"

            formatted = []
            for issue in issues:
                key = issue["key"]
                fields = issue["fields"]
                summary = fields.get("summary", "No summary")
                status = fields.get("status", {}).get("name", "Unknown")
                assignee = fields.get("assignee", {})
                assignee_name = assignee.get("displayName", "Unassigned") if assignee else "Unassigned"
                formatted.append(f"- **{key}**: {summary} [{status}] (Assignee: {assignee_name})")

            return f"Jira search results ({len(issues)} issues):\n\n" + "\n".join(formatted)
        except Exception as e:
            logger.error(f"Jira search failed: {e}", exc_info=True)
            return f"[SKILL_ERROR] Jira search failed: {str(e)}"

    async def _get(self, params: dict[str, Any]) -> str:
        issue_key = params.get("issue_key", "")
        if not issue_key:
            return "[SKILL_ERROR] Missing required parameter: issue_key"

        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.get(
                    f"{self._url}/rest/api/3/issue/{issue_key}",
                    headers=self._auth_header(),
                )
                resp.raise_for_status()
                data = resp.json()

            fields = data["fields"]
            summary = fields.get("summary", "No summary")
            status = fields.get("status", {}).get("name", "Unknown")
            assignee = fields.get("assignee", {})
            assignee_name = assignee.get("displayName", "Unassigned") if assignee else "Unassigned"
            description = fields.get("description", "No description")
            if isinstance(description, dict):
                # Atlassian Document Format — extract plain text
                parts = []
                for block in description.get("content", []):
                    for item in block.get("content", []):
                        if item.get("type") == "text":
                            parts.append(item.get("text", ""))
                description = "\n".join(parts) if parts else "No description"
            priority = fields.get("priority", {}).get("name", "None")
            issue_type = fields.get("issuetype", {}).get("name", "Unknown")

            return (
                f"**{issue_key}: {summary}**\n\n"
                f"- Type: {issue_type}\n"
                f"- Status: {status}\n"
                f"- Priority: {priority}\n"
                f"- Assignee: {assignee_name}\n\n"
                f"**Description:**\n{description}"
            )
        except Exception as e:
            logger.error(f"Jira get failed: {e}", exc_info=True)
            return f"[SKILL_ERROR] Failed to get issue {issue_key}: {str(e)}"

    async def _create(self, params: dict[str, Any]) -> str:
        project = params.get("project", "")
        summary = params.get("summary", "")
        if not project or not summary:
            return "[SKILL_ERROR] Missing required parameters: project and summary"

        description = params.get("description", "")
        issue_type = params.get("issue_type", "Task")

        payload = {
            "fields": {
                "project": {"key": project},
                "summary": summary,
                "issuetype": {"name": issue_type},
            }
        }
        if description:
            payload["fields"]["description"] = {
                "type": "doc",
                "version": 1,
                "content": [
                    {
                        "type": "paragraph",
                        "content": [{"type": "text", "text": description}],
                    }
                ],
            }

        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(
                    f"{self._url}/rest/api/3/issue",
                    headers=self._auth_header(),
                    json=payload,
                )
                resp.raise_for_status()
                data = resp.json()

            key = data.get("key", "Unknown")
            return f"Issue created: **{key}** — {summary}\n[Open in Jira]({self._url}/browse/{key})"
        except Exception as e:
            logger.error(f"Jira create failed: {e}", exc_info=True)
            return f"[SKILL_ERROR] Failed to create Jira issue: {str(e)}"
