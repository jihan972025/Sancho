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

TIMEFRAME_SECONDS = {
    "5m": 5 * 60,
    "10m": 10 * 60,
    "15m": 15 * 60,
    "30m": 30 * 60,
    "1h": 60 * 60,
    "4h": 4 * 60 * 60,
}

# ── Higher timeframe mapping for trend filter (improvement #1) ──
HIGHER_TF_MAP = {
    "5m": "1h",
    "10m": "1h",
    "15m": "4h",
    "30m": "4h",
    "1h": "1d",
    "4h": "1d",
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

## Trend Summary
{trend_summary}

## Higher Timeframe Context
{higher_tf_text}

## Technical Indicators ({candle_interval})
- RSI(14): {rsi}
- MACD: {macd} | Signal: {macd_signal} | Histogram: {macd_histogram}
- Bollinger Bands: Upper=₩{bb_upper:,.0f}  Mid=₩{bb_middle:,.0f}  Lower=₩{bb_lower:,.0f}  Position={bb_position}
- SMA(20): ₩{sma_20:,.0f}  SMA(50): ₩{sma_50:,.0f}
- EMA(12): ₩{ema_12:,.0f}  EMA(26): ₩{ema_26:,.0f}
- Volume: {volume:,.2f}  (20-avg: {volume_avg_20:,.2f})
- ATR(14): ₩{atr:,.0f}
- ATR-based Stop-Loss: ₩{atr_stop_loss:,.0f} ({atr_stop_loss_pct:+.2f}%)
- ATR-based Take-Profit: ₩{atr_take_profit:,.0f} ({atr_take_profit_pct:+.2f}%)
- Last candle change: {price_change_pct}%

## Recent Candles
{recent_candles}

## Position
{position_text}

## Recent Trade History
{recent_trades_text}

## Rules
1. Require confluence of 3+ indicators before BUY/SELL.
2. HOLD if uncertain – no trade is better than a losing trade.
3. Factor in 0.05 % fee per side.
4. Use ATR-based dynamic stop-loss/take-profit levels. Prefer stop_loss_pct and take_profit_pct derived from ATR rather than fixed values.
5. Avoid overtrading.
6. Volume confirmation: prefer BUY/SELL signals backed by above-average volume; be cautious when volume is below the 20-period average.
7. EMA crossover: EMA(12) > EMA(26) = bullish trend, EMA(12) < EMA(26) = bearish trend. Use as trend filter before entering trades.
8. CRITICAL: Do NOT enter BUY against the higher timeframe trend. If the higher TF trend is BEARISH, only HOLD or SELL.
9. If recent trades show consecutive losses (3+), be extra conservative — raise confidence threshold mentally and prefer HOLD.
10. If in position: recommend SELL on ATR stop-loss breach or reversal signal.

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

        # Higher TF trend cache (improvement #1)
        self._higher_tf_trend: str = "NEUTRAL"
        self._higher_tf_ind: dict = {}
        self._higher_tf_label: str = ""

        # Recent trade history for feedback (improvement #4)
        self._recent_trades: list[dict] = []
        self._consecutive_losses: int = 0

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

        # Load recent trade history for feedback (improvement #4)
        self._load_recent_trades()

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

                # 2. Indicators (ensure no None values)
                ind = indicators.calculate_all(candles)
                ind = {k: (v if v is not None else 0) for k, v in ind.items()}
                self.current_price = ind["current_price"]
                recent_text = indicators.format_recent_candles(candles, 10)

                # 2.5. Higher timeframe trend filter (improvement #1)
                higher_tf = HIGHER_TF_MAP.get(ccxt_tf)
                if higher_tf:
                    try:
                        htf_candles = await loop.run_in_executor(
                            None, self._fetch_candles, higher_tf
                        )
                        if htf_candles and len(htf_candles) >= 30:
                            htf_ind = indicators.calculate_all(htf_candles)
                            self._higher_tf_ind = {k: (v if v is not None else 0) for k, v in htf_ind.items()}
                            self._higher_tf_label = higher_tf
                            self._higher_tf_trend = self._determine_trend(self._higher_tf_ind)
                    except Exception as e:
                        logger.warning("Higher TF fetch failed: %s", e)

                # 3. ATR-based dynamic stop-loss / take-profit (improvement #2)
                atr_val = ind.get("atr", 0)
                entry = self.entry_price or self.current_price  # guard against None
                if self.in_position and atr_val > 0 and entry > 0:
                    atr_stop = entry - 1.5 * atr_val
                    atr_stop_pct = (atr_stop - entry) / entry * 100
                    unrealized_pct = (self.current_price - entry) / entry * 100

                    if self.current_price <= atr_stop:
                        self._emit({"type": "progress", "content": f"ATR stop-loss triggered: ₩{self.current_price:,.0f} <= ₩{atr_stop:,.0f} ({unrealized_pct:+.2f}%)"})
                        await self._execute_sell(f"ATR stop-loss at ₩{atr_stop:,.0f} ({atr_stop_pct:+.2f}%)", loop)
                        await asyncio.sleep(interval)
                        continue

                    # Hard stop at -2% as absolute safety net
                    if unrealized_pct <= -2.0:
                        self._emit({"type": "progress", "content": f"Hard stop-loss triggered ({unrealized_pct:+.2f}%)"})
                        await self._execute_sell("Hard stop-loss at -2%", loop)
                        await asyncio.sleep(interval)
                        continue
                elif self.in_position and entry > 0:
                    # Fallback: fixed stop if ATR unavailable
                    unrealized_pct = (self.current_price - entry) / entry * 100
                    if unrealized_pct <= -2.0:
                        self._emit({"type": "progress", "content": f"Stop-loss triggered ({unrealized_pct:+.2f}%)"})
                        await self._execute_sell("Stop-loss at -2%", loop)
                        await asyncio.sleep(interval)
                        continue

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

                # Raise confidence threshold after consecutive losses (improvement #4)
                if self._consecutive_losses >= 3:
                    min_conf = min(min_conf + 0.15, 0.95)

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
        symbol = f"{self.coin}/KRW"
        return exchange.fetch_ohlcv(symbol, tf, limit=150)

    async def _execute_buy(self, reasoning: str, loop: asyncio.AbstractEventLoop) -> None:
        try:
            self._emit({"type": "progress", "content": f"Executing BUY {self.coin}..."})
            exchange = self._get_exchange()
            symbol = f"{self.coin}/KRW"

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

            filled_price = order.get("average") or order.get("price") or price
            filled_qty = order.get("filled") or cost / (filled_price or price)

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
            symbol = f"{self.coin}/KRW"

            order = await loop.run_in_executor(
                None, lambda: exchange.create_market_sell_order(symbol, self.quantity)
            )

            filled_price = order.get("average") or order.get("price") or self.current_price
            exit_time = datetime.now(timezone.utc).isoformat()

            # P&L calculation
            entry_total = (self.entry_price or self.current_price) * self.quantity
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
                "entry_price": round(self.entry_price or 0, 2),
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

            # Update recent trade history for feedback (improvement #4)
            self._recent_trades.insert(0, trade_record)
            self._recent_trades = self._recent_trades[:10]  # keep last 10
            if pnl_pct < 0:
                self._consecutive_losses += 1
            else:
                self._consecutive_losses = 0

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
        atr_val = ind.get("atr", 0)

        # ATR-based dynamic stop/take-profit (improvement #2)
        if atr_val > 0 and price > 0:
            sl_pct = round(-1.5 * atr_val / price * 100, 2)
            tp_pct = round(2.0 * atr_val / price * 100, 2)
        else:
            sl_pct = -2.0
            tp_pct = 1.5

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
                    "stop_loss_pct": sl_pct,
                    "take_profit_pct": tp_pct,
                }
        else:
            # Improvement #5: Block BUY against higher TF trend
            if self._higher_tf_trend == "BEARISH":
                return {
                    "action": "HOLD",
                    "confidence": 0,
                    "reasoning": f"Rule: higher TF ({self._higher_tf_label}) trend is BEARISH — no BUY",
                    "expected_move_pct": 0,
                    "stop_loss_pct": sl_pct,
                    "take_profit_pct": tp_pct,
                }

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
            # Improvement #5: EMA trend alignment is REQUIRED for BUY
            if ema12 > ema26:
                buy_signals.append("EMA12>EMA26(trend✓)")
            else:
                # Trend not aligned — cannot buy
                return {
                    "action": "HOLD",
                    "confidence": 0,
                    "reasoning": "Rule: EMA12<EMA26 — trend not aligned for BUY",
                    "expected_move_pct": 0,
                    "stop_loss_pct": sl_pct,
                    "take_profit_pct": tp_pct,
                }
            if vol_avg > 0 and vol > vol_avg:
                buy_signals.append("Vol>Avg")

            # Higher TF bullish adds extra confidence
            if self._higher_tf_trend == "BULLISH":
                buy_signals.append(f"HTF({self._higher_tf_label})↑")

            if len(buy_signals) >= 3:
                conf = len(buy_signals) / 7  # max 7 signals now
                return {
                    "action": "BUY",
                    "confidence": round(conf, 2),
                    "reasoning": "Rule: " + ", ".join(buy_signals),
                    "expected_move_pct": round(tp_pct * 0.6, 2),
                    "stop_loss_pct": sl_pct,
                    "take_profit_pct": tp_pct,
                }

        return {
            "action": "HOLD",
            "confidence": 0,
            "reasoning": "Rule: insufficient signals",
            "expected_move_pct": 0,
            "stop_loss_pct": sl_pct,
            "take_profit_pct": tp_pct,
        }

    # ── LLM strategy ──

    async def _ask_llm(self, ind: dict, recent_candles: str) -> dict:
        provider = get_provider_for_model(self.model)
        if not provider:
            return {"action": "HOLD", "confidence": 0, "reasoning": "Model unavailable"}

        if self.in_position:
            entry = self.entry_price or ind["current_price"]
            unrealized = (ind["current_price"] - entry) / entry * 100 if entry else 0
            position_text = (
                f"IN POSITION — Entry: ₩{entry:,.0f}  "
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

        # Improvement #3: Trend summary line
        trend_summary = self._build_trend_summary(ind)

        # Improvement #1: Higher TF context
        higher_tf_text = self._build_higher_tf_text()

        # Improvement #2: ATR-based dynamic stop/take-profit
        price = ind.get("current_price", 0)
        atr_val = ind.get("atr", 0)
        if atr_val > 0 and price > 0:
            atr_stop_loss = price - 1.5 * atr_val
            atr_stop_loss_pct = -1.5 * atr_val / price * 100
            atr_take_profit = price + 2.0 * atr_val
            atr_take_profit_pct = 2.0 * atr_val / price * 100
        else:
            atr_stop_loss = price * 0.98
            atr_stop_loss_pct = -2.0
            atr_take_profit = price * 1.015
            atr_take_profit_pct = 1.5

        # Improvement #4: Recent trade history
        recent_trades_text = self._build_recent_trades_text()

        # Ensure all indicator values are numeric (never None) for prompt formatting
        safe_ind = {k: (v if v is not None else 0) for k, v in ind.items()}

        prompt = _SYSTEM_PROMPT.format(
            coin=self.coin,
            timeframe=self.timeframe,
            candle_interval=self.candle_interval,
            recent_candles=recent_candles,
            position_text=position_text,
            language=language,
            trend_summary=trend_summary,
            higher_tf_text=higher_tf_text,
            atr_stop_loss=atr_stop_loss,
            atr_stop_loss_pct=atr_stop_loss_pct,
            atr_take_profit=atr_take_profit,
            atr_take_profit_pct=atr_take_profit_pct,
            recent_trades_text=recent_trades_text,
            **safe_ind,
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

    # ── Trend & feedback helpers ──

    @staticmethod
    def _determine_trend(ind: dict) -> str:
        """Determine trend direction from indicators: BULLISH / BEARISH / NEUTRAL."""
        bullish = 0
        bearish = 0

        ema12 = ind.get("ema_12", 0)
        ema26 = ind.get("ema_26", 0)
        if ema12 and ema26:
            if ema12 > ema26:
                bullish += 1
            else:
                bearish += 1

        price = ind.get("current_price", 0)
        sma50 = ind.get("sma_50", 0)
        if price and sma50:
            if price > sma50:
                bullish += 1
            else:
                bearish += 1

        macd_hist = ind.get("macd_histogram", 0)
        if macd_hist > 0:
            bullish += 1
        elif macd_hist < 0:
            bearish += 1

        if bullish >= 2:
            return "BULLISH"
        elif bearish >= 2:
            return "BEARISH"
        return "NEUTRAL"

    def _build_trend_summary(self, ind: dict) -> str:
        """Build a 1-line trend summary for LLM context (improvement #3)."""
        trend = self._determine_trend(ind)
        ema12 = ind.get("ema_12", 0)
        ema26 = ind.get("ema_26", 0)
        price = ind.get("current_price", 0)
        sma50 = ind.get("sma_50", 0)

        parts = [f"Current Trend: {trend}"]
        if ema12 and ema26:
            diff_pct = (ema12 - ema26) / ema26 * 100 if ema26 else 0
            parts.append(f"EMA12{'>' if ema12 > ema26 else '<'}EMA26 ({diff_pct:+.2f}%)")
        if price and sma50:
            dist_pct = (price - sma50) / sma50 * 100 if sma50 else 0
            parts.append(f"Price{'>' if price > sma50 else '<'}SMA50 ({dist_pct:+.2f}%)")

        return " | ".join(parts)

    def _build_higher_tf_text(self) -> str:
        """Build higher timeframe context text (improvement #1)."""
        if not self._higher_tf_ind or not self._higher_tf_label:
            return "Not available"

        h = self._higher_tf_ind
        return (
            f"Timeframe: {self._higher_tf_label} | Trend: {self._higher_tf_trend}\n"
            f"  EMA(12): ₩{h.get('ema_12', 0):,.0f}  EMA(26): ₩{h.get('ema_26', 0):,.0f}\n"
            f"  SMA(50): ₩{h.get('sma_50', 0):,.0f}  RSI: {h.get('rsi', 0):.1f}\n"
            f"  MACD Hist: {h.get('macd_histogram', 0):.4f}"
        )

    def _build_recent_trades_text(self) -> str:
        """Build recent trades summary for LLM context (improvement #4)."""
        if not self._recent_trades:
            return "No recent trades"

        lines = []
        wins = sum(1 for t in self._recent_trades if t.get("pnl_pct", 0) >= 0)
        losses = len(self._recent_trades) - wins
        total_pnl = sum(t.get("pnl_pct", 0) for t in self._recent_trades)
        lines.append(f"Last {len(self._recent_trades)} trades: {wins}W/{losses}L | Total PnL: {total_pnl:+.2f}%")

        if self._consecutive_losses >= 2:
            lines.append(f"⚠ {self._consecutive_losses} consecutive losses — BE CONSERVATIVE")

        # Show last 3 trades detail
        for t in self._recent_trades[:3]:
            pnl = t.get("pnl_pct", 0)
            entry = t.get("entry_price", 0)
            exit_p = t.get("exit_price", 0)
            lines.append(f"  {'✓' if pnl >= 0 else '✗'} ₩{entry:,.0f}→₩{exit_p:,.0f} ({pnl:+.2f}%)")

        return "\n".join(lines)

    def _load_recent_trades(self) -> None:
        """Load recent trade history from storage on startup (improvement #4)."""
        try:
            trades = storage.get_trades(limit=10)
            # Filter to same coin
            self._recent_trades = [t for t in trades if t.get("coin") == self.coin][:10]
            # Count consecutive losses from most recent
            self._consecutive_losses = 0
            for t in self._recent_trades:
                if t.get("pnl_pct", 0) < 0:
                    self._consecutive_losses += 1
                else:
                    break
        except Exception:
            self._recent_trades = []
            self._consecutive_losses = 0

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
            entry_total = (self.entry_price or self.current_price) * self.quantity
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
            "entry_price": round(self.entry_price or 0, 2) if self.in_position else None,
            "unrealized_pct": round(unrealized_pct, 4),
            "unrealized_krw": round(unrealized_krw, 0),
            "today_trades": len(today_trades),
            "today_pnl_krw": round(today_pnl, 0),
            "today_fees_krw": round(today_fees, 0),
            "last_signal": self.last_decision,
        }
