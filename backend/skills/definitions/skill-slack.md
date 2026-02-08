### slack — Slack Messaging

Search messages and channels in Slack.

**Parameters:**
- `action` (string, required): One of "search", "channels"
- `query` (string, for search): Search query for messages
- `max_results` (integer, optional, default: 10): Max results for search

**Examples:**
```
[SKILL_CALL]{"skill": "slack", "params": {"action": "search", "query": "deployment issue in:#general"}}[/SKILL_CALL]
```
```
[SKILL_CALL]{"skill": "slack", "params": {"action": "channels"}}[/SKILL_CALL]
```
