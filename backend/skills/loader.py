import logging
from pathlib import Path
from typing import Optional

from .registry import get_configured_skills, get_definitions_dir
from ..config import get_config

logger = logging.getLogger(__name__)

# Module-level cache — rebuilt when skills are reset
_cached_skill_prompt: Optional[str] = None
_cached_skill_reminder: Optional[str] = None


def _load_md(filename: str) -> str:
    filepath = get_definitions_dir() / filename
    if not filepath.exists():
        logger.warning(f"Skill definition not found: {filepath}")
        return ""
    return filepath.read_text(encoding="utf-8")


def _build_and_cache() -> tuple[Optional[str], Optional[str]]:
    """Build the full skill prompt and a compact reminder, cache both."""
    global _cached_skill_prompt, _cached_skill_reminder

    configured = get_configured_skills()
    if not configured:
        _cached_skill_prompt = None
        _cached_skill_reminder = None
        return None, None

    master = _load_md("skill-master.md")
    if not master:
        _cached_skill_prompt = None
        _cached_skill_reminder = None
        return None, None

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
        _cached_skill_prompt = None
        _cached_skill_reminder = None
        return None, None

    skill_list = "\n\n---\n\n".join(skill_list_parts)
    _cached_skill_prompt = master.replace("{SKILL_LIST}", skill_list)

    # Build compact reminder for Phase 2 / general messages
    skill_names = sorted(configured.keys())
    _cached_skill_reminder = (
        "You have access to the following skills via [SKILL_CALL] blocks: "
        + ", ".join(skill_names) + ".\n"
        "To call a skill, output ONLY: [SKILL_CALL]{\"skill\": \"<name>\", \"params\": {…}}[/SKILL_CALL]\n"
        "NEVER generate [SKILL_RESULT] blocks — only the backend system creates them after real API execution.\n"
        "NEVER say you don't have access to a service — use the matching skill instead."
    )

    return _cached_skill_prompt, _cached_skill_reminder


def build_skill_system_prompt() -> Optional[str]:
    """Build the full skill system prompt with all configured skill definitions.

    Returns None if no skills are configured (zero overhead path).
    Used in Phase 1 as the sole system instruction for skill routing.
    """
    if _cached_skill_prompt is None and not _cached_skill_reminder:
        _build_and_cache()
    return _cached_skill_prompt


def build_skill_reminder() -> Optional[str]:
    """Return a compact skill-awareness block for Phase 2 and general messages.

    Contains: active skill list, [SKILL_CALL] format, anti-hallucination rule.
    Much shorter than the full prompt — safe to inject into any system message.
    Returns None if no skills are configured.
    """
    if _cached_skill_reminder is None and not _cached_skill_prompt:
        _build_and_cache()
    return _cached_skill_reminder


def reset_skill_cache() -> None:
    """Clear the cached prompts. Called when skills are reset."""
    global _cached_skill_prompt, _cached_skill_reminder
    _cached_skill_prompt = None
    _cached_skill_reminder = None
