### gnews — Google News Search

Search Google News for articles across 141 countries and 41 languages.

**Parameters:**
- `query` (string, required): Search query in English for best results
- `language` (string, optional, default: "en"): Language code (e.g., "en", "ko", "ja", "zh")
- `country` (string, optional): Country code (e.g., "US", "KR", "JP")
- `max_results` (integer, optional, default: 10): Number of results (max 20)
- `topic` (string, optional): News topic instead of query — "WORLD", "NATION", "BUSINESS", "TECHNOLOGY", "ENTERTAINMENT", "SPORTS", "SCIENCE", "HEALTH"

**Examples:**
```
[SKILL_CALL]{"skill": "gnews", "params": {"query": "AI technology 2026"}}[/SKILL_CALL]
```
```
[SKILL_CALL]{"skill": "gnews", "params": {"query": "Samsung Electronics", "language": "ko", "country": "KR"}}[/SKILL_CALL]
```
```
[SKILL_CALL]{"skill": "gnews", "params": {"topic": "TECHNOLOGY", "language": "en", "max_results": 5}}[/SKILL_CALL]
```
