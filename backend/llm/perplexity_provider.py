import base64
from typing import AsyncGenerator

from openai import AsyncOpenAI

from .base import LLMProvider


class PerplexityProvider(LLMProvider):
    """Perplexity API provider (OpenAI-compatible)."""

    name = "perplexity"
    models: list[str] = []  # Managed via Settings > LLM Models

    def __init__(self, api_key: str) -> None:
        self.client = AsyncOpenAI(
            api_key=api_key,
            base_url="https://api.perplexity.ai",
        )

    async def complete(
        self, messages: list[dict], model: str, **kwargs
    ) -> str:
        response = await self.client.chat.completions.create(
            model=model,
            messages=messages,
            **kwargs,
        )
        return response.choices[0].message.content or ""

    async def stream(
        self, messages: list[dict], model: str, **kwargs
    ) -> AsyncGenerator[str, None]:
        response = await self.client.chat.completions.create(
            model=model,
            messages=messages,
            stream=True,
            **kwargs,
        )
        async for chunk in response:
            delta = chunk.choices[0].delta
            if delta.content:
                yield delta.content

    async def vision(
        self, messages: list[dict], images: list[bytes], model: str, **kwargs
    ) -> str:
        # Perplexity may not support vision, fallback to text-only
        response = await self.client.chat.completions.create(
            model=model,
            messages=messages,
            **kwargs,
        )
        return response.choices[0].message.content or ""
