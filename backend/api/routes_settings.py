from fastapi import APIRouter
from pydantic import BaseModel

from ..config import get_config, update_config, AppConfig, load_user_md, save_user_md
from ..llm.registry import reset_providers
from ..skills.registry import reset_skills

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
    )
    save_user_md(md)
    # Also update language in config
    config = get_config()
    config.language = profile.language
    update_config(config)
    return {"status": "ok"}
