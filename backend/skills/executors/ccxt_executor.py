"""ccxt cryptocurrency price skill executor."""

import logging
from typing import Any

from ..base import SkillExecutor
from ._data_helpers import CRYPTO_MAP

logger = logging.getLogger(__name__)

_DEFAULT_SYMBOLS = [
    ("BTC/USDT", "Bitcoin"),
    ("ETH/USDT", "Ethereum"),
    ("XRP/USDT", "Ripple"),
    ("SOL/USDT", "Solana"),
    ("DOGE/USDT", "Dogecoin"),
]


class CcxtExecutor(SkillExecutor):
    name = "ccxt"

    def __init__(self, config):
        pass

    def is_configured(self) -> bool:
        return True

    async def execute(self, params: dict[str, Any]) -> str:
        symbols_param = params.get("symbols", "")
        try:
            import ccxt

            symbols_to_fetch: list[tuple[str, str]] = []

            if symbols_param:
                for s in symbols_param.split(","):
                    s = s.strip().upper()
                    if "/" not in s:
                        s = f"{s}/USDT"
                    symbols_to_fetch.append((s, s.split("/")[0]))
            else:
                name = params.get("name", "")
                if name:
                    lower = name.lower()
                    for key, (symbol, display) in CRYPTO_MAP.items():
                        if key in lower and symbol not in [x[0] for x in symbols_to_fetch]:
                            symbols_to_fetch.append((symbol, display))

            if not symbols_to_fetch:
                symbols_to_fetch = _DEFAULT_SYMBOLS

            exchange = ccxt.binance({"enableRateLimit": True})
            lines = ["**Cryptocurrency Prices** (Binance)\n"]
            lines.append(f"{'Coin':<12} {'Price (USDT)':>14} {'24h Change':>12} {'24h Volume':>16}")
            lines.append("-" * 58)

            for symbol, display in symbols_to_fetch[:10]:
                try:
                    ticker = exchange.fetch_ticker(symbol)
                    price = ticker.get("last", 0)
                    change_pct = ticker.get("percentage", 0) or 0
                    volume = ticker.get("baseVolume", 0) or 0
                    sign = "+" if change_pct >= 0 else ""
                    lines.append(
                        f"{display:<12} ${price:>13,.2f} {sign}{change_pct:>10.2f}% {volume:>14,.0f}"
                    )
                except Exception:
                    lines.append(f"{display:<12} {'N/A':>14}")

            logger.info("ccxt crypto data fetched: %d symbols", len(symbols_to_fetch))
            return "\n".join(lines)
        except Exception as e:
            logger.warning("ccxt fetch failed: %s", e)
            return f"[SKILL_ERROR] Crypto price fetch failed: {str(e)}"
