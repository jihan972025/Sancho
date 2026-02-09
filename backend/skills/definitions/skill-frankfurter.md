### frankfurter — Exchange Rates

Get foreign exchange rates from ECB (European Central Bank) via Frankfurter API.

**Parameters:**
- `base` (string, optional, default: "USD"): Base currency code (e.g., "USD", "EUR", "KRW")
- `targets` (string, optional): Comma-separated target currencies (e.g., "KRW,EUR,JPY"). Omit for all available.

**Examples:**
```
[SKILL_CALL]{"skill": "frankfurter", "params": {"base": "USD", "targets": "KRW,EUR,JPY"}}[/SKILL_CALL]
```
```
[SKILL_CALL]{"skill": "frankfurter", "params": {"base": "EUR"}}[/SKILL_CALL]
```
