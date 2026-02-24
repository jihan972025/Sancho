"""Conversation summarizer — generates concise summaries of past conversations
and injects relevant context into new conversations."""

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Optional

from pydantic import BaseModel, Field

from ..config import _config_dir, _ensure_config_dir

logger = logging.getLogger(__name__)

_summaries_file = _config_dir / "conversation_summaries.json"

_MAX_SUMMARIES = 200  # Max summaries to keep on disk
_INJECT_COUNT = 5     # How many recent summaries to inject into system prompt


class ConversationSummaryRecord(BaseModel):
    conversation_id: str
    title: str = ""
    summary: str = ""
    key_topics: list[str] = []
    created_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    message_count: int = 0


# ---------------------------------------------------------------------------
# Storage
# ---------------------------------------------------------------------------

def load_summaries() -> list[ConversationSummaryRecord]:
    _ensure_config_dir()
    if _summaries_file.exists():
        try:
            data = json.loads(_summaries_file.read_text(encoding="utf-8"))
            return [ConversationSummaryRecord(**s) for s in data]
        except Exception:
            logger.warning("Failed to load conversation_summaries.json")
    return []


def save_summaries(summaries: list[ConversationSummaryRecord]) -> None:
    _ensure_config_dir()
    # Keep only the most recent N
    if len(summaries) > _MAX_SUMMARIES:
        summaries = sorted(summaries, key=lambda s: s.created_at, reverse=True)[
            :_MAX_SUMMARIES
        ]
    _summaries_file.write_text(
        json.dumps(
            [s.model_dump() for s in summaries], ensure_ascii=False, indent=2
        ),
        encoding="utf-8",
    )


def get_summary_for_conversation(conv_id: str) -> Optional[ConversationSummaryRecord]:
    for s in load_summaries():
        if s.conversation_id == conv_id:
            return s
    return None


# ---------------------------------------------------------------------------
# Summary generation
# ---------------------------------------------------------------------------

_SUMMARIZE_PROMPT = """\
You are a conversation summarizer. Given the conversation below, produce a JSON object with:
- "summary": a 1-3 sentence summary capturing the key points
- "key_topics": an array of 3-5 keyword topics (short strings)

Focus on what the user wanted, what was discussed, any decisions made, and unresolved items.
Respond ONLY with a valid JSON object. No markdown, no explanation.

Example:
{"summary": "User asked for help debugging a React useEffect infinite loop. The cause was an object dependency. Fixed with useMemo.", "key_topics": ["React", "useEffect", "debugging", "performance"]}

Conversation:
"""


async def generate_summary(
    messages: list[dict],
    title: str,
    model: str,
    conversation_id: str,
) -> Optional[ConversationSummaryRecord]:
    """Generate a summary for the given conversation messages using the LLM."""
    try:
        from ..llm.registry import get_provider_for_model

        provider = get_provider_for_model(model)
        if not provider:
            return None

        # Build conversation text from user/assistant messages only
        conv_lines = []
        for m in messages:
            role = m.get("role", "") if isinstance(m, dict) else getattr(m, "role", "")
            content = m.get("content", "") if isinstance(m, dict) else getattr(m, "content", "")
            if role == "system":
                continue
            conv_lines.append(f"{role}: {content}")

        if len(conv_lines) < 4:
            # Too short to summarize
            return None

        conversation_text = "\n".join(conv_lines)
        # Truncate to avoid excessive cost
        if len(conversation_text) > 8000:
            conversation_text = conversation_text[:8000] + "\n...(truncated)"

        extract_messages = [
            {"role": "user", "content": _SUMMARIZE_PROMPT + conversation_text},
        ]

        response = await provider.complete(extract_messages, model)

        # Parse JSON
        text = response.strip()
        if text.startswith("```"):
            lines = text.split("\n")
            text = "\n".join(lines[1:-1]) if len(lines) > 2 else text
            text = text.strip()

        data = json.loads(text)

        record = ConversationSummaryRecord(
            conversation_id=conversation_id,
            title=title,
            summary=data.get("summary", ""),
            key_topics=data.get("key_topics", []),
            message_count=len(conv_lines),
        )

        # Save
        summaries = load_summaries()
        # Replace existing summary for same conversation
        summaries = [s for s in summaries if s.conversation_id != conversation_id]
        summaries.append(record)
        save_summaries(summaries)

        logger.info("Generated summary for conversation %s", conversation_id)
        return record

    except json.JSONDecodeError:
        logger.debug("Summary generation returned non-JSON, skipping")
    except Exception as e:
        logger.debug("Summary generation failed: %s", e)
    return None


def trigger_summary_generation(
    messages: list[dict],
    title: str,
    model: str,
    conversation_id: str,
) -> None:
    """Schedule summary generation as a background task."""
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            loop.create_task(
                generate_summary(messages, title, model, conversation_id)
            )
        else:
            asyncio.run(
                generate_summary(messages, title, model, conversation_id)
            )
    except RuntimeError:
        logger.debug("Could not schedule summary generation (no event loop)")


# ---------------------------------------------------------------------------
# Startup: summarize any missed conversations (e.g. after force-close)
# ---------------------------------------------------------------------------

async def summarize_unsummarized_conversations() -> None:
    """Find conversations that have enough messages but no summary, and generate
    summaries for them. Called once at app startup to recover from force-close."""
    try:
        from ..conversation import storage
        from ..config import get_config

        config = get_config()
        default_model = config.llm.default_model
        if not default_model:
            logger.debug("No default model configured, skipping startup summaries")
            return

        existing_summaries = load_summaries()
        summarized_ids = {s.conversation_id for s in existing_summaries}

        all_convs = storage.list_conversations()
        unsummarized = [
            c for c in all_convs
            if c.id not in summarized_ids and c.message_count >= 4
        ]

        if not unsummarized:
            return

        logger.info(
            "Found %d unsummarized conversations, generating summaries...",
            len(unsummarized),
        )

        # Limit to most recent 10 to avoid excessive API calls on first run
        unsummarized.sort(key=lambda c: c.updated_at, reverse=True)
        for conv_summary in unsummarized[:10]:
            conv = storage.get_conversation(conv_summary.id)
            if not conv or len(conv.messages) < 4:
                continue

            messages = [
                {"role": m.role, "content": m.content}
                for m in conv.messages
            ]
            model = conv.model or default_model
            try:
                await generate_summary(
                    messages=messages,
                    title=conv.title,
                    model=model,
                    conversation_id=conv.id,
                )
                # Small delay between API calls to avoid rate limiting
                await asyncio.sleep(1)
            except Exception as e:
                logger.debug("Failed to summarize conversation %s: %s", conv.id, e)

    except Exception as e:
        logger.warning("Startup summary generation failed: %s", e)


# ---------------------------------------------------------------------------
# Injection into system prompt
# ---------------------------------------------------------------------------

def build_conversation_context(max_summaries: int = _INJECT_COUNT) -> Optional[str]:
    """Build a system prompt block from recent conversation summaries."""
    summaries = load_summaries()
    if not summaries:
        return None

    # Sort by created_at desc, take most recent
    recent = sorted(summaries, key=lambda s: s.created_at, reverse=True)[
        :max_summaries
    ]

    if not recent:
        return None

    lines = ["\nPrevious conversation context (for continuity):"]
    for s in recent:
        date_str = s.created_at[:10] if s.created_at else "?"
        topics = ", ".join(s.key_topics) if s.key_topics else ""
        topic_part = f" [{topics}]" if topics else ""
        lines.append(f"- [{date_str}] {s.title}: {s.summary}{topic_part}")

    lines.append(
        "Use this context to maintain continuity. "
        "If the user references past conversations, use these summaries to respond appropriately."
    )
    lines.append("")

    return "\n".join(lines)
