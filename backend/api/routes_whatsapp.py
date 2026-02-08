import logging

from fastapi import APIRouter
from pydantic import BaseModel

from ..config import get_config
from ..integrations.chatapp_handler import process_chat_message

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/whatsapp", tags=["whatsapp"])


class ProcessRequest(BaseModel):
    sender: str
    text: str
    model: str = ""


@router.post("/process")
async def process_message(req: ProcessRequest) -> dict:
    """Called by Electron Baileys when a WhatsApp message is received.
    Processes the message via LLM and returns a reply."""
    config = get_config()
    wa = config.whatsapp
    model = req.model or wa.default_model or config.llm.default_model

    logger.info("WhatsApp message from %s: %s", req.sender, req.text[:100])

    reply = await process_chat_message(
        sender=req.sender,
        text=req.text,
        app_name="whatsapp",
        default_model=model,
        browser_keywords=wa.browser_keywords,
    )
    return {"reply": reply}
