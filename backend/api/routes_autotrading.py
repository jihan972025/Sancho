"""API routes for the auto-trading feature."""

from __future__ import annotations

import asyncio
import json
import logging
from collections import deque

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from ..config import get_config
from ..llm.registry import get_provider_for_model
from ..autotrading import storage
from ..autotrading.engine import TradingEngine

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/autotrading", tags=["autotrading"])

# ── Global engine state ──

_engine: TradingEngine | None = None
_event_queue: deque[dict] = deque(maxlen=200)


def _on_engine_event(event: dict) -> None:
    """Callback invoked by the engine for every event."""
    _event_queue.append(event)


# ── Request models ──

class StartRequest(BaseModel):
    coin: str = "BTC"
    timeframe: str = "5m"
    candle_interval: str = "30m"
    amount_krw: float = 10000
    model: str = ""
    language: str = "en"
    strategy: str = "llm"  # "llm" or "rule"


# ── Endpoints ──

@router.post("/start")
async def start_trading(req: StartRequest):
    global _engine

    if _engine and _engine.is_running:
        raise HTTPException(400, "Trading is already running. Stop first.")

    cfg = get_config()
    if not cfg.api.upbit_access_key or not cfg.api.upbit_secret_key:
        raise HTTPException(400, "Upbit API keys are not configured. Set them in Settings > API.")

    if req.strategy not in ("llm", "rule"):
        raise HTTPException(400, f"Unsupported strategy: {req.strategy}")

    if req.strategy == "llm":
        if not req.model:
            raise HTTPException(400, "AI model must be selected.")
        provider = get_provider_for_model(req.model)
        if not provider:
            raise HTTPException(400, f"Model '{req.model}' is not available.")

    if req.amount_krw < 5000:
        raise HTTPException(400, "Minimum trade amount is ₩5,000.")

    valid_coins = {"BTC", "ETH", "XRP", "SOL", "TRX", "ADA", "XMR"}
    if req.coin not in valid_coins:
        raise HTTPException(400, f"Unsupported coin: {req.coin}")

    valid_tf = {"5m", "10m", "15m", "30m", "1h", "4h"}
    if req.timeframe not in valid_tf:
        raise HTTPException(400, f"Unsupported timeframe: {req.timeframe}")

    valid_candle = {"1m", "3m", "5m", "10m", "15m", "30m", "1h", "4h"}
    if req.candle_interval not in valid_candle:
        raise HTTPException(400, f"Unsupported candle interval: {req.candle_interval}")

    _event_queue.clear()

    _engine = TradingEngine(
        coin=req.coin,
        timeframe=req.timeframe,
        candle_interval=req.candle_interval,
        amount_krw=req.amount_krw,
        model=req.model,
        on_event=_on_engine_event,
        language=req.language,
        strategy=req.strategy,
    )
    await _engine.start()

    storage.save_trading_config({
        "coin": req.coin,
        "timeframe": req.timeframe,
        "candle_interval": req.candle_interval,
        "amount_krw": req.amount_krw,
        "model": req.model,
        "language": req.language,
        "strategy": req.strategy,
    })

    return {"status": "started", "coin": req.coin, "timeframe": req.timeframe}


@router.post("/stop")
async def stop_trading():
    global _engine

    if not _engine or not _engine.is_running:
        raise HTTPException(400, "Trading is not running.")

    await _engine.stop()
    return {"status": "stopped"}


@router.get("/status")
async def get_status():
    if not _engine:
        saved = storage.get_trading_config()
        return {"running": False, "saved_config": saved}
    return _engine.get_status()


@router.get("/history")
async def get_history(limit: int = 500, from_date: str = "", to_date: str = ""):
    trades = storage.get_trades(limit, from_date=from_date, to_date=to_date)
    return {"trades": trades}


@router.get("/stream")
async def stream_events():
    """SSE endpoint that forwards engine events to the frontend."""

    async def event_stream():
        last_idx = 0
        while True:
            # Drain new events
            current_len = len(_event_queue)
            if current_len > last_idx:
                for i in range(last_idx, current_len):
                    try:
                        evt = _event_queue[i]
                        yield f"data: {json.dumps(evt, ensure_ascii=False)}\n\n"
                    except IndexError:
                        break
                last_idx = current_len

            # Also send periodic status heartbeat
            if _engine and _engine.is_running:
                status = _engine.get_status()
                yield f"data: {json.dumps({'type': 'heartbeat', 'content': status}, ensure_ascii=False)}\n\n"

            await asyncio.sleep(3)

    return StreamingResponse(event_stream(), media_type="text/event-stream")
