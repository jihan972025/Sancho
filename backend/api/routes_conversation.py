import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..conversation.models import Conversation
from ..conversation import storage

router = APIRouter(prefix="/api/conversations", tags=["conversations"])


class CreateConversationRequest(BaseModel):
    title: str = ""
    model: str = ""


class RenameConversationRequest(BaseModel):
    title: str


@router.get("")
async def list_conversations():
    summaries = storage.list_conversations()
    return {"conversations": [s.model_dump() for s in summaries]}


@router.post("")
async def create_conversation(req: CreateConversationRequest):
    now = datetime.now(timezone.utc).isoformat()
    conv = Conversation(
        id=uuid.uuid4().hex[:12],
        title=req.title or "New conversation",
        model=req.model,
        messages=[],
        created_at=now,
        updated_at=now,
    )
    storage.save_conversation(conv)
    return {"conversation": conv.model_dump()}


@router.get("/{conv_id}")
async def get_conversation(conv_id: str):
    conv = storage.get_conversation(conv_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {"conversation": conv.model_dump()}


@router.put("/{conv_id}")
async def rename_conversation(conv_id: str, req: RenameConversationRequest):
    summary = storage.rename_conversation(conv_id, req.title)
    if not summary:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {"conversation": summary.model_dump()}


@router.delete("/{conv_id}")
async def delete_conversation(conv_id: str):
    if storage.delete_conversation(conv_id):
        return {"status": "deleted"}
    raise HTTPException(status_code=404, detail="Conversation not found")
