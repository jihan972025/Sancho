import json
import logging
import os
from pathlib import Path
from typing import Optional

from datetime import datetime, timezone

from .models import ScheduledTask, TaskLog, Notification

logger = logging.getLogger(__name__)

_config_dir = Path(os.environ.get("SANCHO_CONFIG_DIR", Path.home() / ".sancho"))
_storage_file = _config_dir / "scheduled_tasks.json"

MAX_LOGS = 100


def _ensure_dir() -> None:
    _config_dir.mkdir(parents=True, exist_ok=True)


def _load_raw() -> dict:
    _ensure_dir()
    if _storage_file.exists():
        try:
            return json.loads(_storage_file.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as e:
            logger.error("Failed to load scheduled_tasks.json: %s", e)
    return {"tasks": [], "logs": [], "notifications": []}


def _save_raw(data: dict) -> None:
    _ensure_dir()
    _storage_file.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def get_tasks() -> list[ScheduledTask]:
    raw = _load_raw()
    return [ScheduledTask(**t) for t in raw.get("tasks", [])]


def get_task(task_id: str) -> Optional[ScheduledTask]:
    for t in get_tasks():
        if t.id == task_id:
            return t
    return None


def add_task(task: ScheduledTask) -> None:
    raw = _load_raw()
    raw["tasks"].append(task.model_dump())
    _save_raw(raw)


def update_task(task: ScheduledTask) -> None:
    raw = _load_raw()
    tasks = raw.get("tasks", [])
    for i, t in enumerate(tasks):
        if t["id"] == task.id:
            tasks[i] = task.model_dump()
            break
    raw["tasks"] = tasks
    _save_raw(raw)


def delete_task(task_id: str) -> None:
    raw = _load_raw()
    raw["tasks"] = [t for t in raw.get("tasks", []) if t["id"] != task_id]
    raw["logs"] = [l for l in raw.get("logs", []) if l["task_id"] != task_id]
    _save_raw(raw)


def get_logs(task_id: str | None = None) -> list[TaskLog]:
    raw = _load_raw()
    logs = raw.get("logs", [])
    if task_id:
        logs = [l for l in logs if l["task_id"] == task_id]
    return [TaskLog(**l) for l in logs]


def add_log(log: TaskLog) -> None:
    raw = _load_raw()
    logs = raw.get("logs", [])
    logs.insert(0, log.model_dump())
    # Keep only the most recent MAX_LOGS entries
    raw["logs"] = logs[:MAX_LOGS]
    _save_raw(raw)


# ── Notification queue ──

MAX_NOTIFICATIONS = 200


def add_notification(notif: Notification) -> None:
    """Add a notification to the queue."""
    raw = _load_raw()
    notifications = raw.get("notifications", [])
    notifications.insert(0, notif.model_dump())
    raw["notifications"] = notifications[:MAX_NOTIFICATIONS]
    _save_raw(raw)


def get_pending_notifications() -> list[Notification]:
    """Get all undelivered notifications."""
    raw = _load_raw()
    notifications = raw.get("notifications", [])
    return [Notification(**n) for n in notifications if not n.get("delivered", False)]


def ack_notification(notif_id: str) -> None:
    """Mark a notification as delivered and clean up old ones."""
    raw = _load_raw()
    notifications = raw.get("notifications", [])
    now = datetime.now(timezone.utc)
    updated = []
    for n in notifications:
        if n["id"] == notif_id:
            n["delivered"] = True
        # Auto-clean: drop delivered notifications older than 24h
        if n.get("delivered", False):
            try:
                created = datetime.fromisoformat(n["created_at"])
                if (now - created).total_seconds() > 86400:
                    continue
            except (ValueError, KeyError):
                pass
        updated.append(n)
    raw["notifications"] = updated
    _save_raw(raw)
