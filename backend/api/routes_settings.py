from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel

from ..config import get_config, update_config, AppConfig, load_user_md, save_user_md, load_sancho_md, save_sancho_md
from ..llm.registry import reset_providers
from ..skills.registry import reset_skills
from ..persona import (
    load_persona,
    save_persona,
    PersonaConfig,
    PersonalityConfig,
    BehaviorConfig,
)

router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("")
async def get_settings():
    config = get_config()
    return config.model_dump()


@router.put("")
async def update_settings(config: AppConfig):
    updated = update_config(config)
    reset_providers()  # Force re-init of LLM providers with new keys
    reset_skills()  # Force re-init of skill executors with new config
    return updated.model_dump()


class UserProfileRequest(BaseModel):
    name: str
    gender: str
    language: str
    country: str
    city: str
    timezone: str = "Asia/Seoul"


@router.get("/user-profile")
async def get_user_profile():
    content = load_user_md()
    return {"exists": content is not None, "content": content}


@router.put("/user-profile")
async def update_user_profile(profile: UserProfileRequest):
    md = (
        "# User Profile\n"
        f"- Name: {profile.name}\n"
        f"- Gender: {profile.gender}\n"
        f"- Language: {profile.language}\n"
        f"- Country: {profile.country}\n"
        f"- City: {profile.city}\n"
        f"- Timezone: {profile.timezone}\n"
    )
    save_user_md(md)
    # Also update language in config
    config = get_config()
    config.language = profile.language
    update_config(config)
    return {"status": "ok"}


class SanchoProfileRequest(BaseModel):
    nickname: str
    role: str


@router.get("/sancho-profile")
async def get_sancho_profile():
    content = load_sancho_md()
    return {"exists": content is not None, "content": content}


@router.put("/sancho-profile")
async def update_sancho_profile(profile: SanchoProfileRequest):
    md = (
        "# Sancho Profile\n"
        f"- Nickname: {profile.nickname}\n"
        f"- Role: {profile.role}\n"
    )
    save_sancho_md(md)
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Persona API
# ---------------------------------------------------------------------------

class PersonalityRequest(BaseModel):
    traits: list[str] = ["friendly", "helpful"]
    tone: str = ""
    speaking_style: str = ""


class BehaviorRequest(BaseModel):
    greeting: str = ""
    custom_instructions: str = ""


class PersonaRequest(BaseModel):
    name: str = "Sancho"
    greeting_name: str = ""
    role: str = ""
    personality: PersonalityRequest = PersonalityRequest()
    behavior: BehaviorRequest = BehaviorRequest()


@router.get("/persona")
async def get_persona():
    persona = load_persona()
    return persona.model_dump()


@router.put("/persona")
async def update_persona(req: PersonaRequest):
    persona = PersonaConfig(
        name=req.name,
        greeting_name=req.greeting_name,
        role=req.role,
        personality=PersonalityConfig(
            traits=req.personality.traits,
            tone=req.personality.tone,
            speaking_style=req.personality.speaking_style,
        ),
        behavior=BehaviorConfig(
            greeting=req.behavior.greeting,
            custom_instructions=req.behavior.custom_instructions,
        ),
    )
    save_persona(persona)
    # Also update SANCHO.md for backward compatibility
    md = (
        "# Sancho Profile\n"
        f"- Nickname: {persona.name}\n"
        f"- Role: {persona.role}\n"
    )
    save_sancho_md(md)
    return {"status": "ok"}


_PERSONA_PRESETS = [
    {
        "id": "friendly_assistant",
        "label": "Friendly Assistant",
        "label_ko": "친근한 비서",
        "persona": {
            "name": "Sancho",
            "greeting_name": "",
            "role": "Personal assistant",
            "personality": {
                "traits": ["friendly", "helpful", "cheerful"],
                "tone": "Warm and casual",
                "speaking_style": "Short, clear sentences with occasional humor",
            },
            "behavior": {
                "greeting": "Hey! What can I help you with today?",
                "custom_instructions": "",
            },
        },
    },
    {
        "id": "professional_consultant",
        "label": "Professional Consultant",
        "label_ko": "전문 컨설턴트",
        "persona": {
            "name": "Sancho",
            "greeting_name": "",
            "role": "Professional consultant and advisor",
            "personality": {
                "traits": ["professional", "analytical", "thorough"],
                "tone": "Polite and formal",
                "speaking_style": "Structured, detailed explanations with clear reasoning",
            },
            "behavior": {
                "greeting": "Hello. How may I assist you today?",
                "custom_instructions": "Provide well-structured answers with pros and cons when applicable.",
            },
        },
    },
    {
        "id": "casual_buddy",
        "label": "Casual Buddy",
        "label_ko": "캐주얼 친구",
        "persona": {
            "name": "Sancho",
            "greeting_name": "",
            "role": "Casual conversation partner and helper",
            "personality": {
                "traits": ["laid-back", "humorous", "empathetic"],
                "tone": "Very casual and relaxed",
                "speaking_style": "Informal, uses slang and jokes freely",
            },
            "behavior": {
                "greeting": "Yo! What's up?",
                "custom_instructions": "Keep things light and fun. Use humor when appropriate.",
            },
        },
    },
]


@router.get("/persona/presets")
async def get_persona_presets():
    return {"presets": _PERSONA_PRESETS}
