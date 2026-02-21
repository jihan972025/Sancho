import logging

from fastapi import APIRouter
from pydantic import BaseModel

from ..config import get_config
from ..integrations.chatapp_handler import process_chat_message

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/slack", tags=["slack"])


class ProcessRequest(BaseModel):
    sender: str
    text: str
    model: str = ""


@router.post("/process")
async def process_message(req: ProcessRequest) -> dict:
    """Called by Electron @slack/bolt when a Slack message is received."""
    config = get_config()
    sl = config.slack
    model = req.model or sl.default_model or config.llm.default_model

    logger.info("Slack message from %s: %s", req.sender, req.text[:100])

    reply = await process_chat_message(
        sender=req.sender,
        text=req.text,
        app_name="slack",
        default_model=model,
        browser_keywords=sl.browser_keywords,
        file_organize_keywords=sl.file_organize_keywords,
    )
    return {"reply": reply}
