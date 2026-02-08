import time
from dataclasses import dataclass, field

MESSAGE_TTL = 3600  # 1 hour
MAX_MESSAGES = 20


@dataclass
class _Entry:
    role: str
    content: str
    timestamp: float = field(default_factory=time.time)


class ConversationHistory:
    def __init__(self) -> None:
        self._store: dict[str, list[_Entry]] = {}

    def add_message(self, phone: str, role: str, content: str) -> None:
        if phone not in self._store:
            self._store[phone] = []
        self._store[phone].append(_Entry(role=role, content=content))
        # Trim to max
        if len(self._store[phone]) > MAX_MESSAGES:
            self._store[phone] = self._store[phone][-MAX_MESSAGES:]

    def get_messages(self, phone: str) -> list[dict]:
        if phone not in self._store:
            return []
        now = time.time()
        # Filter expired
        self._store[phone] = [
            e for e in self._store[phone] if now - e.timestamp < MESSAGE_TTL
        ]
        return [{"role": e.role, "content": e.content} for e in self._store[phone]]

    def clear(self, phone: str) -> None:
        self._store.pop(phone, None)


# Global singleton
history = ConversationHistory()
