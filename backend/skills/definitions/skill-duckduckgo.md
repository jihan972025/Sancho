### duckduckgo — Web Search, Weather, Stocks, Currency, Crypto & Earthquake

Search the web, get real-time weather, stock prices, technical analysis, exchange rates, cryptocurrency prices, and earthquake data.

**IMPORTANT:** Always write search queries in **English** for best results, even if the user asks in another language.

**Parameters:**
- `query` (string, required): The search query — MUST be in English, specific and detailed
- `max_results` (integer, optional, default: 5): Maximum number of results to return
- `location` (string, optional): City name for weather queries (e.g., "Seoul", "Tokyo")
- `ticker` (string, optional): Stock ticker symbol (e.g., "005930.KS" for Samsung Electronics, "AAPL" for Apple). Korean stocks use .KS suffix.

**Examples:**
```
[SKILL_CALL]{"skill": "duckduckgo", "params": {"query": "2026 Australian Open men singles winner"}}[/SKILL_CALL]
```
```
[SKILL_CALL]{"skill": "duckduckgo", "params": {"query": "Seoul weather forecast this week", "location": "Seoul"}}[/SKILL_CALL]
```
```
[SKILL_CALL]{"skill": "duckduckgo", "params": {"query": "Samsung Electronics stock price this week", "ticker": "005930.KS"}}[/SKILL_CALL]
```
```
[SKILL_CALL]{"skill": "duckduckgo", "params": {"query": "Tesla stock price today", "ticker": "TSLA"}}[/SKILL_CALL]
```
```
[SKILL_CALL]{"skill": "duckduckgo", "params": {"query": "Samsung Electronics technical analysis RSI MACD", "ticker": "005930.KS"}}[/SKILL_CALL]
```
```
[SKILL_CALL]{"skill": "duckduckgo", "params": {"query": "NVIDIA technical analysis chart indicators", "ticker": "NVDA"}}[/SKILL_CALL]
```
```
[SKILL_CALL]{"skill": "duckduckgo", "params": {"query": "USD to KRW exchange rate today"}}[/SKILL_CALL]
```
```
[SKILL_CALL]{"skill": "duckduckgo", "params": {"query": "Bitcoin Ethereum price today"}}[/SKILL_CALL]
```
```
[SKILL_CALL]{"skill": "duckduckgo", "params": {"query": "recent earthquakes this week"}}[/SKILL_CALL]
```
