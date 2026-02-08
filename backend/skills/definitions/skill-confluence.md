### confluence — Confluence Wiki

Search and read Confluence wiki pages.

**Parameters:**
- `action` (string, required): One of "search", "get"
- `query` (string, for search): Search query (CQL)
- `page_id` (string, for get): Page ID to retrieve
- `space` (string, optional): Space key to limit search
- `max_results` (integer, optional, default: 10): Max results for search

**Examples:**
```
[SKILL_CALL]{"skill": "confluence", "params": {"action": "search", "query": "deployment guide", "space": "DEV"}}[/SKILL_CALL]
```
```
[SKILL_CALL]{"skill": "confluence", "params": {"action": "get", "page_id": "12345"}}[/SKILL_CALL]
```
