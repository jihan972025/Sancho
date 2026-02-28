import logging

from fastapi import APIRouter
from pydantic import BaseModel

from ..config import get_config
from ..integrations.chatapp_handler import process_chat_message

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/discord", tags=["discord"])


class ProcessRequest(BaseModel):
    sender: str
    text: str
    model: str = ""


@router.post("/process")
async def process_message(req: ProcessRequest) -> dict:
    """Called by Electron discord.js when a Discord message is received."""
    config = get_config()
    dc = config.discord
    model = req.model or dc.default_model or config.llm.default_model

    logger.info("Discord message from %s: %s", req.sender, req.text[:100])

    reply = await process_chat_message(
        sender=req.sender,
        text=req.text,
        app_name="discord",
        default_model=model,
        browser_keywords=dc.browser_keywords,
        file_organize_keywords=dc.file_organize_keywords,
    )
    return {"reply": reply}
