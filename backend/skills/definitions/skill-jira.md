### jira — Jira Issue Tracker

Interact with Jira to search issues, get issue details, or create issues.

**Parameters:**
- `action` (string, required): One of "search", "get", "create"
- `jql` (string, for search): JQL query string
- `issue_key` (string, for get): Issue key (e.g., "PROJ-123")
- `project` (string, for create): Project key
- `summary` (string, for create): Issue summary/title
- `description` (string, for create): Issue description
- `issue_type` (string, for create, default: "Task"): Issue type
- `max_results` (integer, optional, default: 10): Max results for search

**Examples:**
```
[SKILL_CALL]{"skill": "jira", "params": {"action": "search", "jql": "project = PROJ AND status = 'In Progress'"}}[/SKILL_CALL]
```
```
[SKILL_CALL]{"skill": "jira", "params": {"action": "get", "issue_key": "PROJ-123"}}[/SKILL_CALL]
```
```
[SKILL_CALL]{"skill": "jira", "params": {"action": "create", "project": "PROJ", "summary": "Fix login bug", "description": "Users can't log in with SSO"}}[/SKILL_CALL]
```
