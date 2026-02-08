import base64
from typing import AsyncGenerator

from openai import AsyncOpenAI

from .base import LLMProvider


class LLaMAProvider(LLMProvider):
    """Meta LLaMA API provider via together.ai (OpenAI-compatible)."""

    name = "llama"
    models: list[str] = []  # Managed via Settings > LLM Models

    def __init__(self, api_key: str) -> None:
        self.client = AsyncOpenAI(
            api_key=api_key,
            base_url="https://api.together.xyz/v1",
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
        vision_messages = list(messages)
        image_content = []
        for img in images:
            b64 = base64.b64encode(img).decode()
            image_content.append(
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:image/png;base64,{b64}"},
                }
            )
        if vision_messages and vision_messages[-1]["role"] == "user":
            last = vision_messages[-1]
            if isinstance(last["content"], str):
                last["content"] = [{"type": "text", "text": last["content"]}]
            last["content"].extend(image_content)
        else:
            vision_messages.append({"role": "user", "content": image_content})

        response = await self.client.chat.completions.create(
            model=model,
            messages=vision_messages,
            **kwargs,
        )
        return response.choices[0].message.content or ""
