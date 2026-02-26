import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from pydantic import BaseModel, Field

from .config import _config_dir, _ensure_config_dir

logger = logging.getLogger(__name__)

_memories_file = _config_dir / "memories.json"


class Memory(BaseModel):
    id: str = Field(default_factory=lambda: uuid.uuid4().hex[:12])
    content: str
    category: str = "fact"  # fact | preference | instruction | event | relationship | context
    importance: int = 3  # 1-5, higher = more important
    conversation_id: str = ""  # Which conversation this was extracted from
    created_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    last_accessed: str = ""  # Last time this memory was included in a prompt
    access_count: int = 0
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


def add_memories(
    new_items: list[dict], source: str = "", conversation_id: str = ""
) -> list[Memory]:
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
            importance=item.get("importance", 3),
            source=source,
            conversation_id=conversation_id,
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


def add_trade_memory(trade: dict, action: str = "SELL") -> Optional[Memory]:
    """Save a completed trade (BUY+SELL) as a long-term memory.

    Called after a sell execution so the full round-trip is recorded,
    or after a buy to note that a position was opened.
    """
    coin = trade.get("coin", "?")
    cs = trade.get("currency_symbol", "₩")

    if action == "SELL":
        entry_price = trade.get("entry_price", 0)
        exit_price = trade.get("exit_price", 0)
        pnl_pct = trade.get("pnl_pct", 0)
        pnl_krw = trade.get("pnl_krw", 0)
        buy_reason = trade.get("buy_reasoning", "")
        sell_reason = trade.get("sell_reasoning", "")
        entry_time = trade.get("entry_time", "")
        exit_time = trade.get("exit_time", "")
        exchange = trade.get("exchange", "")

        # Format date portion only
        entry_date = entry_time[:10] if entry_time else "?"
        exit_date = exit_time[:10] if exit_time else "?"
        result_emoji = "수익" if pnl_pct >= 0 else "손실"

        content = (
            f"[자동매매 거래완료] {exchange} {coin} "
            f"매수 {cs}{entry_price:,.0f} → 매도 {cs}{exit_price:,.0f} | "
            f"{result_emoji} {pnl_pct:+.2f}% ({cs}{pnl_krw:,.0f}) | "
            f"{entry_date}~{exit_date}"
        )
        if sell_reason:
            content += f" | 매도사유: {sell_reason[:80]}"

        importance = 4 if abs(pnl_pct) >= 1.0 else 3
    else:
        # BUY — record position open
        entry_price = trade.get("entry_price", 0)
        amount = trade.get("amount_krw", 0)
        reason = trade.get("buy_reasoning", "") or trade.get("reasoning", "")
        entry_time = trade.get("entry_time", "")
        entry_date = entry_time[:10] if entry_time else "?"
        exchange = trade.get("exchange", "")

        content = (
            f"[자동매매 매수] {exchange} {coin} "
            f"매수가 {cs}{entry_price:,.0f} | 투자금 {cs}{amount:,.0f} | "
            f"{entry_date}"
        )
        if reason:
            content += f" | 매수사유: {reason[:80]}"

        importance = 3

    added = add_memories(
        [{"content": content, "category": "event", "importance": importance}],
        source="autotrading",
    )
    return added[0] if added else None


def build_memory_prompt(
    recent_message: str = "", max_chars: int = 3000
) -> Optional[str]:
    """Build a system prompt block from enabled memories.

    Uses relevance-based selection:
    1. High-importance memories (importance >= 4) always included
    2. Keyword-matched memories from recent_message
    3. Remaining memories sorted by importance desc
    """
    enabled = get_enabled_memories()
    if not enabled:
        return None

    selected: list[Memory] = []
    selected_ids: set[str] = set()

    # 1. Always include high-importance memories
    for m in enabled:
        if m.importance >= 4 and m.id not in selected_ids:
            selected.append(m)
            selected_ids.add(m.id)

    # 2. Keyword matching from recent message
    if recent_message:
        msg_lower = recent_message.lower()
        words = set(msg_lower.split())
        for m in enabled:
            if m.id in selected_ids:
                continue
            content_lower = m.content.lower()
            # Check if any word from the message appears in the memory
            if any(w in content_lower for w in words if len(w) > 2):
                selected.append(m)
                selected_ids.add(m.id)

    # 3. Fill remaining by importance desc
    remaining = [m for m in enabled if m.id not in selected_ids]
    remaining.sort(key=lambda m: m.importance, reverse=True)
    selected.extend(remaining)

    # Build output with char limit
    lines: list[str] = []
    total = 0
    now = datetime.now(timezone.utc).isoformat()
    accessed_ids: list[str] = []

    for m in selected:
        line = f"- [{m.category}] {m.content}"
        if total + len(line) > max_chars:
            break
        lines.append(line)
        total += len(line) + 1
        accessed_ids.append(m.id)

    if not lines:
        return None

    # Update access stats in background
    _update_access_stats(accessed_ids, now)

    return (
        "\nUser memory (facts learned from previous conversations):\n"
        + "\n".join(lines)
        + "\n"
    )


def _update_access_stats(memory_ids: list[str], timestamp: str) -> None:
    """Update last_accessed and access_count for selected memories."""
    try:
        memories = load_memories()
        changed = False
        id_set = set(memory_ids)
        for m in memories:
            if m.id in id_set:
                m.last_accessed = timestamp
                m.access_count += 1
                changed = True
        if changed:
            save_memories(memories)
    except Exception:
        pass  # Non-critical, don't break the flow
