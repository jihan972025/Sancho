import logging
from typing import Any

import httpx

from ..base import SkillExecutor
from ._data_helpers import collect_supplementary_data

logger = logging.getLogger(__name__)


class TavilyExecutor(SkillExecutor):
    name = "tavily"

    def __init__(self, config):
        self._api_key = config.api.tavily_api_key

    def is_configured(self) -> bool:
        return bool(self._api_key)

    async def execute(self, params: dict[str, Any]) -> str:
        query = params.get("query", "")
        if not query:
            return "[SKILL_ERROR] Missing required parameter: query"

        max_results = params.get("max_results", 5)
        search_depth = params.get("search_depth", "basic")
        location = params.get("location", "")
        ticker = params.get("ticker", "")
        original = params.get("original_query", query)

        # Collect supplementary data (weather, stock, TA, currency, crypto, earthquake)
        supplementary = await collect_supplementary_data(query, original, location, ticker)

        # Tavily web search
        search_result = await self._search(query, max_results, search_depth)

        parts = supplementary + ([search_result] if search_result else [])
        return "\n\n---\n\n".join(parts) if parts else f"No results found for: {query}"

    async def _search(self, query: str, max_results: int, search_depth: str) -> str:
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(
                    "https://api.tavily.com/search",
                    json={
                        "api_key": self._api_key,
                        "query": query,
                        "max_results": max_results,
                        "search_depth": search_depth,
                    },
                )
                resp.raise_for_status()
                data = resp.json()

            results = data.get("results", [])
            if not results:
                return ""

            formatted = []
            for i, r in enumerate(results, 1):
                formatted.append(
                    f"{i}. **{r.get('title', 'No title')}**\n"
                    f"   {r.get('content', 'No description')}\n"
                    f"   URL: {r.get('url', 'N/A')}"
                )

            answer = data.get("answer", "")
            header = f"Search results for '{query}':\n\n"
            if answer:
                header += f"**Summary:** {answer}\n\n"
            return header + "\n\n".join(formatted)
        except Exception as e:
            logger.error(f"Tavily search failed: {e}", exc_info=True)
            return f"[SKILL_ERROR] Tavily search failed: {str(e)}"
