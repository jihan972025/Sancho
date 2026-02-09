### yfinance — Stock Market Data & Briefings

Get real-time stock quotes, market index data, and comprehensive market briefings using Yahoo Finance.

**IMPORTANT:** Use this skill when the user asks about:
- Stock market briefings or overviews (e.g., "오늘 주식시장 브리핑", "market briefing today")
- Market indices (KOSPI, KOSDAQ, S&P 500, NASDAQ, Dow Jones, Nikkei, etc.)
- Individual stock prices by company name or ticker
- Regional market summaries

**Parameters:**
- `action` (string, required): One of `quote`, `market`, or `briefing`
  - `quote`: Get price data for a single stock or index
  - `market`: Get overview of market indices for a region
  - `briefing`: Comprehensive briefing with indices + major stocks
- `ticker` (string, optional): Stock ticker symbol (e.g., "005930.KS", "AAPL", "^KS11")
- `name` (string, optional): Company or index name (e.g., "삼성전자", "Apple", "코스피", "나스닥")
- `region` (string, optional, default: "korea"): Region for market/briefing actions. Values: `korea`, `한국`, `us`, `미국`, `global`, `글로벌`

**Examples:**
```
[SKILL_CALL]{"skill": "yfinance", "params": {"action": "briefing", "region": "korea"}}[/SKILL_CALL]
```
```
[SKILL_CALL]{"skill": "yfinance", "params": {"action": "briefing", "region": "us"}}[/SKILL_CALL]
```
```
[SKILL_CALL]{"skill": "yfinance", "params": {"action": "market", "region": "global"}}[/SKILL_CALL]
```
```
[SKILL_CALL]{"skill": "yfinance", "params": {"action": "quote", "name": "삼성전자"}}[/SKILL_CALL]
```
```
[SKILL_CALL]{"skill": "yfinance", "params": {"action": "quote", "ticker": "NVDA"}}[/SKILL_CALL]
```
```
[SKILL_CALL]{"skill": "yfinance", "params": {"action": "quote", "name": "코스피"}}[/SKILL_CALL]
```
