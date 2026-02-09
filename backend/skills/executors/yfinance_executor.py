"""yfinance skill executor — market indices, stock quotes, and market briefings."""

import logging
from typing import Any

from ..base import SkillExecutor
from ._data_helpers import (
    KR_STOCK_MAP, GLOBAL_STOCK_MAP,
    resolve_ticker, fetch_stock, fetch_technical_analysis, detect_interval,
)

logger = logging.getLogger(__name__)

# Market index tickers
_INDEX_MAP: dict[str, tuple[str, str]] = {
    # Korean
    "kospi": ("^KS11", "KOSPI"),
    "코스피": ("^KS11", "KOSPI"),
    "kosdaq": ("^KQ11", "KOSDAQ"),
    "코스닥": ("^KQ11", "KOSDAQ"),
    # US
    "s&p": ("^GSPC", "S&P 500"),
    "s&p500": ("^GSPC", "S&P 500"),
    "s&p 500": ("^GSPC", "S&P 500"),
    "dow": ("^DJI", "Dow Jones"),
    "dow jones": ("^DJI", "Dow Jones"),
    "다우": ("^DJI", "Dow Jones"),
    "nasdaq": ("^IXIC", "NASDAQ Composite"),
    "나스닥": ("^IXIC", "NASDAQ Composite"),
    # Japan
    "nikkei": ("^N225", "Nikkei 225"),
    "니케이": ("^N225", "Nikkei 225"),
    # China
    "shanghai": ("000001.SS", "Shanghai Composite"),
    "상해": ("000001.SS", "Shanghai Composite"),
    # Europe
    "dax": ("^GDAXI", "DAX"),
    "ftse": ("^FTSE", "FTSE 100"),
}

# Regional presets
_REGION_INDICES: dict[str, list[str]] = {
    "korea": ["^KS11", "^KQ11"],
    "한국": ["^KS11", "^KQ11"],
    "us": ["^GSPC", "^DJI", "^IXIC"],
    "미국": ["^GSPC", "^DJI", "^IXIC"],
    "global": ["^GSPC", "^DJI", "^IXIC", "^KS11", "^N225", "^GDAXI"],
    "글로벌": ["^GSPC", "^DJI", "^IXIC", "^KS11", "^N225", "^GDAXI"],
}

_INDEX_DISPLAY: dict[str, str] = {
    "^KS11": "KOSPI", "^KQ11": "KOSDAQ",
    "^GSPC": "S&P 500", "^DJI": "Dow Jones", "^IXIC": "NASDAQ",
    "^N225": "Nikkei 225", "000001.SS": "Shanghai",
    "^GDAXI": "DAX", "^FTSE": "FTSE 100",
}


class YFinanceExecutor(SkillExecutor):
    name = "yfinance"

    def __init__(self, config):
        self._config = config

    def is_configured(self) -> bool:
        return getattr(self._config.api, "yfinance_enabled", True)

    async def execute(self, params: dict[str, Any]) -> str:
        action = params.get("action", "quote")
        if action == "quote":
            return self._quote(params)
        elif action == "market":
            return self._market(params)
        elif action == "briefing":
            return self._briefing(params)
        else:
            return f"[SKILL_ERROR] Unknown yfinance action: {action}. Use 'quote', 'market', or 'briefing'."

    def _quote(self, params: dict[str, Any]) -> str:
        """Get stock quote for a ticker or company name."""
        ticker = params.get("ticker", "")
        name = params.get("name", "")

        if not ticker and name:
            ticker = resolve_ticker(name)
            if not ticker:
                # Try index map
                lower = name.lower()
                for key, (tk, _) in _INDEX_MAP.items():
                    if key in lower:
                        ticker = tk
                        break

        if not ticker:
            return "[SKILL_ERROR] Missing parameter: ticker or name"

        data = fetch_stock(ticker)
        return data if data else f"No data found for ticker: {ticker}"

    def _market(self, params: dict[str, Any]) -> str:
        """Get market index overview for a region."""
        region = params.get("region", "korea").lower()
        indices = _REGION_INDICES.get(region, _REGION_INDICES["korea"])

        parts = []
        for ticker in indices:
            data = fetch_stock(ticker)
            if data:
                parts.append(data)

        return "\n\n".join(parts) if parts else f"No market data available for region: {region}"

    def _briefing(self, params: dict[str, Any]) -> str:
        """Comprehensive market briefing with indices and major stocks."""
        region = params.get("region", "korea").lower()
        indices = _REGION_INDICES.get(region, _REGION_INDICES["korea"])

        parts = []

        # 1. Index data
        for ticker in indices:
            data = fetch_stock(ticker)
            if data:
                parts.append(data)

        # 2. Major stocks for the region
        if region in ("korea", "한국"):
            top_stocks = [
                "005930.KS",  # Samsung Electronics
                "000660.KS",  # SK Hynix
                "005380.KS",  # Hyundai Motor
                "035420.KS",  # Naver
                "035720.KS",  # Kakao
            ]
        elif region in ("us", "미국"):
            top_stocks = ["AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "TSLA"]
        else:
            top_stocks = []

        for ticker in top_stocks:
            data = fetch_stock(ticker)
            if data:
                parts.append(data)

        return "\n\n".join(parts) if parts else f"No briefing data available for region: {region}"
