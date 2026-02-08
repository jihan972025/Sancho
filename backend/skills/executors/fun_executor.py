import logging
from typing import Any

import httpx

from ..base import SkillExecutor

logger = logging.getLogger(__name__)


class FunExecutor(SkillExecutor):
    name = "fun"

    def __init__(self, config):
        pass  # No API keys needed

    def is_configured(self) -> bool:
        return True

    async def execute(self, params: dict[str, Any]) -> str:
        action = params.get("action", "")
        if not action:
            return "[SKILL_ERROR] Missing required parameter: action"

        handlers = {
            "trivia": self._trivia,
            "quote": self._quote,
            "shorten_url": self._shorten_url,
        }
        handler = handlers.get(action)
        if not handler:
            return f"[SKILL_ERROR] Unknown action: {action}. Available: {', '.join(handlers.keys())}"

        return await handler(params)

    async def _trivia(self, params: dict[str, Any]) -> str:
        """Get trivia questions from Open Trivia Database."""
        amount = min(params.get("amount", 5), 10)
        category = params.get("category")  # 9-32
        difficulty = params.get("difficulty")  # easy, medium, hard
        try:
            query_params: dict[str, Any] = {"amount": amount, "type": "multiple"}
            if category:
                query_params["category"] = category
            if difficulty:
                query_params["difficulty"] = difficulty

            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get("https://opentdb.com/api.php", params=query_params)
                resp.raise_for_status()
                data = resp.json()

            if data.get("response_code") != 0:
                return "[SKILL_ERROR] Trivia API returned no results. Try different category/difficulty."

            import html as html_mod
            questions = data.get("results", [])
            lines = [f"**Trivia Quiz** ({len(questions)} questions)\n"]

            for i, q in enumerate(questions, 1):
                question = html_mod.unescape(q["question"])
                correct = html_mod.unescape(q["correct_answer"])
                incorrect = [html_mod.unescape(a) for a in q["incorrect_answers"]]
                category_name = html_mod.unescape(q.get("category", ""))
                diff = q.get("difficulty", "")

                all_answers = incorrect + [correct]
                all_answers.sort()

                lines.append(f"**Q{i}.** [{category_name} / {diff}] {question}")
                for j, ans in enumerate(all_answers):
                    marker = " ✓" if ans == correct else ""
                    lines.append(f"  {chr(65 + j)}) {ans}{marker}")
                lines.append("")

            logger.info("Trivia fetched: %d questions", len(questions))
            return "\n".join(lines)
        except Exception as e:
            logger.warning("Trivia fetch failed: %s", e)
            return f"[SKILL_ERROR] Trivia failed: {str(e)}"

    async def _quote(self, params: dict[str, Any]) -> str:
        """Get inspirational quotes from ZenQuotes."""
        mode = params.get("mode", "random")  # random or today
        try:
            endpoint = "random" if mode != "today" else "today"
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(f"https://zenquotes.io/api/{endpoint}")
                resp.raise_for_status()
                data = resp.json()

            if not data:
                return "No quotes available."

            lines = ["**Inspirational Quote**\n"]
            for q in data[:3]:
                quote_text = q.get("q", "")
                author = q.get("a", "Unknown")
                lines.append(f'> "{quote_text}"\n> — {author}\n')

            logger.info("ZenQuotes fetched: %d quotes", len(data[:3]))
            return "\n".join(lines)
        except Exception as e:
            logger.warning("ZenQuotes fetch failed: %s", e)
            return f"[SKILL_ERROR] Quote fetch failed: {str(e)}"

    async def _shorten_url(self, params: dict[str, Any]) -> str:
        """Shorten a URL using pyshorteners (TinyURL)."""
        url = params.get("url", "")
        if not url:
            return "[SKILL_ERROR] Missing parameter: url"
        try:
            import pyshorteners
            s = pyshorteners.Shortener()
            short = s.tinyurl.short(url)
            logger.info("URL shortened: %s → %s", url, short)
            return f"**URL Shortened**\n\nOriginal: {url}\nShort: {short}"
        except Exception as e:
            logger.warning("URL shortening failed: %s", e)
            return f"[SKILL_ERROR] URL shortening failed: {str(e)}"
