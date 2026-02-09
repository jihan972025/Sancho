### ccxt — Cryptocurrency Prices

Get real-time cryptocurrency prices from Binance exchange.

**Parameters:**
- `symbols` (string, optional): Comma-separated trading pairs (e.g., "BTC/USDT,ETH/USDT"). Defaults to top 5 coins.
- `name` (string, optional): Crypto name to look up (e.g., "비트코인", "ethereum", "솔라나")

**Examples:**
```
[SKILL_CALL]{"skill": "ccxt", "params": {"symbols": "BTC/USDT,ETH/USDT,SOL/USDT"}}[/SKILL_CALL]
```
```
[SKILL_CALL]{"skill": "ccxt", "params": {"name": "비트코인"}}[/SKILL_CALL]
```
```
[SKILL_CALL]{"skill": "ccxt", "params": {}}[/SKILL_CALL]
```
