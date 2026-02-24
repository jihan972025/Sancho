import asyncio
import json
import logging

from .llm.registry import get_provider_for_model
from .memory import add_memories

logger = logging.getLogger(__name__)

_EXTRACT_PROMPT = """\
You are a memory extraction assistant. Analyze the conversation below and extract \
important facts about the user that should be remembered for future conversations.

Extract ONLY concrete, specific facts such as:
- Personal info (name, location, job, age, etc.) → category: "fact"
- Preferences (likes, dislikes, favorite things) → category: "preference"
- Instructions or requests about how to behave → category: "instruction"
- Important events (moved, got married, upcoming meetings, etc.) → category: "event"
- Relationships (family, friends, colleagues with names) → category: "relationship"
- Current life context (ongoing projects, situations) → category: "context"

Do NOT extract:
- Temporary or session-specific info (e.g. "user asked about weather today")
- Vague or obvious statements
- Anything the assistant said about itself

For each item, also assign an "importance" score from 1 to 5:
- 5: Core identity info (name, job, family)
- 4: Significant preferences or ongoing situations
- 3: Useful context (current projects, interests)
- 2: Minor preferences or one-time mentions
- 1: Trivial or uncertain information

Respond with a JSON array of objects. Each object has:
- "content": the fact (short sentence)
- "category": one of "fact", "preference", "instruction", "event", "relationship", "context"
- "importance": integer 1-5

If there is nothing worth remembering, respond with an empty array: []

Example response:
[
  {"content": "User's name is Alex", "category": "fact", "importance": 5},
  {"content": "User prefers Korean language responses", "category": "preference", "importance": 4},
  {"content": "User's sister is named Minji", "category": "relationship", "importance": 4},
  {"content": "User is currently preparing for a job change", "category": "context", "importance": 3}
]

Conversation:
"""


async def extract_memories_background(
    messages: list[dict],
    model: str,
    source: str = "",
    conversation_id: str = "",
) -> None:
    """Fire-and-forget memory extraction from recent messages."""
    try:
        provider = get_provider_for_model(model)
        if not provider:
            return

        # Use only the last 6 messages to reduce cost
        recent = messages[-6:] if len(messages) > 6 else messages

        # Build conversation text
        conv_lines = []
        for m in recent:
            role = m.get("role", "unknown")
            content = m.get("content", "")
            if role == "system":
                continue
            conv_lines.append(f"{role}: {content}")

        if not conv_lines:
            return

        conversation_text = "\n".join(conv_lines)
        extract_messages = [
            {"role": "user", "content": _EXTRACT_PROMPT + conversation_text},
        ]

        response = await provider.complete(extract_messages, model)

        # Parse JSON from response — handle markdown code blocks
        text = response.strip()
        if text.startswith("```"):
            # Remove ```json ... ``` wrapper
            lines = text.split("\n")
            text = "\n".join(lines[1:-1]) if len(lines) > 2 else text
            text = text.strip()

        items = json.loads(text)
        if isinstance(items, list) and items:
            add_memories(items, source=source or model, conversation_id=conversation_id)

    except json.JSONDecodeError:
        logger.debug("Memory extraction returned non-JSON, skipping")
    except Exception as e:
        logger.debug("Memory extraction failed: %s", e)


def trigger_memory_extraction(
    messages: list[dict],
    model: str,
    source: str = "",
    conversation_id: str = "",
) -> None:
    """Schedule memory extraction as a background task."""
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            loop.create_task(
                extract_memories_background(messages, model, source, conversation_id)
            )
        else:
            asyncio.run(
                extract_memories_background(messages, model, source, conversation_id)
            )
    except RuntimeError:
        logger.debug("Could not schedule memory extraction (no event loop)")
