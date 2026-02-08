import base64
from typing import AsyncGenerator

from openai import AsyncOpenAI

from .base import LLMProvider


class ZhipuAIProvider(LLMProvider):
    """ZhipuAI / Z.ai provider (OpenAI-compatible API)."""

    name = "zhipuai"
    models: list[str] = []  # Managed via Settings > LLM Models

    def __init__(self, api_key: str) -> None:
        self.client = AsyncOpenAI(
            api_key=api_key,
            base_url="https://open.bigmodel.cn/api/paas/v4/",
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
        # ZhipuAI vision: merge system into user prompt, image first then text
        system_text = ""
        user_text = ""
        for msg in messages:
            if msg["role"] == "system":
                system_text += msg["content"] + "\n"
            elif msg["role"] == "user":
                content = msg["content"]
                if isinstance(content, str):
                    user_text += content
                elif isinstance(content, list):
                    for part in content:
                        if isinstance(part, dict) and part.get("type") == "text":
                            user_text += part["text"]

        combined_text = f"{system_text}\n{user_text}".strip() if system_text else user_text

        content_parts = []
        for img in images:
            b64 = base64.b64encode(img).decode()
            content_parts.append({
                "type": "image_url",
                "image_url": {"url": f"data:image/png;base64,{b64}"},
            })
        content_parts.append({"type": "text", "text": combined_text})

        import logging
        logging.getLogger(__name__).info("ZhipuAI vision request: model=%s, images=%d", model, len(images))
        response = await self.client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": content_parts}],
            **kwargs,
        )
        return response.choices[0].message.content or ""
