### upbit — Upbit Trading

Execute trades and check balances on Upbit exchange (KRW market).

**Parameters:**
- `action` (string, required): `"buy"`, `"sell"`, `"balance"`, or `"price"`
- `coin` (string, required for buy/sell/price): Coin symbol (e.g., "BTC", "ADA", "ETH", "XRP", "SOL")
- `amount_krw` (number, required for buy): KRW amount to spend (minimum 5,000)
- `ratio` (number, optional for sell, default: 100): Sell percentage — 100 = sell all, 50 = sell half
- `quantity` (number, optional for sell): Exact coin quantity to sell (overrides ratio)

**Examples:**
```
[SKILL_CALL]{"skill": "upbit", "params": {"action": "buy", "coin": "ADA", "amount_krw": 10000}}[/SKILL_CALL]
```
```
[SKILL_CALL]{"skill": "upbit", "params": {"action": "sell", "coin": "ADA", "ratio": 100}}[/SKILL_CALL]
```
```
[SKILL_CALL]{"skill": "upbit", "params": {"action": "sell", "coin": "BTC", "ratio": 50}}[/SKILL_CALL]
```
```
[SKILL_CALL]{"skill": "upbit", "params": {"action": "balance"}}[/SKILL_CALL]
```
```
[SKILL_CALL]{"skill": "upbit", "params": {"action": "price", "coin": "BTC"}}[/SKILL_CALL]
```
