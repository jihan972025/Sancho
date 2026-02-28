from pydantic import BaseModel


class AgentNodeDef(BaseModel):
    id: str
    serviceId: str
    serviceType: str = "api"  # "api" | "chatapp"
    prompt: str = ""
    order: int = 0
    x: float = 0.0
    y: float = 0.0


class AgentEdge(BaseModel):
    id: str
    source: str
    target: str
    sourcePort: str = "bottom"  # "top" | "bottom" | "left" | "right"
    targetPort: str = "top"     # "top" | "bottom" | "left" | "right"


class NotifyApps(BaseModel):
    whatsapp: bool = False
    telegram: bool = False
    matrix: bool = False
    slack: bool = False
    discord: bool = False


class AgentSchedule(BaseModel):
    execution_type: str = "recurring"  # "recurring" | "onetime"
    schedule_type: str = "cron"
    cron_hour: int = 9
    cron_minute: int = 0
    cron_days: list[str] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
    interval_minutes: int = 60
    timezone: str = "Asia/Seoul"
    start_time: str | None = None
    execute_immediately: bool = False


class AgentWorkflow(BaseModel):
    id: str
    name: str
    nodes: list[AgentNodeDef] = []
    edges: list[AgentEdge] = []
    schedule: AgentSchedule = AgentSchedule()
    notify_apps: NotifyApps = NotifyApps()
    model: str = ""
    enabled: bool = True
    created_at: str = ""
    updated_at: str = ""
    last_run: str | None = None
    last_result: str | None = None
    status: str = "idle"  # "idle" | "running" | "completed" | "error"


class AgentLog(BaseModel):
    id: str
    agent_id: str
    agent_name: str
    executed_at: str
    result: str
    status: str  # "success" | "error"
