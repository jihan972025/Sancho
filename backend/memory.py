import json
import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from pydantic import BaseModel, Field

from .config import _config_dir, _ensure_config_dir

logger = logging.getLogger(__name__)

_memories_file = _config_dir / "memories.json"


class Memory(BaseModel):
    id: str = Field(default_factory=lambda: uuid.uuid4().hex[:12])
    content: str
    category: str = "fact"  # fact | preference | instruction
    created_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    source: str = ""  # model name or "manual"
    enabled: bool = True


def load_memories() -> list[Memory]:
    _ensure_config_dir()
    if _memories_file.exists():
        try:
            data = json.loads(_memories_file.read_text(encoding="utf-8"))
            return [Memory(**m) for m in data]
        except Exception:
            logger.warning("Failed to load memories.json, starting fresh")
    return []


def save_memories(memories: list[Memory]) -> None:
    _ensure_config_dir()
    _memories_file.write_text(
        json.dumps([m.model_dump() for m in memories], ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def add_memories(new_items: list[dict], source: str = "") -> list[Memory]:
    """Add new memories, skipping duplicates (case-insensitive content match)."""
    memories = load_memories()
    existing = {m.content.lower().strip() for m in memories}
    added: list[Memory] = []
    for item in new_items:
        content = item.get("content", "").strip()
        if not content:
            continue
        if content.lower() in existing:
            continue
        mem = Memory(
            content=content,
            category=item.get("category", "fact"),
            source=source,
        )
        memories.append(mem)
        existing.add(content.lower())
        added.append(mem)
    if added:
        save_memories(memories)
        logger.info("Added %d new memories", len(added))
    return added


def delete_memory(memory_id: str) -> bool:
    memories = load_memories()
    before = len(memories)
    memories = [m for m in memories if m.id != memory_id]
    if len(memories) < before:
        save_memories(memories)
        return True
    return False


def toggle_memory(memory_id: str) -> Optional[Memory]:
    memories = load_memories()
    for m in memories:
        if m.id == memory_id:
            m.enabled = not m.enabled
            save_memories(memories)
            return m
    return None


def get_enabled_memories() -> list[Memory]:
    return [m for m in load_memories() if m.enabled]


def clear_all_memories() -> int:
    memories = load_memories()
    count = len(memories)
    save_memories([])
    return count


def build_memory_prompt(max_chars: int = 2000) -> Optional[str]:
    """Build a system prompt block from enabled memories."""
    enabled = get_enabled_memories()
    if not enabled:
        return None

    lines: list[str] = []
    total = 0
    for m in enabled:
        line = f"- [{m.category}] {m.content}"
        if total + len(line) > max_chars:
            break
        lines.append(line)
        total += len(line) + 1  # +1 for newline

    if not lines:
        return None

    return (
        "\nUser memory (facts learned from previous conversations):\n"
        + "\n".join(lines)
        + "\n"
    )
