### trivia — Trivia Quiz

Get trivia quiz questions across 24 categories from Open Trivia Database.

**Parameters:**
- `amount` (integer, optional, default: 5): Number of questions (1-10)
- `category` (integer, optional): Category ID (9=General, 17=Science, 18=Computers, 21=Sports, 22=Geography, 23=History)
- `difficulty` (string, optional): "easy", "medium", or "hard"

**Examples:**
```
[SKILL_CALL]{"skill": "trivia", "params": {"amount": 3, "difficulty": "medium"}}[/SKILL_CALL]
```
```
[SKILL_CALL]{"skill": "trivia", "params": {"amount": 5, "category": 18, "difficulty": "hard"}}[/SKILL_CALL]
```
