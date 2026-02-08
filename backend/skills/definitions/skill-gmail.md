### gmail — Gmail Email

Search and read emails from Gmail.

**Parameters:**
- `action` (string, required): One of "search", "read"
- `query` (string, for search): Gmail search query
- `message_id` (string, for read): Email message ID to read
- `max_results` (integer, optional, default: 10): Max results for search

**Examples:**
```
[SKILL_CALL]{"skill": "gmail", "params": {"action": "search", "query": "from:team@company.com is:unread"}}[/SKILL_CALL]
```
```
[SKILL_CALL]{"skill": "gmail", "params": {"action": "read", "message_id": "18abc..."}}[/SKILL_CALL]
```
