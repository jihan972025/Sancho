"""API routes for the auto-trading feature."""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from collections import deque
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from ..config import get_config
from ..llm.registry import get_provider_for_model
from ..autotrading import storage
from ..autotrading.engine import TradingEngine, EXCHANGE_CONFIG

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
    exchange: str = "upbit"


class ManualBuyRequest(BaseModel):
    coin: str = "BTC"
    amount_krw: float = 10000
    exchange: str = "upbit"


class ManualSellRequest(BaseModel):
    coin: str = "BTC"
    quantity: float | None = None  # None = sell all
    exchange: str = "upbit"


# ── Endpoints ──

@router.post("/start")
async def start_trading(req: StartRequest):
    global _engine

    if _engine and _engine.is_running:
        raise HTTPException(400, "Trading is already running. Stop first.")

    cfg = get_config()

    # Validate exchange
    ex_id = req.exchange
    if ex_id not in EXCHANGE_CONFIG:
        raise HTTPException(400, f"Unsupported exchange: {ex_id}")

    # Check API keys for selected exchange
    if not _check_exchange_keys(cfg, ex_id):
        raise HTTPException(400, f"{ex_id.capitalize()} API keys are not configured. Set them in Settings > API.")

    if req.strategy not in ("llm", "rule"):
        raise HTTPException(400, f"Unsupported strategy: {req.strategy}")

    if req.strategy == "llm":
        if not req.model:
            raise HTTPException(400, "AI model must be selected.")
        provider = get_provider_for_model(req.model)
        if not provider:
            raise HTTPException(400, f"Model '{req.model}' is not available.")

    ex_cfg = EXCHANGE_CONFIG[ex_id]
    if req.amount_krw < ex_cfg["min_order"]:
        raise HTTPException(400, f"Minimum trade amount is {ex_cfg['currency_symbol']}{ex_cfg['min_order']:,}.")

    if req.coin not in _get_valid_coins(ex_id):
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
        exchange=ex_id,
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
        "exchange": ex_id,
    })

    return {"status": "started", "coin": req.coin, "timeframe": req.timeframe, "exchange": ex_id}


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
async def get_assets(exchange: str = "upbit"):
    """Fetch user's exchange balance and holdings with current valuations."""
    cfg = get_config()
    ex_id = exchange if exchange in EXCHANGE_CONFIG else "upbit"
    ex_cfg = EXCHANGE_CONFIG[ex_id]
    quote = ex_cfg["quote"]
    cs = ex_cfg["currency_symbol"]

    if not _check_exchange_keys(cfg, ex_id):
        return {"quote": quote, "currency_symbol": cs, "quote_balance": 0, "coins": [], "total_eval": 0, "error": "API keys not configured"}

    try:
        ex = _get_exchange(ex_id)
        loop = asyncio.get_event_loop()
        balance = await loop.run_in_executor(None, ex.fetch_balance)

        quote_balance = float(balance.get(quote, {}).get("free", 0))
        coins = []
        total_coin_eval = 0

        skip_keys = {quote, "info", "free", "used", "total", "debt", "timestamp", "datetime"}

        # Iterate all currencies with positive balance
        for currency, info in balance.items():
            if currency in skip_keys:
                continue
            total_amt = float(info.get("total", 0)) if isinstance(info, dict) else 0
            if total_amt <= 0:
                continue

            # Try to get current price
            symbol = f"{currency}/{quote}"
            try:
                ticker = await loop.run_in_executor(None, ex.fetch_ticker, symbol)
                current_price = ticker.get("last", 0)
            except Exception:
                current_price = 0

            # Get avg buy price from Upbit private API (Upbit-specific)
            avg_buy_price = 0
            if ex_id == "upbit":
                try:
                    resp_info = balance.get("info", [])
                    if isinstance(resp_info, list):
                        for item in resp_info:
                            if item.get("currency") == currency:
                                avg_buy_price = float(item.get("avg_buy_price", 0))
                                break
                except Exception:
                    pass

            eval_amt = total_amt * current_price if current_price else 0
            pnl_pct = ((current_price - avg_buy_price) / avg_buy_price * 100) if avg_buy_price > 0 else 0
            total_coin_eval += eval_amt

            coins.append({
                "currency": currency,
                "balance": total_amt,
                "avg_buy_price": avg_buy_price,
                "current_price": current_price,
                "eval_krw": round(eval_amt),
                "pnl_pct": round(pnl_pct, 2),
            })

        # Sort by eval descending
        coins.sort(key=lambda c: c["eval_krw"], reverse=True)

        return {
            "quote": quote,
            "currency_symbol": cs,
            "krw_balance": round(quote_balance),
            "coins": coins,
            "total_eval_krw": round(quote_balance + total_coin_eval),
        }

    except Exception as e:
        logger.error("Failed to fetch assets: %s", e)
        return {"quote": quote, "currency_symbol": cs, "krw_balance": 0, "coins": [], "total_eval_krw": 0, "error": str(e)}


# Dynamic coin validation – cached per exchange
import time as _time

_valid_coins_cache: dict[str, set[str]] = {}
_valid_coins_ts: dict[str, float] = {}
_COIN_CACHE_TTL = 3600  # 1 hour


def _check_exchange_keys(cfg, ex_id: str) -> bool:
    """Check if API keys are configured for a given exchange."""
    key_map = {
        "upbit":    ("upbit_access_key",   "upbit_secret_key"),
        "binance":  ("binance_api_key",    "binance_secret_key"),
        "coinbase": ("coinbase_api_key",   "coinbase_secret_key"),
        "bybit":    ("bybit_api_key",      "bybit_secret_key"),
        "okx":      ("okx_api_key",        "okx_secret_key"),
        "kraken":   ("kraken_api_key",     "kraken_secret_key"),
        "mexc":     ("mexc_api_key",       "mexc_secret_key"),
        "gateio":   ("gateio_api_key",     "gateio_secret_key"),
        "kucoin":   ("kucoin_api_key",     "kucoin_secret_key"),
        "bitget":   ("bitget_api_key",     "bitget_secret_key"),
        "htx":      ("htx_api_key",        "htx_secret_key"),
    }
    fields = key_map.get(ex_id, key_map["upbit"])
    return all(getattr(cfg.api, f, "") for f in fields)


def _get_valid_coins(ex_id: str = "upbit") -> set[str]:
    """Return the set of active traded coin IDs for an exchange, cached for 1 hour."""
    now = _time.time()
    if ex_id in _valid_coins_cache and (now - _valid_coins_ts.get(ex_id, 0)) < _COIN_CACHE_TTL:
        return _valid_coins_cache[ex_id]
    try:
        exchange = _get_exchange(ex_id)
        quote = EXCHANGE_CONFIG.get(ex_id, EXCHANGE_CONFIG["upbit"])["quote"]
        markets = exchange.load_markets()
        _valid_coins_cache[ex_id] = {
            market["base"]
            for symbol, market in markets.items()
            if f"/{quote}" in symbol and market.get("active", True)
        }
        _valid_coins_ts[ex_id] = now
    except Exception:
        if ex_id not in _valid_coins_cache:
            _valid_coins_cache[ex_id] = {"BTC", "ETH", "XRP", "SOL", "ADA"}
    return _valid_coins_cache[ex_id]


def _get_exchange(ex_id: str = "upbit"):
    """Create a ccxt exchange instance for the given exchange."""
    import ccxt

    cfg = get_config()
    ex_cfg = EXCHANGE_CONFIG.get(ex_id, EXCHANGE_CONFIG["upbit"])

    key_map = {
        "upbit":    ("upbit_access_key",   "upbit_secret_key",   None),
        "binance":  ("binance_api_key",    "binance_secret_key", None),
        "coinbase": ("coinbase_api_key",   "coinbase_secret_key", None),
        "bybit":    ("bybit_api_key",      "bybit_secret_key",   None),
        "okx":      ("okx_api_key",        "okx_secret_key",     "okx_passphrase"),
        "kraken":   ("kraken_api_key",     "kraken_secret_key",  None),
        "mexc":     ("mexc_api_key",       "mexc_secret_key",    None),
        "gateio":   ("gateio_api_key",     "gateio_secret_key",  None),
        "kucoin":   ("kucoin_api_key",     "kucoin_secret_key",  "kucoin_passphrase"),
        "bitget":   ("bitget_api_key",     "bitget_secret_key",  "bitget_passphrase"),
        "htx":      ("htx_api_key",        "htx_secret_key",     None),
    }

    api_key_field, secret_field, passphrase_field = key_map.get(ex_id, key_map["upbit"])
    params: dict = {
        "enableRateLimit": True,
        "apiKey": getattr(cfg.api, api_key_field, ""),
        "secret": getattr(cfg.api, secret_field, ""),
        "options": dict(ex_cfg.get("ccxt_options", {})),
    }
    if passphrase_field:
        params["password"] = getattr(cfg.api, passphrase_field, "")

    exchange_class = getattr(ccxt, ex_id, None)
    if not exchange_class:
        raise ValueError(f"Unsupported exchange: {ex_id}")
    return exchange_class(params)


@router.post("/manual-buy")
async def manual_buy(req: ManualBuyRequest):
    """Execute a manual market buy order."""
    cfg = get_config()
    ex_id = req.exchange if req.exchange in EXCHANGE_CONFIG else "upbit"
    ex_cfg = EXCHANGE_CONFIG[ex_id]
    quote = ex_cfg["quote"]

    if not _check_exchange_keys(cfg, ex_id):
        raise HTTPException(400, f"{ex_id.capitalize()} API keys are not configured.")

    if req.coin not in _get_valid_coins(ex_id):
        raise HTTPException(400, f"Unsupported coin: {req.coin}")

    if req.amount_krw < ex_cfg["min_order"]:
        raise HTTPException(400, f"Minimum trade amount is {ex_cfg['currency_symbol']}{ex_cfg['min_order']:,}.")

    try:
        exchange = _get_exchange(ex_id)
        symbol = f"{req.coin}/{quote}"

        loop = asyncio.get_event_loop()

        # Fetch current price
        ticker = await loop.run_in_executor(None, exchange.fetch_ticker, symbol)
        price = ticker.get("last", 0)
        if price <= 0:
            raise HTTPException(400, "Could not fetch current price.")

        # Market buy
        if ex_cfg["buy_by_cost"]:
            order = await loop.run_in_executor(
                None, lambda: exchange.create_market_buy_order(symbol, req.amount_krw)
            )
        else:
            qty = req.amount_krw / price
            order = await loop.run_in_executor(
                None, lambda: exchange.create_market_buy_order(symbol, qty)
            )

        filled_price = order.get("average") or order.get("price") or price
        filled_qty = order.get("filled") or req.amount_krw / (filled_price or price)

        logger.info("Manual BUY: %s @ %s, qty=%s", req.coin, filled_price, filled_qty)

        # Queue trade notification for chat apps
        storage.add_trade_notification({
            "id": str(uuid.uuid4()),
            "source": "manual",
            "action": "BUY",
            "coin": req.coin,
            "trade_data": {
                "price": filled_price,
                "quantity": filled_qty,
                "amount_krw": req.amount_krw,
            },
            "created_at": datetime.now(timezone.utc).isoformat(),
            "delivered": False,
        })

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
    ex_id = req.exchange if req.exchange in EXCHANGE_CONFIG else "upbit"
    ex_cfg = EXCHANGE_CONFIG[ex_id]
    quote = ex_cfg["quote"]
    cs = ex_cfg["currency_symbol"]

    if not _check_exchange_keys(cfg, ex_id):
        raise HTTPException(400, f"{ex_id.capitalize()} API keys are not configured.")

    if req.coin not in _get_valid_coins(ex_id):
        raise HTTPException(400, f"Unsupported coin: {req.coin}")

    try:
        exchange = _get_exchange(ex_id)
        symbol = f"{req.coin}/{quote}"

        loop = asyncio.get_event_loop()

        # If quantity not given, sell all
        sell_qty = req.quantity
        if not sell_qty:
            balance = await loop.run_in_executor(None, exchange.fetch_balance)
            coin_info = balance.get(req.coin, {})
            sell_qty = float(coin_info.get("free", 0)) if isinstance(coin_info, dict) else 0
            if sell_qty <= 0:
                raise HTTPException(400, f"No {req.coin} balance to sell.")

        # Pre-check: estimate order value against exchange minimum
        ticker = await loop.run_in_executor(None, exchange.fetch_ticker, symbol)
        current_price = ticker.get("last", 0)
        min_order = ex_cfg["min_order"]
        if current_price > 0:
            est_value = sell_qty * current_price
            if est_value < min_order:
                raise HTTPException(
                    400,
                    f"Sell amount too small: {cs}{est_value:,.2f} (min {cs}{min_order:,}). "
                    f"Quantity: {sell_qty:.8f} × {cs}{current_price:,.2f}"
                )

        # Market sell
        order = await loop.run_in_executor(
            None, lambda: exchange.create_market_sell_order(symbol, sell_qty)
        )

        filled_price = order.get("average") or order.get("price") or current_price
        filled_qty = order.get("filled") or sell_qty
        est_krw = filled_price * filled_qty if filled_price else 0

        logger.info("Manual SELL: %s @ %s, qty=%s", req.coin, filled_price, filled_qty)

        # Queue trade notification for chat apps
        storage.add_trade_notification({
            "id": str(uuid.uuid4()),
            "source": "manual",
            "action": "SELL",
            "coin": req.coin,
            "trade_data": {
                "price": filled_price,
                "quantity": filled_qty,
                "est_krw": round(est_krw),
            },
            "created_at": datetime.now(timezone.utc).isoformat(),
            "delivered": False,
        })

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


# ── Trade Notifications (for chat app delivery via Electron) ──

@router.get("/notifications")
async def get_trade_notifications():
    """Return pending trade notifications for Electron to send to chat apps."""
    notifications = storage.get_pending_trade_notifications()
    return {"notifications": notifications}


class AckTradeNotificationsRequest(BaseModel):
    ids: list[str]


@router.post("/notifications/ack")
async def ack_trade_notifications(req: AckTradeNotificationsRequest):
    """Mark trade notifications as delivered."""
    storage.ack_trade_notifications(req.ids)
    return {"status": "ok"}


_coins_cache: dict[str, list[dict]] = {}
_coins_cache_ts: dict[str, float] = {}
_COINS_CACHE_TTL = 300  # 5 minutes


@router.get("/available-coins")
async def get_available_coins(exchange: str = "upbit"):
    """Fetch available trading pairs from exchange with price and volume."""
    ex_id = exchange if exchange in EXCHANGE_CONFIG else "upbit"
    ex_cfg = EXCHANGE_CONFIG[ex_id]
    quote = ex_cfg["quote"]

    now = _time.time()
    if ex_id in _coins_cache and (now - _coins_cache_ts.get(ex_id, 0)) < _COINS_CACHE_TTL:
        return {"coins": _coins_cache[ex_id]}

    try:
        ex = _get_exchange(ex_id)
        loop = asyncio.get_event_loop()
        markets = await loop.run_in_executor(None, ex.load_markets)

        # Gather quote-currency symbols
        target_symbols = [
            s for s, m in markets.items()
            if f"/{quote}" in s and m.get("active", True)
        ]

        # Fetch tickers for price / volume
        tickers = {}
        try:
            tickers = await loop.run_in_executor(
                None, lambda: ex.fetch_tickers(target_symbols)
            )
        except Exception:
            pass  # price/volume is optional

        result_coins = []
        for symbol in target_symbols:
            market = markets[symbol]
            base = market["base"]
            ticker = tickers.get(symbol, {})
            result_coins.append({
                "id": base,
                "name": market.get("id", base),
                "symbol": symbol,
                "price": ticker.get("last", 0) or 0,
                "volume_24h": ticker.get("quoteVolume", 0) or 0,
            })

        # Sort by 24h volume descending (most popular first)
        result_coins.sort(key=lambda x: x.get("volume_24h", 0), reverse=True)

        _coins_cache[ex_id] = result_coins
        _coins_cache_ts[ex_id] = now

        # Also refresh valid-coins cache
        _valid_coins_cache[ex_id] = {c["id"] for c in result_coins}
        _valid_coins_ts[ex_id] = now

        return {"coins": result_coins}

    except Exception as e:
        logger.error("Failed to fetch available coins: %s", e)
        raise HTTPException(status_code=500, detail=str(e))
