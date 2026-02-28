"""Sancho P2P Chat — Central WebSocket relay server.

Deploy to Render.com / Railway / any host that supports WebSocket.
Run locally: uvicorn server.main:app --host 0.0.0.0 --port 8000
"""

import asyncio
import json
import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("sancho-chat")

# ---------------------------------------------------------------------------
# Data models (in-memory, no persistence)
# ---------------------------------------------------------------------------

@dataclass
class ChatMessage:
    id: str
    room_id: str
    username: str
    content: str
    timestamp: str
    type: str = "message"  # message | join | leave


@dataclass
class ChatRoom:
    id: str
    name: str
    connections: dict[str, WebSocket] = field(default_factory=dict)  # username -> ws
    history: list[dict] = field(default_factory=list)  # last N messages as dicts


MAX_HISTORY = 100

# Global room registry
_rooms: dict[str, ChatRoom] = {}


def _ensure_default_room():
    if "general" not in _rooms:
        _rooms["general"] = ChatRoom(id="general", name="General")


_ensure_default_room()

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _room_users(room: ChatRoom) -> list[str]:
    return list(room.connections.keys())


async def _broadcast(room: ChatRoom, data: dict, exclude: str | None = None):
    """Send JSON to all connected users in a room."""
    raw = json.dumps(data, ensure_ascii=False)
    dead: list[str] = []
    for uname, ws in room.connections.items():
        if uname == exclude:
            continue
        try:
            await ws.send_text(raw)
        except Exception:
            dead.append(uname)
    # Clean up dead connections
    for uname in dead:
        room.connections.pop(uname, None)


def _unique_username(room: ChatRoom, desired: str) -> str:
    """If username is taken, append _2, _3, etc."""
    if desired not in room.connections:
        return desired
    n = 2
    while f"{desired}_{n}" in room.connections:
        n += 1
    return f"{desired}_{n}"


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------

app = FastAPI(title="Sancho Chat Server", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    total_users = sum(len(r.connections) for r in _rooms.values())
    return {"status": "ok", "rooms": len(_rooms), "users": total_users}


@app.get("/rooms")
async def list_rooms():
    return {
        "rooms": [
            {"id": r.id, "name": r.name, "user_count": len(r.connections)}
            for r in _rooms.values()
        ]
    }


@app.post("/rooms")
async def create_room(body: dict):
    name = body.get("name", "").strip()
    if not name:
        return {"error": "name required"}, 400
    room_id = name.lower().replace(" ", "-")
    if room_id in _rooms:
        return {"room": {"id": room_id, "name": _rooms[room_id].name, "user_count": len(_rooms[room_id].connections)}}
    room = ChatRoom(id=room_id, name=name)
    _rooms[room_id] = room
    return {"room": {"id": room_id, "name": name, "user_count": 0}}


# ---------------------------------------------------------------------------
# WebSocket endpoint
# ---------------------------------------------------------------------------

@app.websocket("/ws/{room_id}")
async def ws_endpoint(websocket: WebSocket, room_id: str):
    await websocket.accept()

    _ensure_default_room()
    if room_id not in _rooms:
        _rooms[room_id] = ChatRoom(id=room_id, name=room_id)

    room = _rooms[room_id]
    username: str | None = None

    try:
        # Wait for join message
        raw = await asyncio.wait_for(websocket.receive_text(), timeout=30)
        data = json.loads(raw)
        if data.get("type") != "join" or not data.get("username"):
            await websocket.close(code=4001, reason="Expected join message")
            return

        username = _unique_username(room, data["username"].strip())
        room.connections[username] = websocket

        # Send assigned username
        await websocket.send_text(json.dumps({
            "type": "joined",
            "username": username,
        }))

        # Send history
        if room.history:
            await websocket.send_text(json.dumps({
                "type": "history",
                "messages": room.history,
            }))

        # Send current user list
        await _broadcast(room, {
            "type": "users",
            "users": _room_users(room),
        })

        # Broadcast join event
        join_msg = {
            "type": "join",
            "username": username,
            "timestamp": _now_iso(),
        }
        await _broadcast(room, join_msg, exclude=username)

        logger.info(f"[{room_id}] {username} joined ({len(room.connections)} users)")

        # Message relay loop
        while True:
            raw = await websocket.receive_text()
            data = json.loads(raw)

            if data.get("type") == "message" and data.get("content", "").strip():
                msg = {
                    "type": "message",
                    "id": uuid.uuid4().hex[:12],
                    "username": username,
                    "content": data["content"].strip(),
                    "timestamp": _now_iso(),
                }
                # Save to history
                room.history.append(msg)
                if len(room.history) > MAX_HISTORY:
                    room.history = room.history[-MAX_HISTORY:]
                # Broadcast to all (including sender for confirmation)
                await _broadcast(room, msg)

            elif data.get("type") == "rooms":
                # Client requests room list
                await websocket.send_text(json.dumps({
                    "type": "rooms",
                    "rooms": [
                        {"id": r.id, "name": r.name, "user_count": len(r.connections)}
                        for r in _rooms.values()
                    ],
                }))

            elif data.get("type") == "create_room" and data.get("name"):
                new_id = data["name"].strip().lower().replace(" ", "-")
                if new_id not in _rooms:
                    _rooms[new_id] = ChatRoom(id=new_id, name=data["name"].strip())
                await websocket.send_text(json.dumps({
                    "type": "rooms",
                    "rooms": [
                        {"id": r.id, "name": r.name, "user_count": len(r.connections)}
                        for r in _rooms.values()
                    ],
                }))

    except WebSocketDisconnect:
        pass
    except asyncio.TimeoutError:
        try:
            await websocket.close(code=4002, reason="Join timeout")
        except Exception:
            pass
    except Exception as e:
        logger.error(f"[{room_id}] Error: {e}")
    finally:
        if username and username in room.connections:
            del room.connections[username]
            # Broadcast leave
            leave_msg = {
                "type": "leave",
                "username": username,
                "timestamp": _now_iso(),
            }
            await _broadcast(room, leave_msg)
            await _broadcast(room, {
                "type": "users",
                "users": _room_users(room),
            })
            logger.info(f"[{room_id}] {username} left ({len(room.connections)} users)")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
