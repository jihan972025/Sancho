"""TradingView technical analysis skill executor."""

import logging
from typing import Any

from ..base import SkillExecutor
from ._data_helpers import fetch_technical_analysis, resolve_ticker, resolve_crypto_ticker

logger = logging.getLogger(__name__)


class TradingViewExecutor(SkillExecutor):
    name = "tradingview"

    def __init__(self, config):
        pass

    def is_configured(self) -> bool:
        return True

    async def execute(self, params: dict[str, Any]) -> str:
        ticker = params.get("ticker", "")
        name = params.get("name", "")
        interval = params.get("interval", "daily")

        if not ticker and name:
            ticker = resolve_ticker(name) or resolve_crypto_ticker(name)

        if not ticker:
            return "[SKILL_ERROR] Missing parameter: ticker or name"

        result = fetch_technical_analysis(ticker, interval)
        return result if result else f"[SKILL_ERROR] Could not fetch technical analysis for: {ticker}"
