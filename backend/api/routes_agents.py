import json
import logging
import re
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..agents.agent_models import AgentWorkflow, AgentNodeDef, AgentEdge, AgentSchedule, NotifyApps
from ..agents import agent_storage as storage
from ..agents.agent_runner import execute_agent
from ..config import get_config
from ..llm.registry import get_provider_for_model

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/agents", tags=["agents"])


# ── Request models ──

class NodeDefRequest(BaseModel):
    id: str = ""
    serviceId: str
    serviceType: str = "api"
    prompt: str = ""
    order: int = 0
    x: float = 0.0
    y: float = 0.0


class EdgeDefRequest(BaseModel):
    id: str
    source: str
    target: str
    sourcePort: str = "bottom"
    targetPort: str = "top"


class ScheduleRequest(BaseModel):
    execution_type: str = "recurring"
    schedule_type: str = "cron"
    cron_hour: int = 9
    cron_minute: int = 0
    cron_days: list[str] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
    interval_minutes: int = 60
    timezone: str = "Asia/Seoul"
    start_time: str | None = None
    execute_immediately: bool = False


class NotifyAppsRequest(BaseModel):
    whatsapp: bool = False
    telegram: bool = False
    matrix: bool = False
    slack: bool = False
    discord: bool = False


class CreateAgentRequest(BaseModel):
    name: str
    nodes: list[NodeDefRequest] = []
    edges: list[EdgeDefRequest] = []
    schedule: ScheduleRequest = ScheduleRequest()
    notify_apps: NotifyAppsRequest = NotifyAppsRequest()
    model: str = ""
    enabled: bool = True


class UpdateAgentRequest(BaseModel):
    name: str | None = None
    nodes: list[NodeDefRequest] | None = None
    edges: list[EdgeDefRequest] | None = None
    schedule: ScheduleRequest | None = None
    notify_apps: NotifyAppsRequest | None = None
    model: str | None = None
    enabled: bool | None = None


class AiBuildRequest(BaseModel):
    prompt: str
    model: str = ""


# ── AI Build system prompt ──

_AI_BUILD_SYSTEM_PROMPT = """\
You are an AI agent workflow builder. Given a natural language request, \
output a JSON object that defines an automated agent workflow.

Available API services (serviceId -> what it does):
- duckduckgo: Web search (general queries)
- wttr: Weather information
- yfinance: Stock & market data (KOSPI, KOSDAQ, S&P 500, NASDAQ, individual stocks, etc.)
- tradingview: Market chart analysis & technical indicators
- frankfurter: Currency exchange rates
- ccxt: Cryptocurrency market data (prices, volume)
- wikipedia: Wikipedia article lookup
- gnews: Google News search
- geopy: Geocoding & location lookup
- usgs: Earthquake & seismic data
- nagerdate: Public holiday information
- ipapi: IP geolocation
- timezone: Timezone conversion
- trivia: Random trivia facts
- pyshorteners: URL shortening
- restcountries: Country information
- zenquotes: Inspirational quotes
- krnews: Korean news RSS feed
- filesystem: File system operations (read/write/organize files)
- tavily: Advanced web search (more accurate, paid)
- outlook: Send/read Outlook email
- gmail: Send/read Gmail
- google_calendar: Google Calendar events
- google_sheets: Google Sheets read/write
- jira: Jira issue management
- confluence: Confluence page management
- slack: Slack messaging (paid API integration)

Available ChatApp services (for delivering results to the user):
- whatsapp: Send via WhatsApp
- telegram: Send via Telegram
- matrix: Send via Matrix
- slack_app: Send via Slack app

Available crypto exchanges (for exchange-specific trading data):
- upbit, binance, coinbase, bybit, okx, kraken, mexc, gateio, kucoin, bitget, htx

Output ONLY valid JSON (no markdown fences, no explanation) with this schema:
{
  "name": "short descriptive agent name",
  "nodes": [
    { "serviceId": "...", "serviceType": "api" or "chatapp", "prompt": "detailed instruction for this step" }
  ],
  "schedule": {
    "execution_type": "recurring" or "onetime",
    "schedule_type": "cron" or "interval",
    "cron_hour": 0-23,
    "cron_minute": 0-59,
    "cron_days": ["mon","tue","wed","thu","fri","sat","sun"],
    "interval_minutes": 60,
    "execute_immediately": false
  }
}

Rules:
1. ChatApp nodes (whatsapp, telegram, matrix, slack_app) must be LAST — they deliver the accumulated result.
2. ChatApp nodes have serviceType "chatapp" and an EMPTY prompt "".
3. API/exchange nodes have serviceType "api" and a DETAILED prompt describing what data to fetch or action to perform.
4. Choose the most appropriate service(s) for the user's intent.
5. Set schedule based on the user's timing request. If no timing is mentioned, default to onetime with execute_immediately=true.
6. For recurring tasks, set cron_hour/cron_minute to the requested time. If "every day" or no specific days, include all 7 days.
7. The agent name should be concise and descriptive (e.g. "Daily KOSPI Report").
8. If the user mentions multiple data sources, create multiple API nodes in sequence.
9. CRITICAL — LANGUAGE MATCHING: The "name" and each node's "prompt" MUST be written in the SAME language as the user's input. If the user writes in Korean, write name and prompts in Korean. If in Chinese, write in Chinese. If in German, write in German. Always match the user's language exactly. Only serviceId values stay in English (they are identifiers).
"""


def _extract_json(text: str) -> dict | None:
    """Extract JSON from LLM response, handling markdown fences."""
    # Try direct parse first
    text = text.strip()
    if text.startswith("{"):
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass

    # Try extracting from markdown code block
    match = re.search(r"```(?:json)?\s*\n?(.*?)\n?```", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1).strip())
        except json.JSONDecodeError:
            pass

    # Try finding first { ... } block
    brace_start = text.find("{")
    brace_end = text.rfind("}")
    if brace_start != -1 and brace_end > brace_start:
        try:
            return json.loads(text[brace_start : brace_end + 1])
        except json.JSONDecodeError:
            pass

    return None


# ── Routes ──
# IMPORTANT: /logs and /ai-build must come BEFORE /{agent_id} to avoid FastAPI treating them as an agent_id

@router.get("/logs")
async def list_logs(agent_id: str | None = None):
    logs = storage.get_logs(agent_id)
    return {"logs": [l.model_dump() for l in logs]}


@router.post("/ai-build")
async def ai_build_agent(req: AiBuildRequest):
    """Use LLM to convert natural language into an agent workflow definition."""
    config = get_config()
    model = req.model or config.llm.default_model
    if not model:
        raise HTTPException(status_code=400, detail="No model configured")

    provider = get_provider_for_model(model)
    if not provider:
        raise HTTPException(
            status_code=400,
            detail=f"Model '{model}' is not available. Check your API key settings.",
        )

    messages = [
        {"role": "system", "content": _AI_BUILD_SYSTEM_PROMPT},
        {"role": "user", "content": req.prompt},
    ]

    try:
        raw = await provider.complete(messages, model)
    except Exception as e:
        logger.error("AI build LLM error: %s", e)
        raise HTTPException(status_code=500, detail=f"LLM error: {e}")

    result = _extract_json(raw)
    if not result:
        logger.warning("AI build: failed to parse JSON from LLM response: %s", raw[:500])
        raise HTTPException(
            status_code=422,
            detail="Failed to parse AI response. Please try again.",
        )

    # Validate and normalize the result
    name = result.get("name", "AI Agent")
    nodes_raw = result.get("nodes", [])
    schedule_raw = result.get("schedule", {})

    # Build normalized nodes
    nodes = []
    for i, n in enumerate(nodes_raw):
        service_id = n.get("serviceId", "")
        service_type = n.get("serviceType", "api")
        if service_type not in ("api", "chatapp"):
            service_type = "api"
        nodes.append({
            "serviceId": service_id,
            "serviceType": service_type,
            "prompt": n.get("prompt", ""),
            "order": i,
        })

    # Build normalized schedule
    schedule = {
        "execution_type": schedule_raw.get("execution_type", "recurring"),
        "schedule_type": schedule_raw.get("schedule_type", "cron"),
        "cron_hour": int(schedule_raw.get("cron_hour", 9)),
        "cron_minute": int(schedule_raw.get("cron_minute", 0)),
        "cron_days": schedule_raw.get("cron_days", ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]),
        "interval_minutes": int(schedule_raw.get("interval_minutes", 60)),
        "execute_immediately": bool(schedule_raw.get("execute_immediately", False)),
    }

    return {"name": name, "nodes": nodes, "schedule": schedule}


@router.get("")
async def list_agents():
    agents = storage.get_agents()
    return {"agents": [a.model_dump() for a in agents]}


@router.post("")
async def create_agent(req: CreateAgentRequest):
    now = datetime.now(timezone.utc).isoformat()
    agent = AgentWorkflow(
        id=str(uuid.uuid4()),
        name=req.name,
        nodes=[AgentNodeDef(**n.model_dump()) for n in req.nodes],
        edges=[AgentEdge(**e.model_dump()) for e in req.edges],
        schedule=AgentSchedule(**req.schedule.model_dump()),
        notify_apps=NotifyApps(**req.notify_apps.model_dump()),
        model=req.model,
        enabled=req.enabled,
        created_at=now,
        updated_at=now,
    )
    storage.add_agent(agent)
    return {"agent": agent.model_dump()}


@router.put("/{agent_id}")
async def update_agent(agent_id: str, req: UpdateAgentRequest):
    agent = storage.get_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    if req.name is not None:
        agent.name = req.name
    if req.nodes is not None:
        agent.nodes = [AgentNodeDef(**n.model_dump()) for n in req.nodes]
    if req.edges is not None:
        agent.edges = [AgentEdge(**e.model_dump()) for e in req.edges]
    if req.schedule is not None:
        agent.schedule = AgentSchedule(**req.schedule.model_dump())
    if req.notify_apps is not None:
        agent.notify_apps = NotifyApps(**req.notify_apps.model_dump())
    if req.model is not None:
        agent.model = req.model
    if req.enabled is not None:
        agent.enabled = req.enabled

    agent.updated_at = datetime.now(timezone.utc).isoformat()
    storage.update_agent(agent)
    return {"agent": agent.model_dump()}


@router.delete("/{agent_id}")
async def delete_agent_route(agent_id: str):
    agent = storage.get_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    storage.delete_agent(agent_id)
    return {"status": "deleted"}


@router.post("/{agent_id}/toggle")
async def toggle_agent(agent_id: str):
    agent = storage.get_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    agent.enabled = not agent.enabled
    agent.updated_at = datetime.now(timezone.utc).isoformat()
    storage.update_agent(agent)
    return {"agent": agent.model_dump()}


@router.post("/{agent_id}/run")
async def run_agent_now(agent_id: str):
    agent = storage.get_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    await execute_agent(agent_id)
    updated = storage.get_agent(agent_id)
    return {"agent": updated.model_dump() if updated else agent.model_dump()}
