### outlook — Microsoft Outlook Email

Search and read emails from Microsoft Outlook via Microsoft Graph API.

**Parameters:**
- `action` (string, required): One of "search", "read"
- `query` (string, for search): Search query for emails
- `message_id` (string, for read): Email message ID to read
- `max_results` (integer, optional, default: 10): Max results for search

**Examples:**
```
[SKILL_CALL]{"skill": "outlook", "params": {"action": "search", "query": "from:boss@company.com subject:meeting"}}[/SKILL_CALL]
```
```
[SKILL_CALL]{"skill": "outlook", "params": {"action": "read", "message_id": "AAMk..."}}[/SKILL_CALL]
```
