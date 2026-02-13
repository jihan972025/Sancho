import json
import logging
from datetime import datetime, timezone
from typing import Optional

from ..config import _config_dir, _ensure_config_dir
from .models import Conversation, ConversationMessage, ConversationSummary

logger = logging.getLogger(__name__)

_conv_dir = _config_dir / "conversations"
_index_file = _conv_dir / "_index.json"


def _ensure_conv_dir() -> None:
    _ensure_config_dir()
    _conv_dir.mkdir(parents=True, exist_ok=True)


# ---- Index helpers ----

def _load_index() -> list[dict]:
    _ensure_conv_dir()
    if _index_file.exists():
        try:
            return json.loads(_index_file.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            logger.warning("Failed to load conversations index")
    return []


def _save_index(items: list[dict]) -> None:
    _ensure_conv_dir()
    _index_file.write_text(
        json.dumps(items, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )


def _update_index_entry(conv: Conversation) -> None:
    """Update or insert the conversation summary in the index."""
    items = _load_index()
    preview = ""
    for m in conv.messages:
        if m.role == "user":
            preview = m.content[:80]
            break
    summary = {
        "id": conv.id,
        "title": conv.title,
        "model": conv.model,
        "message_count": len(conv.messages),
        "preview": preview,
        "created_at": conv.created_at,
        "updated_at": conv.updated_at,
    }
    for i, item in enumerate(items):
        if item["id"] == conv.id:
            items[i] = summary
            break
    else:
        items.append(summary)
    _save_index(items)


# ---- CRUD ----

def list_conversations() -> list[ConversationSummary]:
    """Return all conversation summaries, sorted by updated_at desc."""
    items = _load_index()
    summaries = [ConversationSummary(**item) for item in items]
    summaries.sort(key=lambda s: s.updated_at, reverse=True)
    return summaries


def get_conversation(conv_id: str) -> Optional[Conversation]:
    """Load a full conversation with messages from its JSON file."""
    _ensure_conv_dir()
    conv_file = _conv_dir / f"{conv_id}.json"
    if conv_file.exists():
        try:
            data = json.loads(conv_file.read_text(encoding="utf-8"))
            return Conversation(**data)
        except (json.JSONDecodeError, OSError):
            logger.error("Failed to load conversation %s", conv_id)
    return None


def save_conversation(conv: Conversation) -> None:
    """Save full conversation and update index."""
    _ensure_conv_dir()
    conv_file = _conv_dir / f"{conv.id}.json"
    conv_file.write_text(
        json.dumps(conv.model_dump(), indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    _update_index_entry(conv)


def delete_conversation(conv_id: str) -> bool:
    _ensure_conv_dir()
    conv_file = _conv_dir / f"{conv_id}.json"
    if conv_file.exists():
        conv_file.unlink()
    items = _load_index()
    before = len(items)
    items = [i for i in items if i["id"] != conv_id]
    if len(items) < before:
        _save_index(items)
        return True
    return False


def rename_conversation(
    conv_id: str, title: str
) -> Optional[ConversationSummary]:
    conv = get_conversation(conv_id)
    if not conv:
        return None
    conv.title = title
    conv.updated_at = datetime.now(timezone.utc).isoformat()
    save_conversation(conv)
    items = _load_index()
    for item in items:
        if item["id"] == conv_id:
            return ConversationSummary(**item)
    return None
