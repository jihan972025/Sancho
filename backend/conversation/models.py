from datetime import datetime, timezone

from pydantic import BaseModel, Field


class ConversationMessage(BaseModel):
    role: str  # "user" | "assistant" | "system"
    content: str
    timestamp: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    source: str = ""  # "chat" | "whatsapp" | "telegram" | "matrix"


class Conversation(BaseModel):
    id: str
    title: str
    model: str = ""
    messages: list[ConversationMessage] = []
    created_at: str = ""
    updated_at: str = ""


class ConversationSummary(BaseModel):
    """Lightweight metadata for list view (stored in _index.json)."""

    id: str
    title: str
    model: str = ""
    message_count: int = 0
    preview: str = ""  # First ~80 chars of first user message
    created_at: str = ""
    updated_at: str = ""
