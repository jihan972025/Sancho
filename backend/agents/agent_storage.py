import json
import logging
import os
from pathlib import Path
from typing import Optional

from .agent_models import AgentWorkflow, AgentLog

logger = logging.getLogger(__name__)

_config_dir = Path(os.environ.get("SANCHO_CONFIG_DIR", Path.home() / ".sancho"))
_storage_file = _config_dir / "agents.json"

MAX_LOGS = 100


def _ensure_dir() -> None:
    _config_dir.mkdir(parents=True, exist_ok=True)


def _load_raw() -> dict:
    _ensure_dir()
    if _storage_file.exists():
        try:
            return json.loads(_storage_file.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as e:
            logger.error("Failed to load agents.json: %s", e)
    return {"agents": [], "logs": []}


def _save_raw(data: dict) -> None:
    _ensure_dir()
    _storage_file.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


# ── Agent CRUD ──

def get_agents() -> list[AgentWorkflow]:
    raw = _load_raw()
    return [AgentWorkflow(**a) for a in raw.get("agents", [])]


def get_agent(agent_id: str) -> Optional[AgentWorkflow]:
    for a in get_agents():
        if a.id == agent_id:
            return a
    return None


def add_agent(agent: AgentWorkflow) -> None:
    raw = _load_raw()
    raw["agents"].append(agent.model_dump())
    _save_raw(raw)


def update_agent(agent: AgentWorkflow) -> None:
    raw = _load_raw()
    agents = raw.get("agents", [])
    for i, a in enumerate(agents):
        if a["id"] == agent.id:
            agents[i] = agent.model_dump()
            break
    raw["agents"] = agents
    _save_raw(raw)


def delete_agent(agent_id: str) -> None:
    raw = _load_raw()
    raw["agents"] = [a for a in raw.get("agents", []) if a["id"] != agent_id]
    raw["logs"] = [l for l in raw.get("logs", []) if l["agent_id"] != agent_id]
    _save_raw(raw)


# ── Logs ──

def get_logs(agent_id: str | None = None) -> list[AgentLog]:
    raw = _load_raw()
    logs = raw.get("logs", [])
    if agent_id:
        logs = [l for l in logs if l["agent_id"] == agent_id]
    return [AgentLog(**l) for l in logs]


def add_log(log: AgentLog) -> None:
    raw = _load_raw()
    logs = raw.get("logs", [])
    logs.insert(0, log.model_dump())
    raw["logs"] = logs[:MAX_LOGS]
    _save_raw(raw)
