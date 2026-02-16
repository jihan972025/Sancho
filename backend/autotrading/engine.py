"""Core auto-trading engine – polling loop, LLM strategy, order execution."""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Callable

from ..config import get_config
from ..llm.registry import get_provider_for_model
from . import indicators, storage

logger = logging.getLogger(__name__)

UPBIT_FEE = 0.0005  # 0.05 %

COIN_KRW_MAP = {
    "BTC": "BTC/KRW",
    "ETH": "ETH/KRW",
    "XRP": "XRP/KRW",
    "SOL": "SOL/KRW",
    "TRX": "TRX/KRW",
    "ADA": "ADA/KRW",
    "XMR": "XMR/KRW",
}

TIMEFRAME_SECONDS = {
    "5m": 5 * 60,
    "10m": 10 * 60,
    "15m": 15 * 60,
    "30m": 30 * 60,
    "1h": 60 * 60,
    "4h": 4 * 60 * 60,
}

# ── LLM Strategy Prompt ──

_SYSTEM_PROMPT = """\
You are a professional cryptocurrency quantitative trader for Upbit KRW market.

## Goal
Generate profitable short-term trading signals. Upbit charges 0.05 % fee per trade (0.1 % round-trip).
Only recommend a BUY or SELL when you are highly confident the expected gain exceeds 0.15 %.

## Current Market State
Coin: {coin}/KRW
Analysis Interval: {timeframe}
Candle Interval: {candle_interval}
Current Price: ₩{current_price:,.0f}

## Technical Indicators
- RSI(14): {rsi}
- MACD: {macd} | Signal: {macd_signal} | Histogram: {macd_histogram}
- Bollinger Bands: Upper=₩{bb_upper:,.0f}  Mid=₩{bb_middle:,.0f}  Lower=₩{bb_lower:,.0f}  Position={bb_position}
- SMA(20): ₩{sma_20:,.0f}  SMA(50): ₩{sma_50:,.0f}
- EMA(12): ₩{ema_12:,.0f}  EMA(26): ₩{ema_26:,.0f}
- Volume: {volume:,.2f}  (20-avg: {volume_avg_20:,.2f})
- ATR: ₩{atr:,.0f}
- Last candle change: {price_change_pct}%

## Recent Candles
{recent_candles}

## Position
{position_text}

## Rules
1. Require confluence of 3+ indicators before BUY/SELL.
2. HOLD if uncertain – no trade is better than a losing trade.
3. Factor in 0.05 % fee per side.
4. If in position: recommend SELL on stop-loss (-2 %) or reversal signal.
5. Avoid overtrading.
6. Volume confirmation: prefer BUY/SELL signals backed by above-average volume; be cautious when volume is below the 20-period average.
7. EMA crossover: EMA(12) > EMA(26) = bullish trend, EMA(12) < EMA(26) = bearish trend. Use as trend filter before entering trades.

IMPORTANT: Write the "reasoning" field in {language}. All other field names and values (action, confidence, etc.) must remain in English.

Respond ONLY with valid JSON (no markdown fences):
{{"action":"BUY"|"SELL"|"HOLD","confidence":0.0-1.0,"reasoning":"...","expected_move_pct":number,"stop_loss_pct":number,"take_profit_pct":number}}
"""


class TradingEngine:
    """Manages the async trading loop."""

    def __init__(
        self,
        coin: str,
        timeframe: str,
        amount_krw: float,
        model: str,
        on_event: Callable[[dict], Any] | None = None,
        language: str = "en",
        candle_interval: str = "15m",
        strategy: str = "llm",
    ):
        self.coin = coin
        self.timeframe = timeframe
        self.candle_interval = candle_interval
        self.amount_krw = amount_krw
        self.model = model
        self.on_event = on_event  # SSE callback
        self.language = language
        self.strategy = strategy  # "llm" or "rule"

        self.is_running = False
        self._task: asyncio.Task | None = None

        # Position state
        self.in_position = False
        self.entry_price: float = 0
        self.entry_time: str = ""
        self.quantity: float = 0

        # Cooldown
        self._last_trade_candle = 0
        self._candle_count = 0

        # Daily risk
        self._daily_pnl_pct: float = 0

        # Latest status snapshot
        self.last_decision: dict = {}
        self.current_price: float = 0

    # ── Lifecycle ──

    async def start(self) -> None:
        if self.is_running:
            return
        self.is_running = True
        self._task = asyncio.create_task(self._loop())
        logger.info("AutoTrading started: %s interval=%s candle=%s ₩%s %s strategy=%s", self.coin, self.timeframe, self.candle_interval, self.amount_krw, self.model, self.strategy)

    async def stop(self) -> None:
        self.is_running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        logger.info("AutoTrading stopped")

    # ── Main loop ──

    async def _loop(self) -> None:
        loop = asyncio.get_event_loop()
        interval = TIMEFRAME_SECONDS.get(self.timeframe, 300)

        # Candle interval is independent of loop interval
        ccxt_tf = self.candle_interval

        while self.is_running:
            try:
                self._candle_count += 1
                self._emit({"type": "progress", "content": f"Fetching {self.coin}/KRW {self.candle_interval} data..."})

                # 1. Fetch candles
                candles = await loop.run_in_executor(None, self._fetch_candles, ccxt_tf)
                if not candles or len(candles) < 30:
                    self._emit({"type": "error", "content": "Not enough candle data"})
                    await asyncio.sleep(60)
                    continue

                # 2. Indicators
                ind = indicators.calculate_all(candles)
                self.current_price = ind["current_price"]
                recent_text = indicators.format_recent_candles(candles, 10)

                # 3. Check stop-loss / take-profit if in position
                if self.in_position:
                    unrealized_pct = (self.current_price - self.entry_price) / self.entry_price * 100
                    if unrealized_pct <= -2.0:
                        self._emit({"type": "progress", "content": f"Stop-loss triggered ({unrealized_pct:+.2f}%)"})
                        await self._execute_sell("Stop-loss at -2%", loop)
                        await asyncio.sleep(interval)
                        continue
                    # Take-profit removed — let signals (LLM or rule) decide when to sell

                # 4. Daily loss limit
                if self._daily_pnl_pct <= -5.0:
                    self._emit({"type": "warning", "content": "Daily loss limit -5 % reached. Pausing."})
                    await asyncio.sleep(interval * 3)
                    continue

                # 5. Decision (LLM or rule-based)
                if self.strategy == "rule":
                    self._emit({"type": "progress", "content": "Analyzing with rules..."})
                    decision = self._rule_based_decision(ind)
                else:
                    self._emit({"type": "progress", "content": "Analyzing with AI..."})
                    decision = await self._ask_llm(ind, recent_text)
                self.last_decision = decision
                self._emit({"type": "signal", "content": decision})

                # 6. Execute
                cooldown_ok = (self._candle_count - self._last_trade_candle) >= 2
                confidence = decision.get("confidence", 0)
                min_conf = 0.5 if self.strategy == "rule" else 0.7

                if decision.get("action") == "BUY" and not self.in_position and confidence >= min_conf and cooldown_ok:
                    await self._execute_buy(decision.get("reasoning", ""), loop)
                elif decision.get("action") == "SELL" and self.in_position and confidence >= min_conf:
                    await self._execute_sell(decision.get("reasoning", ""), loop)

                # Broadcast status
                self._emit({"type": "status", "content": self.get_status()})

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("Trading loop error: %s", e, exc_info=True)
                self._emit({"type": "error", "content": str(e)})

            await asyncio.sleep(interval)

    # ── Upbit interaction ──

    def _get_exchange(self):
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

    def _fetch_candles(self, tf: str) -> list:
        exchange = self._get_exchange()
        symbol = COIN_KRW_MAP.get(self.coin, f"{self.coin}/KRW")
        return exchange.fetch_ohlcv(symbol, tf, limit=150)

    async def _execute_buy(self, reasoning: str, loop: asyncio.AbstractEventLoop) -> None:
        try:
            self._emit({"type": "progress", "content": f"Executing BUY {self.coin}..."})
            exchange = self._get_exchange()
            symbol = COIN_KRW_MAP.get(self.coin, f"{self.coin}/KRW")

            # Fetch current price
            ticker = await loop.run_in_executor(None, exchange.fetch_ticker, symbol)
            price = ticker.get("last", 0)
            if price <= 0:
                self._emit({"type": "error", "content": "Invalid price"})
                return

            # Execute market buy – pass KRW cost directly
            # (createMarketBuyOrderRequiresPrice=False → amount = cost in KRW)
            cost = self.amount_krw
            order = await loop.run_in_executor(
                None, lambda: exchange.create_market_buy_order(symbol, cost)
            )

            filled_price = order.get("average", price)
            filled_qty = order.get("filled", cost / price)

            self.in_position = True
            self.entry_price = filled_price
            self.entry_time = datetime.now(timezone.utc).isoformat()
            self.quantity = filled_qty
            self._last_trade_candle = self._candle_count

            self._emit({
                "type": "trade",
                "content": {
                    "action": "BUY",
                    "price": filled_price,
                    "quantity": filled_qty,
                    "reasoning": reasoning,
                },
            })
            logger.info("BUY executed: %s @ ₩%s qty=%s", self.coin, filled_price, filled_qty)

        except Exception as e:
            logger.error("Buy execution failed: %s", e)
            self._emit({"type": "error", "content": f"Buy failed: {e}"})

    async def _execute_sell(self, reasoning: str, loop: asyncio.AbstractEventLoop) -> None:
        if not self.in_position:
            return
        try:
            self._emit({"type": "progress", "content": f"Executing SELL {self.coin}..."})
            exchange = self._get_exchange()
            symbol = COIN_KRW_MAP.get(self.coin, f"{self.coin}/KRW")

            order = await loop.run_in_executor(
                None, lambda: exchange.create_market_sell_order(symbol, self.quantity)
            )

            filled_price = order.get("average", self.current_price)
            exit_time = datetime.now(timezone.utc).isoformat()

            # P&L calculation
            entry_total = self.entry_price * self.quantity
            exit_total = filled_price * self.quantity
            fee_buy = entry_total * UPBIT_FEE
            fee_sell = exit_total * UPBIT_FEE
            total_fee = fee_buy + fee_sell
            pnl_krw = exit_total - entry_total - total_fee
            pnl_pct = (pnl_krw / entry_total) * 100 if entry_total > 0 else 0

            self._daily_pnl_pct += pnl_pct

            trade_record = {
                "id": str(uuid.uuid4()),
                "coin": self.coin,
                "timeframe": self.timeframe,
                "candle_interval": self.candle_interval,
                "entry_price": round(self.entry_price, 2),
                "exit_price": round(filled_price, 2),
                "amount_krw": round(entry_total, 0),
                "quantity": round(self.quantity, 8),
                "pnl_krw": round(pnl_krw, 0),
                "pnl_pct": round(pnl_pct, 4),
                "fee_krw": round(total_fee, 0),
                "reasoning": reasoning,
                "entry_time": self.entry_time,
                "exit_time": exit_time,
            }

            storage.save_trade(trade_record)

            self._emit({
                "type": "trade",
                "content": {"action": "SELL", **trade_record},
            })
            logger.info(
                "SELL executed: %s @ ₩%s PnL=₩%s (%s%%)",
                self.coin, filled_price, pnl_krw, round(pnl_pct, 2),
            )

            # Reset position
            self.in_position = False
            self.entry_price = 0
            self.entry_time = ""
            self.quantity = 0
            self._last_trade_candle = self._candle_count

        except Exception as e:
            logger.error("Sell execution failed: %s", e)
            self._emit({"type": "error", "content": f"Sell failed: {e}"})

    # ── Rule-based strategy ──

    def _rule_based_decision(self, ind: dict) -> dict:
        """Pure technical-indicator decision without LLM."""
        rsi = ind.get("rsi", 50)
        macd_hist = ind.get("macd_histogram", 0)
        bb_pos = ind.get("bb_position", 0.5)
        price = ind.get("current_price", 0)
        sma20 = ind.get("sma_20", price)
        ema12 = ind.get("ema_12", price)
        ema26 = ind.get("ema_26", price)
        vol = ind.get("volume", 0)
        vol_avg = ind.get("volume_avg_20", 0)

        if self.in_position:
            # Sell signals
            sell_signals: list[str] = []
            if rsi > 70:
                sell_signals.append(f"RSI({rsi:.1f})>70")
            if macd_hist < 0:
                sell_signals.append(f"MACD hist({macd_hist:.4f})<0")
            if bb_pos > 0.8:
                sell_signals.append(f"BB pos({bb_pos:.2f})>0.8")
            if ema12 < ema26:
                sell_signals.append("EMA12<EMA26")

            if len(sell_signals) >= 2:
                conf = len(sell_signals) / 4
                return {
                    "action": "SELL",
                    "confidence": round(conf, 2),
                    "reasoning": "Rule: " + ", ".join(sell_signals),
                    "expected_move_pct": -0.5,
                    "stop_loss_pct": -2.0,
                    "take_profit_pct": 1.5,
                }
        else:
            # Buy signals
            buy_signals: list[str] = []
            if rsi < 30:
                buy_signals.append(f"RSI({rsi:.1f})<30")
            if macd_hist > 0:
                buy_signals.append(f"MACD hist({macd_hist:.4f})>0")
            if bb_pos < 0.2:
                buy_signals.append(f"BB pos({bb_pos:.2f})<0.2")
            if price > sma20:
                buy_signals.append("Price>SMA20")
            if ema12 > ema26:
                buy_signals.append("EMA12>EMA26")
            if vol_avg > 0 and vol > vol_avg:
                buy_signals.append("Vol>Avg")

            if len(buy_signals) >= 3:
                conf = len(buy_signals) / 6
                return {
                    "action": "BUY",
                    "confidence": round(conf, 2),
                    "reasoning": "Rule: " + ", ".join(buy_signals),
                    "expected_move_pct": 0.5,
                    "stop_loss_pct": -2.0,
                    "take_profit_pct": 1.5,
                }

        return {
            "action": "HOLD",
            "confidence": 0,
            "reasoning": "Rule: insufficient signals",
            "expected_move_pct": 0,
            "stop_loss_pct": -2.0,
            "take_profit_pct": 1.5,
        }

    # ── LLM strategy ──

    async def _ask_llm(self, ind: dict, recent_candles: str) -> dict:
        provider = get_provider_for_model(self.model)
        if not provider:
            return {"action": "HOLD", "confidence": 0, "reasoning": "Model unavailable"}

        if self.in_position:
            unrealized = (ind["current_price"] - self.entry_price) / self.entry_price * 100
            position_text = (
                f"IN POSITION — Entry: ₩{self.entry_price:,.0f}  "
                f"Unrealized P&L: {unrealized:+.2f}%  "
                f"Quantity: {self.quantity:.8f}"
            )
        else:
            position_text = "NO POSITION"

        lang_map = {
            "ko": "Korean", "en": "English", "ja": "Japanese",
            "zh": "Simplified Chinese", "zh-TW": "Traditional Chinese",
            "es": "Spanish", "fr": "French", "de": "German",
            "pt": "Portuguese", "ru": "Russian", "ar": "Arabic",
            "hi": "Hindi", "vi": "Vietnamese", "th": "Thai",
            "id": "Indonesian", "tr": "Turkish",
        }
        language = lang_map.get(self.language, "English")

        prompt = _SYSTEM_PROMPT.format(
            coin=self.coin,
            timeframe=self.timeframe,
            candle_interval=self.candle_interval,
            recent_candles=recent_candles,
            position_text=position_text,
            language=language,
            **ind,
        )

        messages = [
            {"role": "system", "content": prompt},
            {"role": "user", "content": "Analyze the current market and provide a trading signal."},
        ]

        try:
            response = await provider.complete(messages, self.model)
            # Strip markdown fences if present
            text = response.strip()
            if text.startswith("```"):
                text = text.split("\n", 1)[-1]
            if text.endswith("```"):
                text = text.rsplit("```", 1)[0]
            text = text.strip()
            return json.loads(text)
        except (json.JSONDecodeError, Exception) as e:
            logger.warning("LLM response parse error: %s", e)
            return {"action": "HOLD", "confidence": 0, "reasoning": f"Parse error: {e}"}

    # ── Helpers ──

    def _emit(self, event: dict) -> None:
        if self.on_event:
            try:
                self.on_event(event)
            except Exception:
                pass

    def get_status(self) -> dict:
        unrealized_pct = 0.0
        unrealized_krw = 0.0
        if self.in_position and self.current_price > 0:
            entry_total = self.entry_price * self.quantity
            current_total = self.current_price * self.quantity
            fee_est = entry_total * UPBIT_FEE + current_total * UPBIT_FEE
            unrealized_krw = current_total - entry_total - fee_est
            unrealized_pct = (unrealized_krw / entry_total * 100) if entry_total > 0 else 0

        today_trades = storage.get_today_trades()
        today_pnl = sum(t.get("pnl_krw", 0) for t in today_trades)
        today_fees = sum(t.get("fee_krw", 0) for t in today_trades)

        return {
            "running": self.is_running,
            "coin": self.coin,
            "timeframe": self.timeframe,
            "candle_interval": self.candle_interval,
            "amount_krw": self.amount_krw,
            "model": self.model,
            "strategy": self.strategy,
            "current_price": round(self.current_price, 2),
            "in_position": self.in_position,
            "entry_price": round(self.entry_price, 2) if self.in_position else None,
            "unrealized_pct": round(unrealized_pct, 4),
            "unrealized_krw": round(unrealized_krw, 0),
            "today_trades": len(today_trades),
            "today_pnl_krw": round(today_pnl, 0),
            "today_fees_krw": round(today_fees, 0),
            "last_signal": self.last_decision,
        }
