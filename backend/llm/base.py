from abc import ABC, abstractmethod
from typing import AsyncGenerator


class LLMProvider(ABC):
    """Abstract base class for LLM providers."""

    name: str
    models: list[str]

    @abstractmethod
    async def complete(
        self, messages: list[dict], model: str, **kwargs
    ) -> str:
        """Send messages and get a complete response."""
        ...

    @abstractmethod
    async def stream(
        self, messages: list[dict], model: str, **kwargs
    ) -> AsyncGenerator[str, None]:
        """Send messages and stream response tokens."""
        ...

    @abstractmethod
    async def vision(
        self, messages: list[dict], images: list[bytes], model: str, **kwargs
    ) -> str:
        """Send messages with images and get a response."""
        ...
