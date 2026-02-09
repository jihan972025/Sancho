import logging

from fastapi import APIRouter
from pydantic import BaseModel

from ..config import get_config
from ..integrations.chatapp_handler import process_chat_message

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/telegram", tags=["telegram"])


class ProcessRequest(BaseModel):
    sender: str
    text: str
    model: str = ""


@router.post("/process")
async def process_message(req: ProcessRequest) -> dict:
    """Called by Electron GramJS when a Telegram message is received."""
    config = get_config()
    tg = config.telegram
    model = req.model or tg.default_model or config.llm.default_model

    logger.info("Telegram message from %s: %s", req.sender, req.text[:100])

    reply = await process_chat_message(
        sender=req.sender,
        text=req.text,
        app_name="telegram",
        default_model=model,
        browser_keywords=tg.browser_keywords,
        file_organize_keywords=tg.file_organize_keywords,
    )
    return {"reply": reply}
