import logging

from fastapi import APIRouter
from pydantic import BaseModel

from ..config import get_config
from ..integrations.chatapp_handler import process_chat_message

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/matrix", tags=["matrix"])


class ProcessRequest(BaseModel):
    sender: str
    text: str
    model: str = ""


@router.post("/process")
async def process_message(req: ProcessRequest) -> dict:
    """Called by Electron matrix-js-sdk when a Matrix message is received."""
    config = get_config()
    mx = config.matrix
    model = req.model or mx.default_model or config.llm.default_model

    logger.info("Matrix message from %s: %s", req.sender, req.text[:100])

    reply = await process_chat_message(
        sender=req.sender,
        text=req.text,
        app_name="matrix",
        default_model=model,
        browser_keywords=mx.browser_keywords,
    )
    return {"reply": reply}
