"""Trivia quiz skill executor."""

import html as html_mod
import logging
from typing import Any

import httpx

from ..base import SkillExecutor

logger = logging.getLogger(__name__)


class TriviaExecutor(SkillExecutor):
    name = "trivia"

    def __init__(self, config):
        pass

    def is_configured(self) -> bool:
        return True

    async def execute(self, params: dict[str, Any]) -> str:
        amount = min(params.get("amount", 5), 10)
        category = params.get("category")
        difficulty = params.get("difficulty")

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
