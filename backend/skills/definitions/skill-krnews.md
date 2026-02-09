### krnews — Korean News (RSS)

Get the latest headlines from major Korean news outlets via RSS feeds. No API key required.

**Available sources:** yonhap (Yonhap News), sbs (SBS News), donga (Donga Ilbo), hankyoreh (Hankyoreh), kyunghyang (Kyunghyang Shinmun), nocutnews (NoCut News), fnnews (Financial News), segye (Segye Ilbo)

**Parameters:**
- `source` (string, optional): News source key or Korean name (e.g., "yonhap", "연합뉴스", "sbs", "한겨레"). Omit to fetch from all sources.
- `query` (string, optional): Filter articles by keyword in title or summary
- `max_results` (integer, optional, default: 10): Number of articles to return (max 30)

**Examples:**
```
[SKILL_CALL]{"skill": "krnews", "params": {}}[/SKILL_CALL]
```
```
[SKILL_CALL]{"skill": "krnews", "params": {"source": "yonhap"}}[/SKILL_CALL]
```
```
[SKILL_CALL]{"skill": "krnews", "params": {"source": "연합뉴스", "max_results": 5}}[/SKILL_CALL]
```
```
[SKILL_CALL]{"skill": "krnews", "params": {"query": "경제", "max_results": 10}}[/SKILL_CALL]
```
```
[SKILL_CALL]{"skill": "krnews", "params": {"source": "hankyoreh", "query": "대통령"}}[/SKILL_CALL]
```
