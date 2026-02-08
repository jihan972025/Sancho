import logging
from typing import Any

from ..base import SkillExecutor

logger = logging.getLogger(__name__)


class WikipediaExecutor(SkillExecutor):
    name = "wikipedia"

    def __init__(self, config):
        pass  # No API key needed

    def is_configured(self) -> bool:
        return True

    async def execute(self, params: dict[str, Any]) -> str:
        action = params.get("action", "summary")
        query = params.get("query", "")
        if not query:
            return "[SKILL_ERROR] Missing required parameter: query"

        lang = params.get("lang", "en")

        try:
            import wikipedia
            wikipedia.set_lang(lang)

            if action == "search":
                results = wikipedia.search(query, results=10)
                if not results:
                    return f"No Wikipedia articles found for: {query}"
                lines = [f"**Wikipedia Search: '{query}'**\n"]
                for i, title in enumerate(results, 1):
                    lines.append(f"{i}. {title}")
                return "\n".join(lines)

            # Default: summary
            try:
                page = wikipedia.page(query, auto_suggest=True)
                summary = wikipedia.summary(query, sentences=5, auto_suggest=True)
                return (
                    f"**{page.title}**\n\n"
                    f"{summary}\n\n"
                    f"URL: {page.url}"
                )
            except wikipedia.DisambiguationError as e:
                options = e.options[:10]
                lines = [f"**'{query}' is ambiguous.** Did you mean:\n"]
                for i, opt in enumerate(options, 1):
                    lines.append(f"{i}. {opt}")
                return "\n".join(lines)
            except wikipedia.PageError:
                # Try search fallback
                results = wikipedia.search(query, results=5)
                if results:
                    lines = [f"No exact match for '{query}'. Related articles:\n"]
                    for i, title in enumerate(results, 1):
                        lines.append(f"{i}. {title}")
                    return "\n".join(lines)
                return f"No Wikipedia article found for: {query}"

        except Exception as e:
            logger.error("Wikipedia executor failed: %s", e, exc_info=True)
            return f"[SKILL_ERROR] Wikipedia lookup failed: {str(e)}"
