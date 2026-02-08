from abc import ABC, abstractmethod
from typing import Any


class SkillExecutor(ABC):
    """Abstract base class for skill executors."""

    name: str

    @abstractmethod
    async def execute(self, params: dict[str, Any]) -> str:
        """Execute the skill with given parameters and return result as string."""
        ...

    @abstractmethod
    def is_configured(self) -> bool:
        """Check if this skill has the required configuration (API keys, etc.)."""
        ...
