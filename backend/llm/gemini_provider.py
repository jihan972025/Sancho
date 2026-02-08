from typing import AsyncGenerator

from google import genai
from google.genai import types

from .base import LLMProvider


class GeminiProvider(LLMProvider):
    name = "gemini"
    models: list[str] = []  # Managed via Settings > LLM Models

    def __init__(self, api_key: str) -> None:
        self.client = genai.Client(api_key=api_key)

    def _build_contents(
        self, messages: list[dict]
    ) -> tuple[str | None, list[types.Content]]:
        system_instruction = None
        contents: list[types.Content] = []
        for msg in messages:
            role = msg["role"]
            text = msg["content"]
            if role == "system":
                system_instruction = text
            elif role == "assistant":
                contents.append(
                    types.Content(
                        role="model",
                        parts=[types.Part.from_text(text=text)],
                    )
                )
            else:
                contents.append(
                    types.Content(
                        role="user",
                        parts=[types.Part.from_text(text=text)],
                    )
                )
        return system_instruction, contents

    async def complete(
        self, messages: list[dict], model: str, **kwargs
    ) -> str:
        system_instruction, contents = self._build_contents(messages)
        response = await self.client.aio.models.generate_content(
            model=model,
            contents=contents,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
            ),
        )
        return response.text or ""

    async def stream(
        self, messages: list[dict], model: str, **kwargs
    ) -> AsyncGenerator[str, None]:
        system_instruction, contents = self._build_contents(messages)
        async for chunk in self.client.aio.models.generate_content_stream(
            model=model,
            contents=contents,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
            ),
        ):
            if chunk.text:
                yield chunk.text

    async def vision(
        self, messages: list[dict], images: list[bytes], model: str, **kwargs
    ) -> str:
        system_instruction, contents = self._build_contents(messages)

        # Build image parts
        image_parts = [
            types.Part.from_bytes(data=img, mime_type="image/png")
            for img in images
        ]

        # Append images to the last user message or create a new one
        if contents and contents[-1].role == "user":
            last = contents[-1]
            contents[-1] = types.Content(
                role="user",
                parts=list(last.parts) + image_parts,
            )
        else:
            contents.append(
                types.Content(role="user", parts=image_parts)
            )

        response = await self.client.aio.models.generate_content(
            model=model,
            contents=contents,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
            ),
        )
        return response.text or ""
