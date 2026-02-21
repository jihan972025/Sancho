### outlook — Microsoft Outlook Email

Search, read, and send emails from Microsoft Outlook via Microsoft Graph API.

**Parameters:**
- `action` (string, required): One of "search", "read", "send"
- `query` (string, for search): Search query for emails (e.g. "from:boss@company.com subject:meeting")
- `message_id` (string, for read): Email message ID to read (obtained from search results)
- `max_results` (integer, optional, default: 10): Max results for search
- `to` (string, for send): Recipient email address (comma-separated for multiple recipients)
- `subject` (string, for send): Email subject
- `body` (string, for send): Email body text

**Examples:**
```
[SKILL_CALL]{"skill": "outlook", "params": {"action": "search", "query": "from:boss@company.com subject:meeting"}}[/SKILL_CALL]
```
```
[SKILL_CALL]{"skill": "outlook", "params": {"action": "search", "query": "is:unread", "max_results": 5}}[/SKILL_CALL]
```
```
[SKILL_CALL]{"skill": "outlook", "params": {"action": "read", "message_id": "AAMk..."}}[/SKILL_CALL]
```
```
[SKILL_CALL]{"skill": "outlook", "params": {"action": "send", "to": "colleague@company.com", "subject": "Meeting Tomorrow", "body": "Hi, can we meet at 3pm tomorrow?"}}[/SKILL_CALL]
```
