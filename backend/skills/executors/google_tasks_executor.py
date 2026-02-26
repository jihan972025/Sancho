"""Google Tasks skill executor — list, create, complete, delete tasks via REST API."""

import logging
from typing import Any

import httpx

from ..base import SkillExecutor
from ...google_token import get_valid_access_token, GoogleAuthError

logger = logging.getLogger(__name__)

TASKS_BASE = "https://tasks.googleapis.com/tasks/v1"


class GoogleTasksExecutor(SkillExecutor):
    name = "google_tasks"

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
                return await self._list_tasks(headers, params)
            elif action == "create":
                return await self._create_task(headers, params)
            elif action == "batch_create":
                return await self._batch_create_tasks(headers, params)
            elif action == "complete":
                return await self._complete_task(headers, params)
            elif action == "delete":
                return await self._delete_task(headers, params)
            else:
                return f"[SKILL_ERROR] Unknown action '{action}'. Use: list, create, batch_create, complete, delete"
        except httpx.HTTPStatusError as e:
            body = e.response.text[:500]
            logger.error("Tasks API HTTP %s: %s", e.response.status_code, body)
            if e.response.status_code == 403:
                # Distinguish between "API not enabled" vs "insufficient scope"
                if "has not been used" in body or "is disabled" in body:
                    return (
                        "[SKILL_ERROR] Google Tasks API is not enabled in the Google Cloud project. "
                        "The project admin must enable it at: "
                        "https://console.cloud.google.com/apis/library/tasks.googleapis.com"
                    )
                return (
                    "[SKILL_ERROR] Insufficient permissions for Google Tasks (403). "
                    "Please log out and log back in from Settings > Profile to grant Tasks access. "
                    f"Detail: {body[:200]}"
                )
            return f"[SKILL_ERROR] Tasks API error: {e.response.status_code} {body[:300]}"
        except Exception as e:
            logger.error("Tasks executor error: %s", e, exc_info=True)
            return f"[SKILL_ERROR] Tasks error: {e}"

    async def _list_tasks(self, headers: dict, params: dict) -> str:
        tasklist = params.get("tasklist", "@default")
        max_results = min(params.get("max_results", 20), 100)

        url = f"{TASKS_BASE}/lists/{tasklist}/tasks"
        query_params: dict[str, Any] = {
            "maxResults": max_results,
            "showCompleted": "false",
            "showHidden": "false",
        }

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(url, headers=headers, params=query_params)
            resp.raise_for_status()
            data = resp.json()

        tasks = data.get("items", [])
        if not tasks:
            return "No tasks found. Your task list is empty."

        lines = [f"Found {len(tasks)} task(s):\n"]
        for t in tasks:
            lines.append(_format_task(t))
        return "\n".join(lines)

    async def _create_task(self, headers: dict, params: dict) -> str:
        tasklist = params.get("tasklist", "@default")
        title = params.get("title", "")

        if not title:
            return "[SKILL_ERROR] 'title' is required for creating a task"

        task_body: dict[str, Any] = {"title": title}
        if params.get("notes"):
            task_body["notes"] = params["notes"]
        if params.get("due"):
            task_body["due"] = params["due"]

        url = f"{TASKS_BASE}/lists/{tasklist}/tasks"

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                url,
                headers={**headers, "Content-Type": "application/json"},
                json=task_body,
            )
            resp.raise_for_status()
            result = resp.json()

        due_str = ""
        if result.get("due"):
            due_str = f"\nDue: {result['due']}"

        return (
            f"Task created successfully:\n"
            f"  Title: {result.get('title', title)}\n"
            f"  ID: {result.get('id', '')}"
            f"{due_str}"
        )

    async def _batch_create_tasks(self, headers: dict, params: dict) -> str:
        tasklist = params.get("tasklist", "@default")
        tasks = params.get("tasks", [])

        if not tasks or not isinstance(tasks, list):
            return "[SKILL_ERROR] 'tasks' (array of {title, notes?, due?}) is required for batch_create"

        url = f"{TASKS_BASE}/lists/{tasklist}/tasks"
        created: list[str] = []
        errors: list[str] = []

        async with httpx.AsyncClient(timeout=30) as client:
            for i, task_item in enumerate(tasks):
                title = task_item.get("title", "") if isinstance(task_item, dict) else str(task_item)
                if not title:
                    errors.append(f"#{i + 1}: missing title")
                    continue

                task_body: dict[str, Any] = {"title": title}
                if isinstance(task_item, dict):
                    if task_item.get("notes"):
                        task_body["notes"] = task_item["notes"]
                    if task_item.get("due"):
                        task_body["due"] = task_item["due"]

                try:
                    resp = await client.post(
                        url,
                        headers={**headers, "Content-Type": "application/json"},
                        json=task_body,
                    )
                    resp.raise_for_status()
                    result = resp.json()
                    created.append(f"  ✅ {result.get('title', title)}")
                except Exception as e:
                    errors.append(f"  ❌ {title}: {e}")

        lines = [f"Created {len(created)} of {len(tasks)} task(s):"]
        lines.extend(created)
        if errors:
            lines.append(f"\nFailed ({len(errors)}):")
            lines.extend(errors)
        return "\n".join(lines)

    async def _complete_task(self, headers: dict, params: dict) -> str:
        tasklist = params.get("tasklist", "@default")
        task_id = params.get("task_id", "")

        if not task_id:
            return "[SKILL_ERROR] 'task_id' is required. Use 'list' action first to get task IDs."

        url = f"{TASKS_BASE}/lists/{tasklist}/tasks/{task_id}"

        async with httpx.AsyncClient(timeout=30) as client:
            # First get the task to preserve its data
            resp = await client.get(url, headers=headers)
            resp.raise_for_status()
            task = resp.json()

            # Mark as completed
            task["status"] = "completed"
            resp = await client.put(
                url,
                headers={**headers, "Content-Type": "application/json"},
                json=task,
            )
            resp.raise_for_status()
            result = resp.json()

        return f"Task completed: {result.get('title', task_id)}"

    async def _delete_task(self, headers: dict, params: dict) -> str:
        tasklist = params.get("tasklist", "@default")
        task_id = params.get("task_id", "")

        if not task_id:
            return "[SKILL_ERROR] 'task_id' is required. Use 'list' action first to get task IDs."

        url = f"{TASKS_BASE}/lists/{tasklist}/tasks/{task_id}"

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.delete(url, headers=headers)
            resp.raise_for_status()

        return f"Task deleted: {task_id}"


def _format_task(task: dict) -> str:
    """Format a single task for display."""
    task_id = task.get("id", "")
    title = task.get("title", "(No title)")
    status = task.get("status", "needsAction")
    due = task.get("due", "")
    notes = task.get("notes", "")

    status_icon = "✅" if status == "completed" else "☐"
    line = f"- {status_icon} [{task_id}] {title}"
    if due:
        line += f" | Due: {due}"
    if notes:
        # Truncate long notes
        short_notes = notes[:80] + "..." if len(notes) > 80 else notes
        line += f" | {short_notes}"
    return line
