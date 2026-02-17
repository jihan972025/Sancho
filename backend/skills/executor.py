import json
import logging
import re
from typing import Any, Optional

from .registry import get_skill

logger = logging.getLogger(__name__)

_SKILL_CALL_PATTERN = re.compile(
    r"\[SKILL_CALL\](.*?)\[/SKILL_CALL\]", re.DOTALL
)
_SKILL_RESULT_PATTERN = re.compile(
    r"\[SKILL_RESULT[^\]]*\].*?\[/SKILL_RESULT\]", re.DOTALL
)


def parse_skill_call(response: str) -> Optional[dict[str, Any]]:
    """Parse a [SKILL_CALL]...[/SKILL_CALL] block from LLM response.

    Returns dict with 'skill' and 'params' keys, or None if no skill call found.
    """
    match = _SKILL_CALL_PATTERN.search(response)
    if not match:
        return None
    try:
        data = json.loads(match.group(1).strip())
        if "skill" not in data:
            logger.warning("Skill call missing 'skill' field")
            return None
        return {
            "skill": data["skill"],
            "params": data.get("params", {}),
        }
    except json.JSONDecodeError as e:
        logger.warning(f"Failed to parse skill call JSON: {e}")
        return None


def strip_hallucinated_results(response: str) -> str:
    """Remove any [SKILL_RESULT] blocks hallucinated by the LLM.

    Only the backend should inject these blocks.  If the LLM fabricates
    them, the user would see fake data.  This function strips them and
    logs a warning.
    """
    cleaned, count = _SKILL_RESULT_PATTERN.subn("", response)
    if count:
        logger.warning(
            "Stripped %d hallucinated [SKILL_RESULT] block(s) from LLM response",
            count,
        )
        # Collapse leftover blank lines
        cleaned = re.sub(r"\n{3,}", "\n\n", cleaned).strip()
    return cleaned


async def execute_skill_call(skill_call: dict[str, Any]) -> str:
    """Execute a parsed skill call and return the result string."""
    skill_name = skill_call["skill"]
    params = skill_call.get("params", {})

    executor = get_skill(skill_name)
    if not executor:
        return f"[SKILL_ERROR] Skill '{skill_name}' is not available or not configured."

    try:
        result = await executor.execute(params)
        return result
    except Exception as e:
        logger.error(f"Skill '{skill_name}' execution failed: {e}", exc_info=True)
        return f"[SKILL_ERROR] Skill '{skill_name}' failed: {str(e)}"
