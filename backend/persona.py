import json
import logging
from typing import Optional

from pydantic import BaseModel, Field

from .config import _config_dir, _ensure_config_dir

logger = logging.getLogger(__name__)

_persona_file = _config_dir / "persona.json"


class PersonalityConfig(BaseModel):
    traits: list[str] = ["friendly", "helpful"]
    tone: str = ""
    speaking_style: str = ""


class BehaviorConfig(BaseModel):
    greeting: str = ""
    custom_instructions: str = ""


class PersonaConfig(BaseModel):
    name: str = "Sancho"
    greeting_name: str = ""  # What the user calls the AI (e.g. "산초야")
    role: str = ""
    personality: PersonalityConfig = PersonalityConfig()
    behavior: BehaviorConfig = BehaviorConfig()


def load_persona() -> PersonaConfig:
    """Load persona config from disk, falling back to defaults."""
    _ensure_config_dir()
    if _persona_file.exists():
        try:
            data = json.loads(_persona_file.read_text(encoding="utf-8"))
            return PersonaConfig(**data)
        except Exception:
            logger.warning("Failed to load persona.json, using defaults")
    return PersonaConfig()


def save_persona(persona: PersonaConfig) -> None:
    _ensure_config_dir()
    _persona_file.write_text(
        json.dumps(persona.model_dump(), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def build_persona_prompt(persona: Optional[PersonaConfig] = None) -> Optional[str]:
    """Build a system prompt block from the persona config."""
    if persona is None:
        persona = load_persona()

    # If only default name and nothing else configured, skip
    has_config = (
        persona.role
        or persona.greeting_name
        or persona.personality.tone
        or persona.personality.speaking_style
        or persona.personality.traits != ["friendly", "helpful"]
        or persona.behavior.greeting
        or persona.behavior.custom_instructions
    )
    if not has_config and persona.name == "Sancho":
        return None

    lines = ["\nYour identity and personality:"]
    lines.append(f"- Your name is: {persona.name}")
    if persona.greeting_name:
        lines.append(f"- Users call you: \"{persona.greeting_name}\"")
    if persona.role:
        lines.append(f"- Your role: {persona.role}")
    if persona.personality.traits:
        lines.append(f"- Personality traits: {', '.join(persona.personality.traits)}")
    if persona.personality.tone:
        lines.append(f"- Tone of voice: {persona.personality.tone}")
    if persona.personality.speaking_style:
        lines.append(f"- Speaking style: {persona.personality.speaking_style}")

    if persona.behavior.greeting:
        lines.append(f"\nDefault greeting: {persona.behavior.greeting}")
    if persona.behavior.custom_instructions:
        lines.append(f"\nSpecial behavioral instructions:\n{persona.behavior.custom_instructions}")

    lines.append(f"\nIMPORTANT: You ARE {persona.name}. Always stay in character.")
    lines.append(f"Refer to yourself as {persona.name}.")
    lines.append("")

    return "\n".join(lines)
