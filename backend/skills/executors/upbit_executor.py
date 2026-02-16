"""Upbit exchange trading skill executor.

Supports: buy, sell, balance, price actions on Upbit KRW market.
"""

import asyncio
import logging
from typing import Any

from ..base import SkillExecutor

logger = logging.getLogger(__name__)

UPBIT_FEE = 0.0005  # 0.05 %


class UpbitExecutor(SkillExecutor):
    name = "upbit"

    def __init__(self, config):
        self._config = config

    def is_configured(self) -> bool:
        return bool(
            getattr(self._config.api, "upbit_access_key", "")
            and getattr(self._config.api, "upbit_secret_key", "")
        )

    def _get_exchange(self):
        import ccxt

        return ccxt.upbit({
            "enableRateLimit": True,
            "apiKey": self._config.api.upbit_access_key,
            "secret": self._config.api.upbit_secret_key,
            "options": {
                "createMarketBuyOrderRequiresPrice": False,
            },
        })

    async def execute(self, params: dict[str, Any]) -> str:
        action = params.get("action", "balance")

        try:
            if action == "buy":
                return await self._buy(params)
            elif action == "sell":
                return await self._sell(params)
            elif action == "balance":
                return await self._balance(params)
            elif action == "price":
                return await self._price(params)
            else:
                return f"[SKILL_ERROR] Unknown action: {action}. Use buy, sell, balance, or price."
        except Exception as e:
            logger.error("Upbit skill failed (action=%s): %s", action, e)
            return f"[SKILL_ERROR] Upbit {action} failed: {str(e)}"

    # ── Buy ──

    async def _buy(self, params: dict[str, Any]) -> str:
        coin = params.get("coin", "").upper()
        amount_krw = float(params.get("amount_krw", 0))

        if not coin:
            return "[SKILL_ERROR] 'coin' parameter is required for buy. (e.g., BTC, ADA, ETH)"
        if amount_krw < 5000:
            return "[SKILL_ERROR] Minimum buy amount is 5,000 KRW."

        exchange = self._get_exchange()
        symbol = f"{coin}/KRW"
        loop = asyncio.get_event_loop()

        # Get current price for reference
        ticker = await loop.run_in_executor(None, exchange.fetch_ticker, symbol)
        price_before = ticker.get("last", 0)

        # Execute market buy (amount = KRW cost)
        order = await loop.run_in_executor(
            None, lambda: exchange.create_market_buy_order(symbol, amount_krw)
        )

        filled_price = order.get("average") or price_before
        filled_qty = order.get("filled") or (amount_krw / price_before if price_before else 0)
        cost = order.get("cost") or amount_krw
        fee_krw = (cost or 0) * UPBIT_FEE

        lines = [
            f"**Upbit BUY Order Executed**\n",
            f"- Coin: **{coin}**",
            f"- Filled Price: **{filled_price:,.0f} KRW**",
            f"- Quantity: **{filled_qty:,.8f} {coin}**",
            f"- Total Cost: **{cost:,.0f} KRW**",
            f"- Fee (0.05%): **{fee_krw:,.0f} KRW**",
            f"- Order ID: {order.get('id', 'N/A')}",
        ]
        logger.info("Upbit BUY: %s qty=%s price=%s cost=%s", coin, filled_qty, filled_price, cost)
        return "\n".join(lines)

    # ── Sell ──

    async def _sell(self, params: dict[str, Any]) -> str:
        coin = params.get("coin", "").upper()
        ratio = float(params.get("ratio", 100))
        quantity = params.get("quantity")

        if not coin:
            return "[SKILL_ERROR] 'coin' parameter is required for sell. (e.g., BTC, ADA, ETH)"

        exchange = self._get_exchange()
        symbol = f"{coin}/KRW"
        loop = asyncio.get_event_loop()

        if quantity is None:
            # Determine quantity from balance
            balance = await loop.run_in_executor(None, exchange.fetch_balance)
            coin_balance = float(balance.get(coin, {}).get("free", 0)) if isinstance(balance.get(coin), dict) else 0
            if coin_balance <= 0:
                return f"[SKILL_ERROR] No {coin} balance available to sell."
            sell_qty = coin_balance * (min(ratio, 100) / 100)
        else:
            sell_qty = float(quantity)

        if sell_qty <= 0:
            return f"[SKILL_ERROR] Sell quantity is 0. Nothing to sell."

        # Get current price for reference
        ticker = await loop.run_in_executor(None, exchange.fetch_ticker, symbol)
        price_before = ticker.get("last", 0)

        # Execute market sell
        order = await loop.run_in_executor(
            None, lambda: exchange.create_market_sell_order(symbol, sell_qty)
        )

        filled_price = order.get("average") or price_before
        filled_qty = order.get("filled") or sell_qty
        proceeds = (filled_price or 0) * (filled_qty or 0)
        fee_krw = proceeds * UPBIT_FEE

        lines = [
            f"**Upbit SELL Order Executed**\n",
            f"- Coin: **{coin}**",
            f"- Filled Price: **{filled_price:,.0f} KRW**",
            f"- Quantity Sold: **{filled_qty:,.8f} {coin}**",
            f"- Proceeds: **{proceeds:,.0f} KRW**",
            f"- Fee (0.05%): **{fee_krw:,.0f} KRW**",
            f"- Order ID: {order.get('id', 'N/A')}",
        ]
        logger.info("Upbit SELL: %s qty=%s price=%s proceeds=%s", coin, filled_qty, filled_price, proceeds)
        return "\n".join(lines)

    # ── Balance ──

    async def _balance(self, params: dict[str, Any]) -> str:
        exchange = self._get_exchange()
        loop = asyncio.get_event_loop()

        balance = await loop.run_in_executor(None, exchange.fetch_balance)

        krw_free = float(balance.get("KRW", {}).get("free", 0))
        krw_used = float(balance.get("KRW", {}).get("used", 0))

        lines = [
            "**Upbit Account Balance**\n",
            f"KRW Available: **{krw_free:,.0f} KRW**",
        ]
        if krw_used > 0:
            lines.append(f"KRW In Use: {krw_used:,.0f} KRW")

        # Collect coin holdings
        holdings = []
        for currency, info in balance.items():
            if currency in ("KRW", "info", "free", "used", "total", "debt", "timestamp", "datetime"):
                continue
            if not isinstance(info, dict):
                continue
            total_amt = float(info.get("total", 0))
            if total_amt <= 0:
                continue

            # Get current price
            symbol = f"{currency}/KRW"
            try:
                ticker = await loop.run_in_executor(None, exchange.fetch_ticker, symbol)
                cur_price = ticker.get("last", 0)
            except Exception:
                cur_price = 0

            # Get avg buy price from Upbit info
            avg_price = 0
            try:
                resp_info = balance.get("info", [])
                if isinstance(resp_info, list):
                    for item in resp_info:
                        if item.get("currency") == currency:
                            avg_price = float(item.get("avg_buy_price", 0))
                            break
            except Exception:
                pass

            eval_krw = total_amt * cur_price if cur_price else 0
            pnl_pct = ((cur_price - avg_price) / avg_price * 100) if avg_price > 0 else 0
            holdings.append((currency, total_amt, avg_price, cur_price, eval_krw, pnl_pct))

        if holdings:
            holdings.sort(key=lambda h: h[4], reverse=True)
            lines.append(f"\n{'Coin':<8} {'Qty':>14} {'Avg Price':>14} {'Cur Price':>14} {'Eval (KRW)':>14} {'P&L':>8}")
            lines.append("-" * 76)
            total_eval = krw_free
            for cur, qty, avg_p, cur_p, ev, pnl in holdings:
                sign = "+" if pnl >= 0 else ""
                lines.append(
                    f"{cur:<8} {qty:>14.8f} {avg_p:>13,.0f} {cur_p:>13,.0f} {ev:>13,.0f} {sign}{pnl:>6.2f}%"
                )
                total_eval += ev
            lines.append("-" * 76)
            lines.append(f"**Total Evaluation: {total_eval:,.0f} KRW**")
        else:
            lines.append("\nNo coin holdings.")

        logger.info("Upbit balance fetched: KRW=%s, %d coins", krw_free, len(holdings))
        return "\n".join(lines)

    # ── Price ──

    async def _price(self, params: dict[str, Any]) -> str:
        coin = params.get("coin", "").upper()
        if not coin:
            return "[SKILL_ERROR] 'coin' parameter is required for price."

        exchange = self._get_exchange()
        symbol = f"{coin}/KRW"
        loop = asyncio.get_event_loop()

        ticker = await loop.run_in_executor(None, exchange.fetch_ticker, symbol)
        price = ticker.get("last", 0)
        high = ticker.get("high", 0)
        low = ticker.get("low", 0)
        change_pct = ticker.get("percentage", 0) or 0
        volume = ticker.get("baseVolume", 0) or 0
        quote_volume = ticker.get("quoteVolume", 0) or 0

        sign = "+" if change_pct >= 0 else ""
        lines = [
            f"**{coin}/KRW — Upbit**\n",
            f"- Current Price: **{price:,.0f} KRW**",
            f"- 24h Change: **{sign}{change_pct:.2f}%**",
            f"- 24h High: {high:,.0f} KRW",
            f"- 24h Low: {low:,.0f} KRW",
            f"- 24h Volume: {volume:,.2f} {coin}",
            f"- 24h Turnover: {quote_volume:,.0f} KRW",
        ]
        logger.info("Upbit price: %s = %s KRW (%s%s%%)", coin, price, sign, change_pct)
        return "\n".join(lines)
