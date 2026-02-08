import base64
from typing import AsyncGenerator

import anthropic

from .base import LLMProvider


class AnthropicProvider(LLMProvider):
    name = "anthropic"
    models: list[str] = []  # Managed via Settings > LLM Models

    def __init__(self, api_key: str) -> None:
        self.client = anthropic.AsyncAnthropic(api_key=api_key)

    def _convert_messages(self, messages: list[dict]) -> tuple[str, list[dict]]:
        system_parts = []
        converted = []
        for msg in messages:
            if msg["role"] == "system":
                system_parts.append(msg["content"])
            else:
                # Anthropic forbids consecutive same-role messages — merge them
                if converted and converted[-1]["role"] == msg["role"]:
                    converted[-1]["content"] += "\n\n" + msg["content"]
                else:
                    converted.append({"role": msg["role"], "content": msg["content"]})
        system = "\n\n".join(system_parts)
        return system, converted

    async def complete(
        self, messages: list[dict], model: str, **kwargs
    ) -> str:
        system, msgs = self._convert_messages(messages)
        kwargs.pop("max_tokens", None)
        response = await self.client.messages.create(
            model=model,
            max_tokens=4096,
            system=system,
            messages=msgs,
            **kwargs,
        )
        return response.content[0].text

    async def stream(
        self, messages: list[dict], model: str, **kwargs
    ) -> AsyncGenerator[str, None]:
        system, msgs = self._convert_messages(messages)
        kwargs.pop("max_tokens", None)
        async with self.client.messages.stream(
            model=model,
            max_tokens=4096,
            system=system,
            messages=msgs,
            **kwargs,
        ) as stream:
            async for text in stream.text_stream:
                yield text

    async def vision(
        self, messages: list[dict], images: list[bytes], model: str, **kwargs
    ) -> str:
        system, msgs = self._convert_messages(messages)
        image_content = []
        for img in images:
            b64 = base64.b64encode(img).decode()
            image_content.append(
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": "image/png",
                        "data": b64,
                    },
                }
            )
        if msgs and msgs[-1]["role"] == "user":
            last = msgs[-1]
            if isinstance(last["content"], str):
                last["content"] = [{"type": "text", "text": last["content"]}]
            last["content"].extend(image_content)
        else:
            msgs.append({"role": "user", "content": image_content})

        kwargs.pop("max_tokens", None)
        response = await self.client.messages.create(
            model=model,
            max_tokens=4096,
            system=system,
            messages=msgs,
            **kwargs,
        )
        return response.content[0].text
