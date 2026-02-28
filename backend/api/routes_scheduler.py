import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..scheduler.models import ScheduledTask, NotifyApps
from ..scheduler import storage
from ..scheduler.runner import sync_task, remove_task, execute_scheduled_task

router = APIRouter(prefix="/api/scheduler", tags=["scheduler"])


class NotifyAppsRequest(BaseModel):
    whatsapp: bool = False
    telegram: bool = False
    matrix: bool = False
    slack: bool = False
    discord: bool = False


class CreateTaskRequest(BaseModel):
    name: str
    prompt: str
    model: str = ""
    schedule_type: str = "cron"
    cron_hour: int = 9
    cron_minute: int = 0
    cron_days: list[str] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
    interval_minutes: int = 60
    timezone: str = "Asia/Seoul"
    notify_apps: NotifyAppsRequest = NotifyAppsRequest()
    enabled: bool = True


class UpdateTaskRequest(BaseModel):
    name: str | None = None
    prompt: str | None = None
    model: str | None = None
    schedule_type: str | None = None
    cron_hour: int | None = None
    cron_minute: int | None = None
    cron_days: list[str] | None = None
    interval_minutes: int | None = None
    timezone: str | None = None
    notify_apps: NotifyAppsRequest | None = None
    enabled: bool | None = None


@router.get("/tasks")
async def list_tasks():
    tasks = storage.get_tasks()
    return {"tasks": [t.model_dump() for t in tasks]}


@router.post("/tasks")
async def create_task(req: CreateTaskRequest):
    task = ScheduledTask(
        id=str(uuid.uuid4()),
        name=req.name,
        prompt=req.prompt,
        model=req.model,
        schedule_type=req.schedule_type,
        cron_hour=req.cron_hour,
        cron_minute=req.cron_minute,
        cron_days=req.cron_days,
        interval_minutes=req.interval_minutes,
        timezone=req.timezone,
        notify_apps=NotifyApps(**req.notify_apps.model_dump()),
        enabled=req.enabled,
        created_at=datetime.now(timezone.utc).isoformat(),
    )
    storage.add_task(task)
    sync_task(task)
    return {"task": task.model_dump()}


@router.put("/tasks/{task_id}")
async def update_task(task_id: str, req: UpdateTaskRequest):
    task = storage.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    update_data = req.model_dump(exclude_none=True)
    for key, value in update_data.items():
        if key == "notify_apps":
            task.notify_apps = NotifyApps(**value)
        else:
            setattr(task, key, value)

    storage.update_task(task)
    sync_task(task)
    return {"task": task.model_dump()}


@router.delete("/tasks/{task_id}")
async def delete_task(task_id: str):
    task = storage.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    remove_task(task_id)
    storage.delete_task(task_id)
    return {"status": "deleted"}


@router.post("/tasks/{task_id}/toggle")
async def toggle_task(task_id: str):
    task = storage.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    task.enabled = not task.enabled
    storage.update_task(task)
    sync_task(task)
    return {"task": task.model_dump()}


@router.post("/tasks/{task_id}/run")
async def run_task_now(task_id: str):
    task = storage.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    await execute_scheduled_task(task_id)
    # Re-read to get updated last_run
    updated = storage.get_task(task_id)
    return {"task": updated.model_dump() if updated else task.model_dump()}


@router.get("/logs")
async def list_logs(task_id: str | None = None):
    logs = storage.get_logs(task_id)
    return {"logs": [l.model_dump() for l in logs]}


# ── Notification endpoints ──


@router.get("/notifications")
async def get_pending_notifications():
    """Return undelivered notifications for Electron to send to chat apps."""
    notifications = storage.get_pending_notifications()
    return {"notifications": [n.model_dump() for n in notifications]}


class AckNotificationsRequest(BaseModel):
    ids: list[str]


@router.post("/notifications/ack")
async def ack_notifications(req: AckNotificationsRequest):
    """Mark notifications as delivered after Electron sends them."""
    for nid in req.ids:
        storage.ack_notification(nid)
    return {"status": "ok"}
