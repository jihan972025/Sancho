### google_tasks — Google Tasks

Create, list, complete, and delete tasks in Google Tasks (To-Do list).

**Important:** This skill manages **Tasks** (to-do items), NOT calendar events. When the user says "할일", "할 일", "Task", "todo", "to-do", or asks to add something to their task list, use this skill — NOT google_calendar.

**Parameters:**
- `action` (string, required): One of "list", "create", "complete", "delete"
- `tasklist` (string, optional): Task list ID. Defaults to "@default" (primary task list).
- `title` (string, for create): Task title (required for create)
- `notes` (string, for create, optional): Task description/details
- `due` (string, for create, optional): Due date in RFC 3339 format (e.g. "2026-02-28T00:00:00Z")
- `task_id` (string, for complete/delete): Task ID to complete or delete
- `max_results` (integer, optional, default: 20): Max results for list

**Examples:**
```
[SKILL_CALL]{"skill": "google_tasks", "params": {"action": "list"}}[/SKILL_CALL]
```
```
[SKILL_CALL]{"skill": "google_tasks", "params": {"action": "create", "title": "Buy groceries", "notes": "Milk, eggs, bread", "due": "2026-02-28T00:00:00Z"}}[/SKILL_CALL]
```
```
[SKILL_CALL]{"skill": "google_tasks", "params": {"action": "create", "title": "카드/커머셜 2026년 2월 통신공사 발주 처리"}}[/SKILL_CALL]
```
```
[SKILL_CALL]{"skill": "google_tasks", "params": {"action": "complete", "task_id": "abc123"}}[/SKILL_CALL]
```
```
[SKILL_CALL]{"skill": "google_tasks", "params": {"action": "delete", "task_id": "abc123"}}[/SKILL_CALL]
```
