### fun — Trivia, Quotes & URL Shortener

Get trivia quiz questions, inspirational quotes, or shorten URLs.

**Parameters:**
- `action` (string, required): One of `trivia`, `quote`, `shorten_url`

**Action: `trivia`** — Get quiz questions
- `amount` (integer, optional, default: 5): Number of questions (1-10)
- `category` (integer, optional): Category ID (9=General, 18=Computers, 21=Sports, 22=Geography, 23=History, 17=Science)
- `difficulty` (string, optional): "easy", "medium", or "hard"

**Action: `quote`** — Get inspirational quotes
- `mode` (string, optional, default: "random"): "random" or "today"

**Action: `shorten_url`** — Shorten a URL
- `url` (string, required): The URL to shorten

**Examples:**
```
[SKILL_CALL]{"skill": "fun", "params": {"action": "trivia", "amount": 3, "category": 18, "difficulty": "medium"}}[/SKILL_CALL]
```
```
[SKILL_CALL]{"skill": "fun", "params": {"action": "quote"}}[/SKILL_CALL]
```
```
[SKILL_CALL]{"skill": "fun", "params": {"action": "quote", "mode": "today"}}[/SKILL_CALL]
```
```
[SKILL_CALL]{"skill": "fun", "params": {"action": "shorten_url", "url": "https://www.example.com/very/long/path"}}[/SKILL_CALL]
```
