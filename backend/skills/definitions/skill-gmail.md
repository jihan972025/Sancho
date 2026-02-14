### gmail — Gmail Email

Search, read, and send emails from Gmail.

**Parameters:**
- `action` (string, required): One of "search", "read", "send"
- `query` (string, for search): Gmail search query
- `message_id` (string, for read): Email message ID to read
- `max_results` (integer, optional, default: 10): Max results for search
- `to` (string, for send): Recipient email address
- `subject` (string, for send): Email subject
- `body` (string, for send): Email body text

**Examples:**
```
[SKILL_CALL]{"skill": "gmail", "params": {"action": "search", "query": "from:team@company.com is:unread"}}[/SKILL_CALL]
```
```
[SKILL_CALL]{"skill": "gmail", "params": {"action": "read", "message_id": "18abc..."}}[/SKILL_CALL]
```
```
[SKILL_CALL]{"skill": "gmail", "params": {"action": "send", "to": "colleague@example.com", "subject": "Meeting Notes", "body": "Here are the notes from today's meeting..."}}[/SKILL_CALL]
```
