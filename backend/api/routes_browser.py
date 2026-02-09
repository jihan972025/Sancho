import asyncio
import base64
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..agents.browser_agent import get_browser_agent
from ..config import get_config

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/browser", tags=["browser"])


class NavigateRequest(BaseModel):
    url: str


class AgentRunRequest(BaseModel):
    task: str
    model: Optional[str] = None


@router.post("/start")
async def start_browser():
    agent = get_browser_agent()
    config = get_config()
    try:
        await agent.start_browser(headless=config.browser_headless)
        return {"status": "started"}
    except Exception as e:
        logger.exception("Browser start failed")
        raise HTTPException(status_code=500, detail=str(e) or repr(e))


@router.post("/navigate")
async def navigate(req: NavigateRequest):
    agent = get_browser_agent()
    try:
        url = await agent.navigate(req.url)
        return {"url": url}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/screenshot")
async def take_screenshot():
    agent = get_browser_agent()
    try:
        img_bytes = await agent.screenshot()
        b64 = base64.b64encode(img_bytes).decode()
        return {"image": b64, "format": "png"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/snapshot")
async def take_snapshot():
    agent = get_browser_agent()
    try:
        text = await agent.snapshot()
        return {"snapshot": text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/agent/run")
async def run_agent(req: AgentRunRequest):
    agent = get_browser_agent()
    if agent.state.status == "running":
        raise HTTPException(status_code=409, detail="Agent is already running")

    # Run in background
    asyncio.create_task(agent.run_task(req.task, req.model))
    return {"status": "started", "task": req.task}


@router.post("/agent/stop")
async def stop_agent():
    agent = get_browser_agent()
    agent.stop()
    return {"status": "stopping"}


@router.get("/agent/status")
async def agent_status():
    agent = get_browser_agent()
    state = agent.get_state()
    return state.model_dump()


@router.delete("/close")
async def close_browser():
    agent = get_browser_agent()
    try:
        await agent.close_browser()
        return {"status": "closed"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
