import logging
from typing import Any

from ..base import SkillExecutor
from ._data_helpers import collect_supplementary_data

logger = logging.getLogger(__name__)


class DuckDuckGoExecutor(SkillExecutor):
    name = "duckduckgo"

    def __init__(self, config):
        pass

    def is_configured(self) -> bool:
        return True

    async def execute(self, params: dict[str, Any]) -> str:
        query = params.get("query", "")
        if not query:
            return "[SKILL_ERROR] Missing required parameter: query"

        max_results = params.get("max_results", 5)
        location = params.get("location", "")
        ticker = params.get("ticker", "")
        original = params.get("original_query", query)

        # Collect supplementary data (weather, stock, TA, currency, crypto, earthquake)
        supplementary = await collect_supplementary_data(query, original, location, ticker)

        # Web search (news + text combined)
        search_result = await self._search(query, max_results)

        parts = supplementary + ([search_result] if search_result else [])
        return "\n\n---\n\n".join(parts) if parts else f"No results found for: {query}"

    async def _search(self, query: str, max_results: int) -> str:
        from ddgs import DDGS

        try:
            all_results = []

            with DDGS() as ddgs:
                news_results = list(ddgs.news(query, max_results=max_results))
                for r in news_results:
                    all_results.append({
                        "title": r.get("title", ""),
                        "body": r.get("body", ""),
                        "url": r.get("url", ""),
                        "source": "news",
                    })

            with DDGS() as ddgs:
                text_results = list(ddgs.text(query, region="wt-wt", max_results=max_results))
                for r in text_results:
                    all_results.append({
                        "title": r.get("title", ""),
                        "body": r.get("body", ""),
                        "url": r.get("href", ""),
                        "source": "web",
                    })

            logger.info(
                "DuckDuckGo search '%s': %d news + %d text",
                query, len(news_results), len(text_results),
            )

            if not all_results:
                return ""

            seen_titles = set()
            unique = []
            for r in all_results:
                key = r["title"].lower().strip()[:60]
                if key not in seen_titles:
                    seen_titles.add(key)
                    unique.append(r)

            formatted = []
            for i, r in enumerate(unique[:max_results * 2], 1):
                tag = "[News]" if r["source"] == "news" else "[Web]"
                formatted.append(
                    f"{i}. {tag} **{r['title']}**\n"
                    f"   {r['body']}\n"
                    f"   URL: {r['url']}"
                )
            return f"Search results for '{query}':\n\n" + "\n\n".join(formatted)
        except Exception as e:
            logger.error(f"DuckDuckGo search failed: {e}", exc_info=True)
            return f"[SKILL_ERROR] Search failed: {str(e)}"
