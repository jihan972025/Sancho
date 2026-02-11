import base64
import json
import re
from typing import AsyncGenerator

from openai import AsyncOpenAI

from .base import LLMProvider


def parse_nvidia_code(code: str) -> dict:
    """Parse NVIDIA NIM Python code snippet to extract connection parameters."""
    result = {}

    # invoke_url
    m = re.search(r'invoke_url\s*=\s*["\']([^"\']+)["\']', code)
    if m:
        url = m.group(1)
        # Strip /chat/completions to get base_url for OpenAI SDK
        result["invoke_url"] = url
        if url.endswith("/chat/completions"):
            result["base_url"] = url[: -len("/chat/completions")]
        else:
            result["base_url"] = url

    # Bearer token
    m = re.search(r"Bearer\s+([^\s\"']+)", code)
    if m:
        result["api_key"] = m.group(1)

    # model
    m = re.search(r'"model"\s*:\s*"([^"]+)"', code)
    if m:
        result["model"] = m.group(1)

    # max_tokens
    m = re.search(r'"max_tokens"\s*:\s*(\d+)', code)
    if m:
        result["max_tokens"] = int(m.group(1))

    # temperature
    m = re.search(r'"temperature"\s*:\s*([0-9.]+)', code)
    if m:
        result["temperature"] = float(m.group(1))

    # top_p
    m = re.search(r'"top_p"\s*:\s*([0-9.]+)', code)
    if m:
        result["top_p"] = float(m.group(1))

    # chat_template_kwargs  (Python dict → JSON)
    m = re.search(r'"chat_template_kwargs"\s*:\s*(\{[^}]+\})', code)
    if m:
        kwargs_str = m.group(1).replace("True", "true").replace("False", "false")
        try:
            result["chat_template_kwargs"] = json.loads(kwargs_str)
        except (json.JSONDecodeError, ValueError):
            pass

    return result


class NvidiaProvider(LLMProvider):
    """NVIDIA NIM API provider — configured by pasting the full code snippet."""

    name = "nvidia"
    models: list[str] = []

    def __init__(self, code: str) -> None:
        parsed = parse_nvidia_code(code)
        self.api_key = parsed.get("api_key", "")
        self.model_name = parsed.get("model", "")
        base_url = parsed.get("base_url", "https://integrate.api.nvidia.com/v1")

        # Standard OpenAI params
        self.default_params: dict = {}
        if "max_tokens" in parsed:
            self.default_params["max_tokens"] = parsed["max_tokens"]
        if "temperature" in parsed:
            self.default_params["temperature"] = parsed["temperature"]
        if "top_p" in parsed:
            self.default_params["top_p"] = parsed["top_p"]

        # Extra body params (e.g. chat_template_kwargs)
        self.extra_body: dict = {}
        if "chat_template_kwargs" in parsed:
            self.extra_body["chat_template_kwargs"] = parsed["chat_template_kwargs"]

        self.client = AsyncOpenAI(api_key=self.api_key, base_url=base_url)

    async def complete(
        self, messages: list[dict], model: str, **kwargs
    ) -> str:
        create_kwargs: dict = {
            "model": model,
            "messages": messages,
            **self.default_params,
            **kwargs,
        }
        if self.extra_body:
            create_kwargs["extra_body"] = self.extra_body

        response = await self.client.chat.completions.create(**create_kwargs)
        return response.choices[0].message.content or ""

    async def stream(
        self, messages: list[dict], model: str, **kwargs
    ) -> AsyncGenerator[str, None]:
        create_kwargs: dict = {
            "model": model,
            "messages": messages,
            "stream": True,
            **self.default_params,
            **kwargs,
        }
        if self.extra_body:
            create_kwargs["extra_body"] = self.extra_body

        response = await self.client.chat.completions.create(**create_kwargs)
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

        create_kwargs: dict = {
            "model": model,
            "messages": vision_messages,
            **self.default_params,
            **kwargs,
        }
        if self.extra_body:
            create_kwargs["extra_body"] = self.extra_body

        response = await self.client.chat.completions.create(**create_kwargs)
        return response.choices[0].message.content or ""
