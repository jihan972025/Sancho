"""Shared data maps, detection patterns, and fetch functions for search executors."""

import logging
import re
from typing import Any

import httpx

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Detection patterns
# ---------------------------------------------------------------------------

WEATHER_PATTERN = re.compile(
    r"weather|forecast|temperature|기온|날씨|온도|cold wave|한파",
    re.IGNORECASE,
)

STOCK_PATTERN = re.compile(
    r"stock|share price|주가|주식|시가|종가|market cap",
    re.IGNORECASE,
)

TA_PATTERN = re.compile(
    r"technical analysis|기술적 분석|RSI|MACD|볼린저|bollinger|이동평균|moving average|"
    r"매매\s*신호|buy signal|sell signal|차트\s*분석|chart analysis|지지|저항|support|resistance|"
    r"oscillator|stochastic|ADX|CCI|ichimoku|일목",
    re.IGNORECASE,
)

CURRENCY_PATTERN = re.compile(
    r"exchange rate|환율|currency|통화|convert.*to.*(?:dollar|euro|yen|won|pound|yuan)|"
    r"달러.*(?:환율|얼마)|유로.*(?:환율|얼마)|엔.*(?:환율|얼마)|위안.*(?:환율|얼마)|"
    r"USD|EUR|JPY|GBP|CNY|KRW.*(?:to|환율)|원화",
    re.IGNORECASE,
)

CRYPTO_PATTERN = re.compile(
    r"bitcoin|비트코인|BTC|ethereum|이더리움|ETH|crypto|암호화폐|코인\s*가격|"
    r"ripple|리플|XRP|solana|솔라나|SOL|dogecoin|도지코인|DOGE|"
    r"cryptocurrency|가상화폐|coin.*price|코인.*시세",
    re.IGNORECASE,
)

EARTHQUAKE_PATTERN = re.compile(
    r"earthquake|지진|seism|진도|magnitude.*quake|규모.*지진|최근.*지진|recent.*quake",
    re.IGNORECASE,
)

# Interval detection for TradingView TA
_INTERVAL_WEEKLY = re.compile(r"weekly|주봉|week|주간", re.IGNORECASE)
_INTERVAL_MONTHLY = re.compile(r"monthly|월봉|month|월간", re.IGNORECASE)
_INTERVAL_4H = re.compile(r"4\s*h|4시간", re.IGNORECASE)
_INTERVAL_1H = re.compile(r"1\s*h|1시간|hourly|시간봉", re.IGNORECASE)

# Crypto yfinance ticker → TradingView symbol mapping
_CRYPTO_TV_MAP: dict[str, tuple[str, str]] = {
    # yfinance ticker → (TV symbol, display name)
    "BTC-USD": ("BTCUSDT", "Bitcoin"),
    "ETH-USD": ("ETHUSDT", "Ethereum"),
    "XRP-USD": ("XRPUSDT", "Ripple"),
    "SOL-USD": ("SOLUSDT", "Solana"),
    "DOGE-USD": ("DOGEUSDT", "Dogecoin"),
    "ADA-USD": ("ADAUSDT", "Cardano"),
    "DOT-USD": ("DOTUSDT", "Polkadot"),
    "AVAX-USD": ("AVAXUSDT", "Avalanche"),
    "LINK-USD": ("LINKUSDT", "Chainlink"),
    "MATIC-USD": ("MATICUSDT", "Polygon"),
}

# Crypto name → yfinance ticker for resolve
_CRYPTO_YF_MAP: dict[str, tuple[str, str]] = {
    "비트코인": ("BTC-USD", "Bitcoin"), "bitcoin": ("BTC-USD", "Bitcoin"), "btc": ("BTC-USD", "Bitcoin"),
    "이더리움": ("ETH-USD", "Ethereum"), "ethereum": ("ETH-USD", "Ethereum"), "eth": ("ETH-USD", "Ethereum"),
    "리플": ("XRP-USD", "Ripple"), "ripple": ("XRP-USD", "Ripple"), "xrp": ("XRP-USD", "Ripple"),
    "솔라나": ("SOL-USD", "Solana"), "solana": ("SOL-USD", "Solana"), "sol": ("SOL-USD", "Solana"),
    "도지코인": ("DOGE-USD", "Dogecoin"), "dogecoin": ("DOGE-USD", "Dogecoin"), "doge": ("DOGE-USD", "Dogecoin"),
    "에이다": ("ADA-USD", "Cardano"), "cardano": ("ADA-USD", "Cardano"), "ada": ("ADA-USD", "Cardano"),
}

# ---------------------------------------------------------------------------
# Data maps
# ---------------------------------------------------------------------------

KR_STOCK_MAP: dict[str, tuple[str, str]] = {
    "삼성전자": ("005930.KS", "Samsung Electronics"),
    "samsung electronics": ("005930.KS", "Samsung Electronics"),
    "samsung": ("005930.KS", "Samsung Electronics"),
    "sk하이닉스": ("000660.KS", "SK Hynix"),
    "sk hynix": ("000660.KS", "SK Hynix"),
    "lg에너지솔루션": ("373220.KS", "LG Energy Solution"),
    "현대차": ("005380.KS", "Hyundai Motor"),
    "hyundai": ("005380.KS", "Hyundai Motor"),
    "기아": ("000270.KS", "Kia"),
    "kia": ("000270.KS", "Kia"),
    "네이버": ("035420.KS", "Naver"),
    "naver": ("035420.KS", "Naver"),
    "카카오": ("035720.KS", "Kakao"),
    "kakao": ("035720.KS", "Kakao"),
    "포스코홀딩스": ("005490.KS", "POSCO Holdings"),
    "셀트리온": ("068270.KS", "Celltrion"),
    "lg화학": ("051910.KS", "LG Chem"),
    "삼성바이오로직스": ("207940.KS", "Samsung Biologics"),
    "삼성sdi": ("006400.KS", "Samsung SDI"),
    "현대모비스": ("012330.KS", "Hyundai Mobis"),
    "kb금융": ("105560.KS", "KB Financial"),
    "신한지주": ("055550.KS", "Shinhan Financial"),
    "하나금융지주": ("086790.KS", "Hana Financial"),
    "삼성물산": ("028260.KS", "Samsung C&T"),
    "lg전자": ("066570.KS", "LG Electronics"),
}

GLOBAL_STOCK_MAP: dict[str, tuple[str, str]] = {
    "apple": ("AAPL", "Apple"),
    "애플": ("AAPL", "Apple"),
    "microsoft": ("MSFT", "Microsoft"),
    "마이크로소프트": ("MSFT", "Microsoft"),
    "google": ("GOOGL", "Google"),
    "구글": ("GOOGL", "Google"),
    "alphabet": ("GOOGL", "Alphabet"),
    "amazon": ("AMZN", "Amazon"),
    "아마존": ("AMZN", "Amazon"),
    "tesla": ("TSLA", "Tesla"),
    "테슬라": ("TSLA", "Tesla"),
    "nvidia": ("NVDA", "NVIDIA"),
    "엔비디아": ("NVDA", "NVIDIA"),
    "meta": ("META", "Meta Platforms"),
    "메타": ("META", "Meta Platforms"),
    "netflix": ("NFLX", "Netflix"),
    "넷플릭스": ("NFLX", "Netflix"),
    "tsmc": ("TSM", "TSMC"),
}

TV_EXCHANGE_MAP: dict[str, str] = {
    "AAPL": "NASDAQ", "MSFT": "NASDAQ", "GOOGL": "NASDAQ",
    "AMZN": "NASDAQ", "TSLA": "NASDAQ", "NVDA": "NASDAQ",
    "META": "NASDAQ", "NFLX": "NASDAQ", "TSM": "NYSE",
}

CURRENCY_NAME_MAP: dict[str, str] = {
    "달러": "USD", "dollar": "USD", "미국": "USD", "usd": "USD",
    "유로": "EUR", "euro": "EUR", "eur": "EUR",
    "엔": "JPY", "yen": "JPY", "일본": "JPY", "jpy": "JPY",
    "원": "KRW", "won": "KRW", "한국": "KRW", "krw": "KRW",
    "파운드": "GBP", "pound": "GBP", "영국": "GBP", "gbp": "GBP",
    "위안": "CNY", "yuan": "CNY", "중국": "CNY", "cny": "CNY",
    "스위스프랑": "CHF", "franc": "CHF", "chf": "CHF",
    "캐나다달러": "CAD", "cad": "CAD",
    "호주달러": "AUD", "aud": "AUD",
}

CRYPTO_MAP: dict[str, tuple[str, str]] = {
    "비트코인": ("BTC/USDT", "Bitcoin"),
    "bitcoin": ("BTC/USDT", "Bitcoin"),
    "btc": ("BTC/USDT", "Bitcoin"),
    "이더리움": ("ETH/USDT", "Ethereum"),
    "ethereum": ("ETH/USDT", "Ethereum"),
    "eth": ("ETH/USDT", "Ethereum"),
    "리플": ("XRP/USDT", "Ripple"),
    "ripple": ("XRP/USDT", "Ripple"),
    "xrp": ("XRP/USDT", "Ripple"),
    "솔라나": ("SOL/USDT", "Solana"),
    "solana": ("SOL/USDT", "Solana"),
    "sol": ("SOL/USDT", "Solana"),
    "도지코인": ("DOGE/USDT", "Dogecoin"),
    "dogecoin": ("DOGE/USDT", "Dogecoin"),
    "doge": ("DOGE/USDT", "Dogecoin"),
    "에이다": ("ADA/USDT", "Cardano"),
    "cardano": ("ADA/USDT", "Cardano"),
    "ada": ("ADA/USDT", "Cardano"),
    "폴카닷": ("DOT/USDT", "Polkadot"),
    "polkadot": ("DOT/USDT", "Polkadot"),
    "dot": ("DOT/USDT", "Polkadot"),
    "아발란체": ("AVAX/USDT", "Avalanche"),
    "avalanche": ("AVAX/USDT", "Avalanche"),
    "avax": ("AVAX/USDT", "Avalanche"),
    "체인링크": ("LINK/USDT", "Chainlink"),
    "chainlink": ("LINK/USDT", "Chainlink"),
    "link": ("LINK/USDT", "Chainlink"),
    "매틱": ("MATIC/USDT", "Polygon"),
    "polygon": ("MATIC/USDT", "Polygon"),
    "matic": ("MATIC/USDT", "Polygon"),
}

# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------


_KR_CITY_MAP: dict[str, str] = {
    "서울": "Seoul", "부산": "Busan", "인천": "Incheon", "대구": "Daegu",
    "대전": "Daejeon", "광주": "Gwangju", "울산": "Ulsan", "세종": "Sejong",
    "수원": "Suwon", "성남": "Seongnam", "고양": "Goyang", "용인": "Yongin",
    "창원": "Changwon", "제주": "Jeju", "천안": "Cheonan", "전주": "Jeonju",
    "청주": "Cheongju", "포항": "Pohang", "김해": "Gimhae", "춘천": "Chuncheon",
}


def extract_location(query: str) -> str:
    """Extract city/location name from a weather query."""
    # Check Korean city names first
    for kr, en in _KR_CITY_MAP.items():
        if kr in query:
            return en

    # Remove English weather words
    cleaned = re.sub(
        r"\b(weather|forecast|temperature|this week|today|tomorrow|weekly|daily|"
        r"7.day|current|high|low|celsius|fahrenheit|February|January|March|2026|2025)\b",
        "", query, flags=re.IGNORECASE,
    )
    # Remove Korean weather/time words
    cleaned = re.sub(
        r"날씨|기온|온도|이번주|다음주|오늘|내일|주간|예보|알려줘|알려|어때|어떤가요|"
        r"를|을|의|에|좀|해줘|줘|요|이번|다음",
        "", cleaned,
    ).strip()
    parts = [p.strip() for p in cleaned.split() if len(p.strip()) > 1]
    return " ".join(parts[:3]) if parts else ""


def resolve_ticker(query: str) -> str:
    """Resolve a company name to a stock ticker."""
    lower = query.lower()
    for name, (ticker, _) in KR_STOCK_MAP.items():
        if name in lower:
            return ticker
    for name, (ticker, _) in GLOBAL_STOCK_MAP.items():
        if name in lower:
            return ticker
    return ""


def resolve_crypto_ticker(query: str) -> str:
    """Resolve a crypto name to a yfinance ticker (e.g., BTC-USD)."""
    lower = query.lower()
    for name, (ticker, _) in _CRYPTO_YF_MAP.items():
        if name in lower:
            return ticker
    return ""


def detect_interval(query: str, original: str) -> str:
    """Detect chart interval from query keywords. Returns TradingView interval constant name."""
    combined = f"{query} {original}"
    if _INTERVAL_MONTHLY.search(combined):
        return "monthly"
    if _INTERVAL_WEEKLY.search(combined):
        return "weekly"
    if _INTERVAL_4H.search(combined):
        return "4h"
    if _INTERVAL_1H.search(combined):
        return "1h"
    return "daily"


# ---------------------------------------------------------------------------
# Fetch functions
# ---------------------------------------------------------------------------


async def fetch_weather(location: str) -> str:
    """Fetch weather data from wttr.in (free, no API key needed)."""
    try:
        async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
            resp = await client.get(
                f"https://wttr.in/{location}",
                params={"format": "j1"},
                headers={"Accept-Language": "en", "User-Agent": "curl/8.0"},
            )
            resp.raise_for_status()
            data = resp.json()

        cur = data["current_condition"][0]
        lines = [
            f"**Weather for {location}**\n",
            f"Current: {cur['temp_C']}°C, {cur['weatherDesc'][0]['value']}, "
            f"Humidity {cur['humidity']}%, Wind {cur['windspeedKmph']} km/h\n",
            "**Forecast:**",
        ]
        for day in data.get("weather", []):
            desc = day["hourly"][4]["weatherDesc"][0]["value"] if day.get("hourly") else "N/A"
            lines.append(
                f"  {day['date']}: {day['mintempC']}°C ~ {day['maxtempC']}°C, {desc}"
            )

        logger.info("wttr.in weather fetched for '%s'", location)
        return "\n".join(lines)
    except Exception as e:
        logger.warning("wttr.in fetch failed for '%s': %s", location, e)
        return ""


def fetch_stock(ticker: str) -> str:
    """Fetch stock price data using yfinance."""
    try:
        import yfinance as yf

        t = yf.Ticker(ticker)
        hist = t.history(period="5d")

        if hist.empty:
            return f"No stock data found for ticker: {ticker}"

        info_name = ticker
        all_maps = {**KR_STOCK_MAP, **GLOBAL_STOCK_MAP}
        for _, (tk, name) in all_maps.items():
            if tk == ticker:
                info_name = f"{name} ({ticker})"
                break

        lines = [f"**Stock Price: {info_name}**\n"]
        lines.append(f"{'Date':<12} {'Open':>10} {'High':>10} {'Low':>10} {'Close':>10} {'Volume':>14}")
        lines.append("-" * 72)

        for date, row in hist.iterrows():
            d = date.strftime("%Y-%m-%d")
            lines.append(
                f"{d:<12} {row['Open']:>10,.0f} {row['High']:>10,.0f} "
                f"{row['Low']:>10,.0f} {row['Close']:>10,.0f} {row['Volume']:>14,.0f}"
            )

        latest = hist.iloc[-1]
        if len(hist) >= 2:
            prev = hist.iloc[-2]
            change = latest["Close"] - prev["Close"]
            pct = (change / prev["Close"]) * 100
            sign = "+" if change >= 0 else ""
            lines.append(f"\nLatest: {latest['Close']:,.0f} ({sign}{change:,.0f}, {sign}{pct:.2f}%)")

        logger.info("yfinance data fetched for '%s': %d days", ticker, len(hist))
        return "\n".join(lines)
    except Exception as e:
        logger.warning("yfinance fetch failed for '%s': %s", ticker, e)
        return ""


def fetch_technical_analysis(ticker: str, interval: str = "daily") -> str:
    """Fetch technical analysis data using tradingview-ta."""
    try:
        from tradingview_ta import TA_Handler, Interval

        # Map interval string to TradingView Interval
        interval_map = {
            "1h": Interval.INTERVAL_1_HOUR,
            "4h": Interval.INTERVAL_4_HOURS,
            "daily": Interval.INTERVAL_1_DAY,
            "weekly": Interval.INTERVAL_1_WEEK,
            "monthly": Interval.INTERVAL_1_MONTH,
        }
        tv_interval = interval_map.get(interval, Interval.INTERVAL_1_DAY)
        interval_label = {"1h": "1H", "4h": "4H", "daily": "Daily", "weekly": "Weekly", "monthly": "Monthly"}.get(interval, "Daily")

        # Determine TradingView params based on ticker format
        if ticker in _CRYPTO_TV_MAP:
            # Crypto: yfinance format (BTC-USD) → TradingView (BTCUSDT on BINANCE)
            symbol, _ = _CRYPTO_TV_MAP[ticker]
            screener = "crypto"
            exchange = "BINANCE"
        elif ticker.endswith("-USD") or ticker.endswith("-USDT"):
            # Generic crypto yfinance format
            base = ticker.split("-")[0]
            symbol = f"{base}USDT"
            screener = "crypto"
            exchange = "BINANCE"
        elif ticker.endswith(".KS"):
            symbol = ticker.replace(".KS", "")
            screener = "korea"
            exchange = "KRX"
        else:
            symbol = ticker
            screener = "america"
            exchange = TV_EXCHANGE_MAP.get(ticker, "NASDAQ")

        handler = TA_Handler(
            symbol=symbol, screener=screener, exchange=exchange,
            interval=tv_interval,
        )
        analysis = handler.get_analysis()

        # Friendly name
        info_name = ticker
        if ticker in _CRYPTO_TV_MAP:
            _, info_name = _CRYPTO_TV_MAP[ticker]
            info_name = f"{info_name} ({symbol})"
        else:
            all_maps = {**KR_STOCK_MAP, **GLOBAL_STOCK_MAP}
            for _, (tk, name) in all_maps.items():
                if tk == ticker:
                    info_name = f"{name} ({symbol})"
                    break

        summary = analysis.summary
        osc = analysis.oscillators
        ma = analysis.moving_averages
        ind = analysis.indicators

        lines = [f"**Technical Analysis: {info_name}** ({interval_label})\n"]
        lines.append(
            f"Overall: **{summary['RECOMMENDATION']}** "
            f"(Buy: {summary['BUY']}, Sell: {summary['SELL']}, Neutral: {summary['NEUTRAL']})"
        )
        lines.append(
            f"Oscillators: **{osc['RECOMMENDATION']}** "
            f"(Buy: {osc['BUY']}, Sell: {osc['SELL']}, Neutral: {osc['NEUTRAL']})"
        )
        lines.append(
            f"Moving Averages: **{ma['RECOMMENDATION']}** "
            f"(Buy: {ma['BUY']}, Sell: {ma['SELL']}, Neutral: {ma['NEUTRAL']})"
        )

        lines.append("\nKey Indicators:")
        for label, key in [
            ("RSI(14)", "RSI"), ("MACD", "MACD.macd"), ("MACD Signal", "MACD.signal"),
            ("Stoch %K", "Stoch.K"), ("Stoch %D", "Stoch.D"), ("ADX", "ADX"),
            ("CCI(20)", "CCI20"), ("ATR(14)", "ATR"), ("BB Upper", "BB.upper"), ("BB Lower", "BB.lower"),
        ]:
            val = ind.get(key)
            if val is not None:
                lines.append(f"  {label}: {val:,.2f}")

        lines.append("\nMoving Averages:")
        for label, key in [
            ("EMA(10)", "EMA10"), ("EMA(20)", "EMA20"), ("EMA(50)", "EMA50"), ("EMA(200)", "EMA200"),
            ("SMA(10)", "SMA10"), ("SMA(20)", "SMA20"), ("SMA(50)", "SMA50"), ("SMA(200)", "SMA200"),
        ]:
            val = ind.get(key)
            if val is not None:
                lines.append(f"  {label}: {val:,.2f}")

        logger.info("tradingview-ta fetched for '%s' (%s:%s)", symbol, exchange, screener)
        return "\n".join(lines)
    except Exception as e:
        logger.warning("tradingview-ta fetch failed for '%s': %s", ticker, e)
        return ""


async def fetch_currency(query: str, original: str) -> str:
    """Fetch exchange rates from Frankfurter API (ECB data)."""
    try:
        combined = f"{query} {original}".lower()
        found_currencies: list[str] = []
        for name, code in CURRENCY_NAME_MAP.items():
            if name in combined and code not in found_currencies:
                found_currencies.append(code)

        if len(found_currencies) < 1:
            found_currencies = ["USD", "KRW"]
        base = found_currencies[0]
        targets = found_currencies[1:] if len(found_currencies) > 1 else ["KRW", "USD", "EUR", "JPY", "GBP", "CNY"]
        targets = [t for t in targets if t != base]
        if not targets:
            targets = [t for t in ["KRW", "USD", "EUR", "JPY"] if t != base]

        symbols = ",".join(targets[:8])
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                "https://api.frankfurter.dev/v1/latest",
                params={"base": base, "symbols": symbols},
            )
            resp.raise_for_status()
            data = resp.json()

        lines = [f"**Exchange Rates** (Base: {data['base']}, Date: {data['date']})\n"]
        for currency, rate in data.get("rates", {}).items():
            lines.append(f"  1 {data['base']} = {rate:,.4f} {currency}")

        logger.info("Frankfurter exchange rates fetched: base=%s", base)
        return "\n".join(lines)
    except Exception as e:
        logger.warning("Frankfurter fetch failed: %s", e)
        return ""


def fetch_crypto(query: str, original: str) -> str:
    """Fetch cryptocurrency prices using ccxt (Binance)."""
    try:
        import ccxt

        combined = f"{query} {original}".lower()
        symbols_to_fetch: list[tuple[str, str]] = []
        for name, (symbol, display) in CRYPTO_MAP.items():
            if name in combined and symbol not in [s[0] for s in symbols_to_fetch]:
                symbols_to_fetch.append((symbol, display))

        if not symbols_to_fetch:
            symbols_to_fetch = [
                ("BTC/USDT", "Bitcoin"), ("ETH/USDT", "Ethereum"),
                ("XRP/USDT", "Ripple"), ("SOL/USDT", "Solana"),
                ("DOGE/USDT", "Dogecoin"),
            ]

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
        return ""


async def fetch_earthquake() -> str:
    """Fetch recent significant earthquakes from USGS."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson"
            )
            resp.raise_for_status()
            data = resp.json()

        features = data.get("features", [])[:15]
        if not features:
            return "No significant earthquakes in the past week."

        lines = [f"**Recent Earthquakes (M4.5+, Past 7 Days)** — {len(data.get('features', []))} total\n"]
        lines.append(f"{'Mag':>5} {'Location':<45} {'Time'}")
        lines.append("-" * 75)

        from datetime import datetime, timezone
        for eq in features:
            props = eq["properties"]
            mag = props.get("mag", 0)
            place = props.get("place", "Unknown")[:44]
            ts = props.get("time", 0)
            dt = datetime.fromtimestamp(ts / 1000, tz=timezone.utc)
            lines.append(f"M{mag:>4.1f} {place:<45} {dt.strftime('%Y-%m-%d %H:%M UTC')}")

        logger.info("USGS earthquake data fetched: %d events", len(features))
        return "\n".join(lines)
    except Exception as e:
        logger.warning("USGS earthquake fetch failed: %s", e)
        return ""


async def collect_supplementary_data(query: str, original: str, location: str = "", ticker: str = "") -> list[str]:
    """Run all auto-detection patterns and return supplementary data parts.

    Shared logic used by both DuckDuckGo and Tavily executors.
    """
    parts: list[str] = []

    # Weather
    if WEATHER_PATTERN.search(query) or WEATHER_PATTERN.search(original):
        loc = location or extract_location(query) or extract_location(original) or "Seoul"
        data = await fetch_weather(loc)
        if data:
            parts.append(data)

    # Detect chart interval (daily/weekly/monthly/1h/4h)
    interval = detect_interval(query, original)

    # Stock + TA
    is_stock = STOCK_PATTERN.search(query) or STOCK_PATTERN.search(original) or ticker
    is_ta = TA_PATTERN.search(query) or TA_PATTERN.search(original)
    if is_stock or is_ta:
        resolved = ticker or resolve_ticker(query) or resolve_ticker(original)
        if resolved:
            if is_stock:
                d = fetch_stock(resolved)
                if d:
                    parts.append(d)
            d = fetch_technical_analysis(resolved, interval)
            if d:
                parts.append(d)

    # Crypto
    is_crypto = CRYPTO_PATTERN.search(query) or CRYPTO_PATTERN.search(original)
    if is_crypto:
        d = fetch_crypto(query, original)
        if d:
            parts.append(d)
        # Crypto TA: resolve crypto ticker for TradingView
        crypto_ticker = resolve_crypto_ticker(query) or resolve_crypto_ticker(original)
        if crypto_ticker and not (is_stock and ticker):
            # Only fetch crypto TA if we didn't already fetch stock TA above
            d = fetch_technical_analysis(crypto_ticker, interval)
            if d:
                parts.append(d)

    # Also handle TA-only crypto requests (e.g., "비트코인 기술적 분석")
    if is_ta and not is_stock and not is_crypto:
        crypto_ticker = resolve_crypto_ticker(query) or resolve_crypto_ticker(original)
        if crypto_ticker:
            d = fetch_crypto(query, original)
            if d:
                parts.append(d)
            d = fetch_technical_analysis(crypto_ticker, interval)
            if d:
                parts.append(d)

    # Currency
    if CURRENCY_PATTERN.search(query) or CURRENCY_PATTERN.search(original):
        d = await fetch_currency(query, original)
        if d:
            parts.append(d)

    # Earthquake
    if EARTHQUAKE_PATTERN.search(query) or EARTHQUAKE_PATTERN.search(original):
        d = await fetch_earthquake()
        if d:
            parts.append(d)

    return parts
