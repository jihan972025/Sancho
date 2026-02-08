import logging
from pathlib import Path
from typing import Optional

from .registry import get_configured_skills, get_definitions_dir
from ..config import get_config

logger = logging.getLogger(__name__)


def _load_md(filename: str) -> str:
    filepath = get_definitions_dir() / filename
    if not filepath.exists():
        logger.warning(f"Skill definition not found: {filepath}")
        return ""
    return filepath.read_text(encoding="utf-8")


def build_skill_system_prompt() -> Optional[str]:
    """Build the skill system prompt with only configured skills.

    Returns None if no skills are configured (zero overhead path).
    """
    configured = get_configured_skills()
    if not configured:
        return None

    master = _load_md("skill-master.md")
    if not master:
        return None

    skill_list_parts = []
    for skill_name in configured:
        md = _load_md(f"skill-{skill_name}.md")
        if md:
            skill_list_parts.append(md)

    # Generate dynamic definitions for custom APIs
    config = get_config()
    for api_def in config.custom_apis:
        if api_def.name in configured:
            md = (
                f"### {api_def.name} — {api_def.display_name}\n\n"
                f"{api_def.description}\n\n"
                f"**Parameters:**\n"
                f"- `query` (string, required): The query or input to send to this API\n\n"
                f"**Example:**\n"
                f"```\n"
                f'[SKILL_CALL]{{"skill": "{api_def.name}", "params": {{"query": "example input"}}}}[/SKILL_CALL]\n'
                f"```"
            )
            skill_list_parts.append(md)

    if not skill_list_parts:
        return None

    skill_list = "\n\n---\n\n".join(skill_list_parts)
    prompt = master.replace("{SKILL_LIST}", skill_list)
    return prompt
