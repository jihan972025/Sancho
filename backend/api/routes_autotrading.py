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


class ManualBuyRequest(BaseModel):
    coin: str = "BTC"
    amount_krw: float = 10000


class ManualSellRequest(BaseModel):
    coin: str = "BTC"
    quantity: float | None = None  # None = sell all


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

    if req.coin not in _get_valid_coins():
        raise HTTPException(400, f"Unsupported coin: {req.coin}")

    valid_tf = {"1m", "3m", "5m", "10m", "15m", "30m", "1h", "4h"}
    if req.timeframe not in valid_tf:
        raise HTTPException(400, f"Unsupported timeframe: {req.timeframe}")

    valid_candle = {"1m", "3m", "5m", "10m", "15m", "30m", "1h", "4h", "1d", "1w", "1M"}
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


@router.get("/assets")
async def get_assets():
    """Fetch user's Upbit balance and holdings with current valuations."""
    cfg = get_config()
    if not cfg.api.upbit_access_key or not cfg.api.upbit_secret_key:
        return {"krw_balance": 0, "coins": [], "total_eval_krw": 0, "error": "API keys not configured"}

    try:
        import ccxt

        exchange = ccxt.upbit({
            "enableRateLimit": True,
            "apiKey": cfg.api.upbit_access_key,
            "secret": cfg.api.upbit_secret_key,
        })

        loop = asyncio.get_event_loop()
        balance = await loop.run_in_executor(None, exchange.fetch_balance)

        krw_balance = float(balance.get("KRW", {}).get("free", 0))
        coins = []
        total_coin_eval = 0

        # Iterate all currencies with positive balance
        for currency, info in balance.items():
            if currency in ("KRW", "info", "free", "used", "total", "debt", "timestamp", "datetime"):
                continue
            total_amt = float(info.get("total", 0)) if isinstance(info, dict) else 0
            if total_amt <= 0:
                continue

            # Try to get current price and avg buy price
            symbol = f"{currency}/KRW"
            try:
                ticker = await loop.run_in_executor(None, exchange.fetch_ticker, symbol)
                current_price = ticker.get("last", 0)
            except Exception:
                current_price = 0

            # Get avg buy price from Upbit private API
            avg_buy_price = 0
            try:
                resp_info = balance.get("info", [])
                if isinstance(resp_info, list):
                    for item in resp_info:
                        if item.get("currency") == currency:
                            avg_buy_price = float(item.get("avg_buy_price", 0))
                            break
            except Exception:
                pass

            eval_krw = total_amt * current_price if current_price else 0
            pnl_pct = ((current_price - avg_buy_price) / avg_buy_price * 100) if avg_buy_price > 0 else 0
            total_coin_eval += eval_krw

            coins.append({
                "currency": currency,
                "balance": total_amt,
                "avg_buy_price": avg_buy_price,
                "current_price": current_price,
                "eval_krw": round(eval_krw),
                "pnl_pct": round(pnl_pct, 2),
            })

        # Sort by eval_krw descending
        coins.sort(key=lambda c: c["eval_krw"], reverse=True)

        return {
            "krw_balance": round(krw_balance),
            "coins": coins,
            "total_eval_krw": round(krw_balance + total_coin_eval),
        }

    except Exception as e:
        logger.error("Failed to fetch assets: %s", e)
        return {"krw_balance": 0, "coins": [], "total_eval_krw": 0, "error": str(e)}


# Dynamic coin validation – cached from Upbit markets
import time as _time

_valid_coins_cache: set[str] | None = None
_valid_coins_ts: float = 0
_COIN_CACHE_TTL = 3600  # 1 hour


def _get_valid_coins() -> set[str]:
    """Return the set of active KRW-traded coin IDs, cached for 1 hour."""
    global _valid_coins_cache, _valid_coins_ts
    now = _time.time()
    if _valid_coins_cache and (now - _valid_coins_ts) < _COIN_CACHE_TTL:
        return _valid_coins_cache
    try:
        exchange = _get_exchange()
        markets = exchange.load_markets()
        _valid_coins_cache = {
            market["base"]
            for symbol, market in markets.items()
            if "/KRW" in symbol and market.get("active", True)
        }
        _valid_coins_ts = now
    except Exception:
        if not _valid_coins_cache:
            _valid_coins_cache = {"BTC", "ETH", "XRP", "SOL", "ADA"}
    return _valid_coins_cache


def _get_exchange():
    """Create a ccxt Upbit exchange instance."""
    import ccxt

    cfg = get_config()
    return ccxt.upbit({
        "enableRateLimit": True,
        "apiKey": cfg.api.upbit_access_key,
        "secret": cfg.api.upbit_secret_key,
        "options": {
            "createMarketBuyOrderRequiresPrice": False,
        },
    })


@router.post("/manual-buy")
async def manual_buy(req: ManualBuyRequest):
    """Execute a manual market buy order."""
    cfg = get_config()
    if not cfg.api.upbit_access_key or not cfg.api.upbit_secret_key:
        raise HTTPException(400, "Upbit API keys are not configured.")

    if req.coin not in _get_valid_coins():
        raise HTTPException(400, f"Unsupported coin: {req.coin}")

    if req.amount_krw < 5000:
        raise HTTPException(400, "Minimum trade amount is 5,000 KRW.")

    try:
        exchange = _get_exchange()
        symbol = f"{req.coin}/KRW"

        loop = asyncio.get_event_loop()

        # Fetch current price
        ticker = await loop.run_in_executor(None, exchange.fetch_ticker, symbol)
        price = ticker.get("last", 0)
        if price <= 0:
            raise HTTPException(400, "Could not fetch current price.")

        # Market buy – amount = KRW cost
        order = await loop.run_in_executor(
            None, lambda: exchange.create_market_buy_order(symbol, req.amount_krw)
        )

        filled_price = order.get("average") or order.get("price") or price
        filled_qty = order.get("filled") or req.amount_krw / (filled_price or price)

        logger.info("Manual BUY: %s @ %s, qty=%s", req.coin, filled_price, filled_qty)

        return {
            "status": "ok",
            "action": "BUY",
            "coin": req.coin,
            "price": filled_price,
            "quantity": filled_qty,
            "amount_krw": req.amount_krw,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Manual buy failed: %s", e, exc_info=True)
        raise HTTPException(500, f"Buy failed: {e}")


@router.post("/manual-sell")
async def manual_sell(req: ManualSellRequest):
    """Execute a manual market sell order."""
    cfg = get_config()
    if not cfg.api.upbit_access_key or not cfg.api.upbit_secret_key:
        raise HTTPException(400, "Upbit API keys are not configured.")

    if req.coin not in _get_valid_coins():
        raise HTTPException(400, f"Unsupported coin: {req.coin}")

    try:
        exchange = _get_exchange()
        symbol = f"{req.coin}/KRW"

        loop = asyncio.get_event_loop()

        # If quantity not given, sell all
        sell_qty = req.quantity
        if not sell_qty:
            balance = await loop.run_in_executor(None, exchange.fetch_balance)
            coin_info = balance.get(req.coin, {})
            sell_qty = float(coin_info.get("free", 0)) if isinstance(coin_info, dict) else 0
            if sell_qty <= 0:
                raise HTTPException(400, f"No {req.coin} balance to sell.")

        # Pre-check: estimate order value against Upbit minimum (5,000 KRW)
        ticker = await loop.run_in_executor(None, exchange.fetch_ticker, symbol)
        current_price = ticker.get("last", 0)
        if current_price > 0:
            est_value = sell_qty * current_price
            if est_value < 5000:
                raise HTTPException(
                    400,
                    f"Sell amount too small: ₩{est_value:,.0f} (min ₩5,000). "
                    f"Quantity: {sell_qty:.8f} × ₩{current_price:,.0f}"
                )

        # Market sell
        order = await loop.run_in_executor(
            None, lambda: exchange.create_market_sell_order(symbol, sell_qty)
        )

        filled_price = order.get("average") or order.get("price") or current_price
        filled_qty = order.get("filled") or sell_qty
        est_krw = filled_price * filled_qty if filled_price else 0

        logger.info("Manual SELL: %s @ %s, qty=%s", req.coin, filled_price, filled_qty)

        return {
            "status": "ok",
            "action": "SELL",
            "coin": req.coin,
            "price": filled_price,
            "quantity": filled_qty,
            "est_krw": round(est_krw),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Manual sell failed: %s", e, exc_info=True)
        # Parse Upbit-specific error messages for user-friendly display
        err_msg = str(e)
        if "under_min_total_market_ask" in err_msg:
            raise HTTPException(400, "Sell amount is below Upbit minimum (₩5,000). The holdings value is too small to sell.")
        raise HTTPException(500, f"Sell failed: {e}")


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


_coins_cache: list[dict] | None = None
_coins_cache_ts: float = 0
_COINS_CACHE_TTL = 300  # 5 minutes


@router.get("/available-coins")
async def get_available_coins():
    """Fetch available KRW trading pairs from Upbit with price and volume."""
    global _coins_cache, _coins_cache_ts

    now = _time.time()
    if _coins_cache and (now - _coins_cache_ts) < _COINS_CACHE_TTL:
        return {"coins": _coins_cache}

    try:
        exchange = _get_exchange()
        loop = asyncio.get_event_loop()
        markets = await loop.run_in_executor(None, exchange.load_markets)

        # Gather KRW symbols
        krw_symbols = [
            s for s, m in markets.items()
            if "/KRW" in s and m.get("active", True)
        ]

        # Fetch tickers for price / volume
        tickers = {}
        try:
            tickers = await loop.run_in_executor(
                None, lambda: exchange.fetch_tickers(krw_symbols)
            )
        except Exception:
            pass  # price/volume is optional

        krw_coins = []
        for symbol in krw_symbols:
            market = markets[symbol]
            base = market["base"]
            ticker = tickers.get(symbol, {})
            krw_coins.append({
                "id": base,
                "name": market.get("id", base),
                "symbol": symbol,
                "price": ticker.get("last", 0) or 0,
                "volume_24h": ticker.get("quoteVolume", 0) or 0,
            })

        # Sort by 24h KRW volume descending (most popular first)
        krw_coins.sort(key=lambda x: x.get("volume_24h", 0), reverse=True)

        _coins_cache = krw_coins
        _coins_cache_ts = now

        # Also refresh valid-coins cache
        global _valid_coins_cache, _valid_coins_ts
        _valid_coins_cache = {c["id"] for c in krw_coins}
        _valid_coins_ts = now

        return {"coins": krw_coins}

    except Exception as e:
        logger.error("Failed to fetch available coins: %s", e)
        raise HTTPException(status_code=500, detail=str(e))
