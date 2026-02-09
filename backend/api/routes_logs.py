import asyncio
import logging
import threading
from collections import deque
from datetime import datetime

from fastapi import APIRouter
from starlette.responses import StreamingResponse

router = APIRouter(prefix="/api/logs", tags=["logs"])


class BufferedLogHandler(logging.Handler):
    """Thread-safe log handler that buffers records and fans out to SSE subscribers."""

    def __init__(self, maxlen: int = 500):
        super().__init__()
        self._buffer: deque[dict] = deque(maxlen=maxlen)
        self._lock = threading.Lock()
        self._subscribers: list[asyncio.Queue] = []

    def emit(self, record: logging.LogRecord):
        entry = {
            "timestamp": datetime.fromtimestamp(record.created).isoformat(),
            "level": record.levelname,
            "name": record.name,
            "message": self.format(record),
        }
        with self._lock:
            self._buffer.append(entry)
            subscribers = list(self._subscribers)

        for queue in subscribers:
            try:
                loop = queue._loop  # type: ignore[attr-defined]
                loop.call_soon_threadsafe(queue.put_nowait, entry)
            except Exception:
                pass

    def get_buffer(self) -> list[dict]:
        with self._lock:
            return list(self._buffer)

    def clear(self):
        with self._lock:
            self._buffer.clear()

    def subscribe(self, loop: asyncio.AbstractEventLoop) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue()
        queue._loop = loop  # type: ignore[attr-defined]
        with self._lock:
            self._subscribers.append(queue)
        return queue

    def unsubscribe(self, queue: asyncio.Queue):
        with self._lock:
            try:
                self._subscribers.remove(queue)
            except ValueError:
                pass


log_handler = BufferedLogHandler()
log_handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s"))


async def _log_stream_generator(handler: BufferedLogHandler):
    import json

    loop = asyncio.get_event_loop()
    queue = handler.subscribe(loop)

    try:
        # Send buffered logs first
        for entry in handler.get_buffer():
            yield f"data: {json.dumps(entry)}\n\n"

        # Stream new logs
        while True:
            try:
                entry = await asyncio.wait_for(queue.get(), timeout=30)
                yield f"data: {json.dumps(entry)}\n\n"
            except asyncio.TimeoutError:
                # Keepalive
                yield ": keepalive\n\n"
    except asyncio.CancelledError:
        pass
    finally:
        handler.unsubscribe(queue)


@router.get("/stream")
async def stream_logs():
    return StreamingResponse(
        _log_stream_generator(log_handler),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.delete("")
async def clear_logs():
    log_handler.clear()
    return {"status": "ok"}
