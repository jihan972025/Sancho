from pydantic import BaseModel


class NotifyApps(BaseModel):
    whatsapp: bool = False
    telegram: bool = False
    matrix: bool = False
    slack: bool = False
    discord: bool = False


class ScheduledTask(BaseModel):
    id: str
    name: str
    prompt: str
    model: str = ""  # empty = use default_model
    schedule_type: str = "cron"  # "cron" | "interval"
    cron_hour: int = 9
    cron_minute: int = 0
    cron_days: list[str] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
    interval_minutes: int = 60
    timezone: str = "Asia/Seoul"
    notify_apps: NotifyApps = NotifyApps()
    enabled: bool = True
    created_at: str = ""
    last_run: str | None = None
    last_result: str | None = None


class TaskLog(BaseModel):
    id: str
    task_id: str
    task_name: str
    executed_at: str
    result: str
    status: str  # "success" | "error"


class Notification(BaseModel):
    id: str
    task_id: str
    task_name: str
    result: str
    notify_apps: NotifyApps
    created_at: str
    delivered: bool = False
