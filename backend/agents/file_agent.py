import json
import logging
from pathlib import Path
from typing import Optional

from ..file_ops.manager import list_directory, move_path, create_directory, FileInfo
from ..llm.registry import get_provider_for_model
from ..config import get_config

logger = logging.getLogger(__name__)

ORGANIZE_SYSTEM_PROMPT = """You are a file organization assistant. Given a list of files in a directory,
suggest how to organize them into logical folders.

Respond with a JSON array of move operations:
[
  {"src": "original_filename", "dst": "subfolder/filename"},
  ...
]

Rules:
- Group files by type/purpose (e.g., images, documents, code, etc.)
- Keep folder names simple and lowercase
- Don't rename files, only move them into subfolders
- If a file doesn't need to be moved, omit it
- Respond ONLY with the JSON array, no other text
"""


async def organize_directory(
    path: str,
    model: Optional[str] = None,
    instructions: str = "",
) -> list[dict]:
    """Use LLM to suggest and execute file organization for a directory."""
    config = get_config()
    model = model or config.llm.default_model

    provider = get_provider_for_model(model)
    if not provider:
        raise ValueError(f"No provider available for model: {model}")

    files = list_directory(path)
    file_list = "\n".join(
        f"{'[DIR] ' if f.is_dir else ''}{f.name} ({f.size} bytes)"
        for f in files
    )

    user_msg = f"Directory: {path}\n\nFiles:\n{file_list}"
    if instructions:
        user_msg += f"\n\nAdditional instructions: {instructions}"

    messages = [
        {"role": "system", "content": ORGANIZE_SYSTEM_PROMPT},
        {"role": "user", "content": user_msg},
    ]

    response = await provider.complete(messages, model)

    try:
        # Extract JSON from response
        text = response.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1].rsplit("```", 1)[0]
        operations = json.loads(text)
    except (json.JSONDecodeError, IndexError) as e:
        logger.error(f"Failed to parse LLM response: {response}")
        raise ValueError(f"LLM returned invalid response: {e}")

    results = []
    base = Path(path)
    for op in operations:
        src = str(base / op["src"])
        dst = str(base / op["dst"])
        try:
            dst_dir = str(Path(dst).parent)
            create_directory(dst_dir)
            moved = move_path(src, dst)
            results.append({"src": op["src"], "dst": op["dst"], "status": "ok"})
        except Exception as e:
            results.append({"src": op["src"], "dst": op["dst"], "status": "error", "error": str(e)})

    return results
