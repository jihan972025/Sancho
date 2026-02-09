"""GNews (Google News) skill executor."""

import logging
from typing import Any

from ..base import SkillExecutor

logger = logging.getLogger(__name__)


def _decode_google_news_url(url: str) -> str:
    """Decode Google News redirect URL to the real article URL."""
    if "news.google.com" not in url:
        return url
    try:
        from googlenewsdecoder import new_decoderv1
        result = new_decoderv1(url, interval=1)
        if result.get("status") and result.get("decoded_url"):
            return result["decoded_url"]
    except Exception:
        pass
    return url


class GNewsExecutor(SkillExecutor):
    name = "gnews"

    def __init__(self, config):
        pass

    def is_configured(self) -> bool:
        return True

    async def execute(self, params: dict[str, Any]) -> str:
        query = params.get("query", "")
        if not query:
            return "[SKILL_ERROR] Missing required parameter: query"

        language = params.get("language", "en")
        country = params.get("country", "")
        max_results = min(params.get("max_results", 10), 20)
        topic = params.get("topic", "")

        try:
            from gnews import GNews

            google_news = GNews(language=language, max_results=max_results)
            if country:
                google_news.country = country

            if topic:
                articles = google_news.get_news_by_topic(topic)
            else:
                articles = google_news.get_news(query)

            if not articles:
                return f"No news found for: {query}"

            lines = [f"**Google News: '{query}'** ({len(articles)} results)\n"]
            for i, article in enumerate(articles, 1):
                title = article.get("title", "No title")
                desc = article.get("description", "")
                publisher = article.get("publisher", {}).get("title", "")
                published = article.get("published date", "")
                raw_url = article.get("url", "")
                url = _decode_google_news_url(raw_url) if raw_url else ""

                lines.append(f"{i}. **{title}**")
                if publisher:
                    lines.append(f"   Source: {publisher} | {published}")
                if desc:
                    lines.append(f"   {desc[:200]}")
                if url:
                    lines.append(f"   [Read article]({url})")
                lines.append("")

            logger.info("GNews fetched: %d articles for '%s'", len(articles), query)
            return "\n".join(lines)
        except Exception as e:
            logger.warning("GNews fetch failed for '%s': %s", query, e)
            return f"[SKILL_ERROR] News search failed: {str(e)}"
