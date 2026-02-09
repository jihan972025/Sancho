### tradingview — Technical Analysis

Get technical analysis indicators (RSI, MACD, Bollinger Bands, Moving Averages) from TradingView.

**Parameters:**
- `ticker` (string): Stock ticker (e.g., "005930.KS", "AAPL", "NVDA"). Korean stocks use .KS suffix.
- `name` (string): Company or crypto name (e.g., "삼성전자", "Apple", "비트코인")
- `interval` (string, optional, default: "daily"): Chart interval — "1h", "4h", "daily", "weekly", "monthly"

Provide either `ticker` or `name`.

**Examples:**
```
[SKILL_CALL]{"skill": "tradingview", "params": {"ticker": "005930.KS", "interval": "daily"}}[/SKILL_CALL]
```
```
[SKILL_CALL]{"skill": "tradingview", "params": {"name": "Apple", "interval": "weekly"}}[/SKILL_CALL]
```
```
[SKILL_CALL]{"skill": "tradingview", "params": {"name": "비트코인", "interval": "4h"}}[/SKILL_CALL]
```
