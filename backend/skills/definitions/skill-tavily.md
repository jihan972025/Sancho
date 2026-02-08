### tavily — AI-Powered Web Search, Weather, Stocks, Currency, Crypto & Earthquake

AI-curated web search with summaries. Also provides real-time weather, stock prices, technical analysis, exchange rates, cryptocurrency prices, and earthquake data.

**IMPORTANT:** Always write search queries in **English** for best results, even if the user asks in another language.

**Parameters:**
- `query` (string, required): The search query — MUST be in English, specific and detailed
- `max_results` (integer, optional, default: 5): Maximum number of results
- `search_depth` (string, optional, default: "basic"): "basic" or "advanced"
- `location` (string, optional): City name for weather queries (e.g., "Seoul", "Tokyo")
- `ticker` (string, optional): Stock ticker symbol (e.g., "005930.KS" for Samsung Electronics, "AAPL" for Apple). Korean stocks use .KS suffix.

**Examples:**
```
[SKILL_CALL]{"skill": "tavily", "params": {"query": "Python FastAPI best practices", "max_results": 5}}[/SKILL_CALL]
```
```
[SKILL_CALL]{"skill": "tavily", "params": {"query": "Seoul weather forecast this week", "location": "Seoul"}}[/SKILL_CALL]
```
```
[SKILL_CALL]{"skill": "tavily", "params": {"query": "Samsung Electronics stock price", "ticker": "005930.KS"}}[/SKILL_CALL]
```
```
[SKILL_CALL]{"skill": "tavily", "params": {"query": "USD to KRW exchange rate today"}}[/SKILL_CALL]
```
```
[SKILL_CALL]{"skill": "tavily", "params": {"query": "Bitcoin price today"}}[/SKILL_CALL]
```
```
[SKILL_CALL]{"skill": "tavily", "params": {"query": "recent earthquakes this week"}}[/SKILL_CALL]
```
