### wikipedia — Knowledge Lookup

Search Wikipedia and get article summaries.

**Parameters:**
- `query` (string, required): The topic to search for
- `action` (string, optional, default: "summary"): `summary` or `search`
- `lang` (string, optional, default: "en"): Language code (e.g., "en", "ko", "ja")

**Examples:**
```
[SKILL_CALL]{"skill": "wikipedia", "params": {"query": "Python programming language"}}[/SKILL_CALL]
```
```
[SKILL_CALL]{"skill": "wikipedia", "params": {"query": "인공지능", "lang": "ko"}}[/SKILL_CALL]
```
```
[SKILL_CALL]{"skill": "wikipedia", "params": {"query": "machine learning", "action": "search"}}[/SKILL_CALL]
```
