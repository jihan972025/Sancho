import asyncio
import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from ..config import get_config
from ..i18n import LANG_NAMES
from ..llm.registry import get_provider_for_model

# Assistant prefill: start the response in the target language so the model continues in it.
_LANG_PREFILL = {
    "ko": "# {coin_name}({coin}) 기술적 분석 보고서\n\n## 개요\n\n",
    "ja": "# {coin_name}({coin}) テクニカル分析レポート\n\n## 概要\n\n",
    "zh": "# {coin_name}({coin}) 技术分析报告\n\n## 概述\n\n",
    "zh-TW": "# {coin_name}({coin}) 技術分析報告\n\n## 概述\n\n",
    "es": "# {coin_name}({coin}) Informe de Análisis Técnico\n\n## Resumen\n\n",
    "fr": "# {coin_name}({coin}) Rapport d'Analyse Technique\n\n## Résumé\n\n",
    "de": "# {coin_name}({coin}) Technische Analyse Bericht\n\n## Überblick\n\n",
    "pt": "# {coin_name}({coin}) Relatório de Análise Técnica\n\n## Resumo\n\n",
    "ru": "# {coin_name}({coin}) Отчёт технического анализа\n\n## Обзор\n\n",
    "ar": "# {coin_name}({coin}) تقرير التحليل الفني\n\n## نظرة عامة\n\n",
    "hi": "# {coin_name}({coin}) तकनीकी विश्लेषण रिपोर्ट\n\n## सारांश\n\n",
    "vi": "# {coin_name}({coin}) Báo cáo Phân tích Kỹ thuật\n\n## Tổng quan\n\n",
    "th": "# {coin_name}({coin}) รายงานการวิเคราะห์ทางเทคนิค\n\n## ภาพรวม\n\n",
    "id": "# {coin_name}({coin}) Laporan Analisis Teknikal\n\n## Ringkasan\n\n",
    "tr": "# {coin_name}({coin}) Teknik Analiz Raporu\n\n## Genel Bakış\n\n",
}

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/crypto", tags=["crypto"])

COIN_SYMBOLS_USDT = {
    "BTC": "BTC/USDT",
    "ETH": "ETH/USDT",
    "XRP": "XRP/USDT",
    "SOL": "SOL/USDT",
    "TRX": "TRX/USDT",
    "ADA": "ADA/USDT",
    "XMR": "XMR/USDT",
}

COIN_SYMBOLS_KRW = {
    "BTC": "BTC/KRW",
    "ETH": "ETH/KRW",
    "XRP": "XRP/KRW",
    "SOL": "SOL/KRW",
    "TRX": "TRX/KRW",
    "ADA": "ADA/KRW",
    "XMR": "XMR/KRW",
}

COIN_TV_MAP = {
    "BTC": ("BTCUSDT", "Bitcoin"),
    "ETH": ("ETHUSDT", "Ethereum"),
    "XRP": ("XRPUSDT", "Ripple"),
    "SOL": ("SOLUSDT", "Solana"),
    "TRX": ("TRXUSDT", "TRON"),
    "ADA": ("ADAUSDT", "Cardano"),
    "XMR": ("XMRUSDT", "Monero"),
}

STRATEGY_DESCRIPTIONS = {
    "trend": (
        "추세(Trend) 분석: 이동평균선(MA) 정배열/역배열, 골든크로스/데드크로스, "
        "단기(5일,20일)/중기(60일)/장기(120일,200일) 이동평균선 배열 상태 분석"
    ),
    "support_resistance": (
        "지지선과 저항선: 과거 반복 반등/하락 가격대, 돌파 시 거래량 동반 여부, "
        "지지→저항 전환, 저항→지지 전환, 가짜 돌파(Fakeout) 판별"
    ),
    "candlestick": (
        "캔들스틱 패턴: 망치형(Hammer), 교수형(Hanging Man), 도지(Doji), "
        "장악형(Engulfing), 쓰리 화이트 솔저, 쓰리 블랙 크로우 등 반전/지속 패턴"
    ),
    "indicators": (
        "보조 지표: RSI(과매수70/과매도30), MACD(시그널선 교차), "
        "볼린저 밴드(상하단 터치, 스퀴즈), 거래량(가격-거래량 괴리)"
    ),
    "chart_patterns": (
        "차트 패턴: 헤드앤숄더, 이중바닥/이중천장, 원형바닥, "
        "삼각수렴, 깃발형(Flag), 컵앤핸들 등 반전/지속 패턴"
    ),
    "divergence": (
        "다이버전스(Divergence): 가격과 RSI/MACD 방향 불일치, "
        "강세/약세 다이버전스로 추세 전환 선행 신호 판별"
    ),
    "multi_timeframe": (
        "멀티 타임프레임 분석: 주봉(큰 추세) → 일봉(매매 구간) → "
        "60분/15분봉(진입 타이밍), 상위 시간대 추세 방향 일치 매매"
    ),
}


class CryptoAnalyzeRequest(BaseModel):
    coin: str
    strategies: list[str]
    timeframes: list[str] = ["1h", "4h", "1d", "1w", "1M"]
    model: str


def _fetch_current_price(coin: str) -> dict:
    """Fetch current ticker price from Binance and optionally Upbit. Returns dict for UI display."""
    result: dict = {"coin": coin, "binance": {}, "upbit": {}}
    try:
        import ccxt
        exchange = ccxt.binance({"enableRateLimit": True})
        symbol = COIN_SYMBOLS_USDT.get(coin, f"{coin}/USDT")
        ticker = exchange.fetch_ticker(symbol)
        result["binance"] = {
            "price": ticker.get("last", 0),
            "change_pct": ticker.get("percentage", 0),
            "high": ticker.get("high", 0),
            "low": ticker.get("low", 0),
            "volume": ticker.get("baseVolume", 0),
        }
    except Exception as e:
        logger.warning("Binance ticker fetch failed for %s: %s", coin, e)

    try:
        import ccxt
        config = get_config()
        if config.api.upbit_access_key and config.api.upbit_secret_key:
            params = {"enableRateLimit": True, "apiKey": config.api.upbit_access_key, "secret": config.api.upbit_secret_key}
            upbit = ccxt.upbit(params)
            symbol = COIN_SYMBOLS_KRW.get(coin, f"{coin}/KRW")
            ticker = upbit.fetch_ticker(symbol)
            result["upbit"] = {
                "price": ticker.get("last", 0),
                "change_pct": ticker.get("percentage", 0),
                "high": ticker.get("high", 0),
                "low": ticker.get("low", 0),
                "volume": ticker.get("baseVolume", 0),
            }
    except Exception as e:
        logger.warning("Upbit ticker fetch failed for %s: %s", coin, e)

    return result


def _format_ohlcv(candles: list, label: str, date_fmt: str, currency: str = "$") -> str:
    """Format OHLCV candle list into readable text."""
    lines = [f"\n=== {label} (last {len(candles)} candles) ==="]
    for c in candles:
        dt = datetime.fromtimestamp(c[0] / 1000, tz=timezone.utc).strftime(date_fmt)
        if currency == "₩":
            lines.append(
                f"  {dt}: O={c[1]:,.0f} H={c[2]:,.0f} "
                f"L={c[3]:,.0f} C={c[4]:,.0f} Vol={c[5]:,.2f}"
            )
        else:
            lines.append(
                f"  {dt}: O={c[1]:,.4f} H={c[2]:,.4f} "
                f"L={c[3]:,.4f} C={c[4]:,.4f} Vol={c[5]:,.2f}"
            )
    return "\n".join(lines)


def _fetch_upbit_data(coin: str, timeframes: list[str] | None = None) -> str:
    """Fetch KRW market data from Upbit via ccxt."""
    if timeframes is None:
        timeframes = ["1h", "4h", "1d", "1w", "1M"]
    try:
        import ccxt

        config = get_config()
        access_key = config.api.upbit_access_key
        secret_key = config.api.upbit_secret_key

        exchange_params = {"enableRateLimit": True}
        if access_key and secret_key:
            exchange_params["apiKey"] = access_key
            exchange_params["secret"] = secret_key

        exchange = ccxt.upbit(exchange_params)
        symbol = COIN_SYMBOLS_KRW.get(coin, f"{coin}/KRW")

        ticker = exchange.fetch_ticker(symbol)

        lines = [f"=== Upbit {coin}/KRW Real-time Data ==="]
        lines.append(f"Price: ₩{ticker.get('last', 0):,.0f}")
        lines.append(f"24h Change: {ticker.get('percentage', 0):+.2f}%")
        lines.append(f"24h High: ₩{ticker.get('high', 0):,.0f}")
        lines.append(f"24h Low: ₩{ticker.get('low', 0):,.0f}")
        lines.append(f"24h Volume: {ticker.get('baseVolume', 0):,.4f} {coin}")
        lines.append(f"24h Quote Volume: ₩{ticker.get('quoteVolume', 0):,.0f}")

        if "1M" in timeframes:
            ohlcv = exchange.fetch_ohlcv(symbol, "1M", limit=12)
            lines.append(_format_ohlcv(ohlcv[-12:], f"Monthly OHLCV ({coin}/KRW)", "%Y-%m", "₩"))

        if "1w" in timeframes:
            ohlcv = exchange.fetch_ohlcv(symbol, "1w", limit=52)
            lines.append(_format_ohlcv(ohlcv[-20:], f"Weekly OHLCV ({coin}/KRW)", "%Y-%m-%d", "₩"))

        if "1d" in timeframes:
            ohlcv = exchange.fetch_ohlcv(symbol, "1d", limit=200)
            lines.append(f"\n=== Daily OHLCV Summary ({coin}/KRW) - {len(ohlcv)} days available ===")
            lines.append(_format_ohlcv(ohlcv[-30:], f"Daily OHLCV - recent 30 days ({coin}/KRW)", "%m-%d", "₩"))
            closes = [c[4] for c in ohlcv]
            if len(closes) >= 5:
                ma_lines = ["\n=== Calculated Moving Averages (KRW) ==="]
                for period in [5, 20, 60, 120, 200]:
                    if len(closes) >= period:
                        ma_val = sum(closes[-period:]) / period
                        ma_lines.append(f"  SMA({period}): ₩{ma_val:,.0f}")
                lines.append("\n".join(ma_lines))

        if "4h" in timeframes:
            ohlcv = exchange.fetch_ohlcv(symbol, "4h", limit=120)
            lines.append(_format_ohlcv(ohlcv[-30:], f"4H OHLCV ({coin}/KRW)", "%m-%d %H:%M", "₩"))

        if "1h" in timeframes:
            ohlcv = exchange.fetch_ohlcv(symbol, "1h", limit=168)
            lines.append(_format_ohlcv(ohlcv[-24:], f"1H OHLCV ({coin}/KRW)", "%m-%d %H:%M", "₩"))

        return "\n".join(lines)
    except Exception as e:
        logger.warning("Upbit ccxt fetch failed for %s: %s", coin, e)
        return ""


def _fetch_binance_data(coin: str, timeframes: list[str] | None = None) -> str:
    """Fetch USDT market data from Binance via ccxt."""
    if timeframes is None:
        timeframes = ["1h", "4h", "1d", "1w", "1M"]
    try:
        import ccxt

        exchange = ccxt.binance({"enableRateLimit": True})
        symbol = COIN_SYMBOLS_USDT.get(coin, f"{coin}/USDT")

        ticker = exchange.fetch_ticker(symbol)

        lines = [f"=== Binance {coin}/USDT Real-time Data ==="]
        lines.append(f"Price: ${ticker.get('last', 0):,.4f}")
        lines.append(f"24h Change: {ticker.get('percentage', 0):+.2f}%")
        lines.append(f"24h High: ${ticker.get('high', 0):,.4f}")
        lines.append(f"24h Low: ${ticker.get('low', 0):,.4f}")
        lines.append(f"24h Volume: {ticker.get('baseVolume', 0):,.2f} {coin}")
        lines.append(f"24h Quote Volume: ${ticker.get('quoteVolume', 0):,.0f}")

        if "1M" in timeframes:
            ohlcv = exchange.fetch_ohlcv(symbol, "1M", limit=12)
            lines.append(_format_ohlcv(ohlcv[-12:], f"Monthly OHLCV ({coin}/USDT)", "%Y-%m"))

        if "1w" in timeframes:
            ohlcv = exchange.fetch_ohlcv(symbol, "1w", limit=52)
            lines.append(_format_ohlcv(ohlcv[-20:], f"Weekly OHLCV ({coin}/USDT)", "%Y-%m-%d"))

        if "1d" in timeframes:
            ohlcv = exchange.fetch_ohlcv(symbol, "1d", limit=200)
            lines.append(f"\n=== Daily OHLCV Summary ({coin}/USDT) - {len(ohlcv)} days available ===")
            lines.append(_format_ohlcv(ohlcv[-30:], f"Daily OHLCV - recent 30 days ({coin}/USDT)", "%m-%d"))
            closes = [c[4] for c in ohlcv]
            if len(closes) >= 5:
                ma_lines = ["\n=== Calculated Moving Averages (USDT) ==="]
                for period in [5, 20, 60, 120, 200]:
                    if len(closes) >= period:
                        ma_val = sum(closes[-period:]) / period
                        ma_lines.append(f"  SMA({period}): ${ma_val:,.4f}")
                lines.append("\n".join(ma_lines))

        if "4h" in timeframes:
            ohlcv = exchange.fetch_ohlcv(symbol, "4h", limit=120)
            lines.append(_format_ohlcv(ohlcv[-30:], f"4H OHLCV ({coin}/USDT)", "%m-%d %H:%M"))

        if "1h" in timeframes:
            ohlcv = exchange.fetch_ohlcv(symbol, "1h", limit=168)
            lines.append(_format_ohlcv(ohlcv[-24:], f"1H OHLCV ({coin}/USDT)", "%m-%d %H:%M"))

        return "\n".join(lines)
    except Exception as e:
        logger.warning("Binance ccxt fetch failed for %s: %s", coin, e)
        return f"[Binance data unavailable: {e}]"


def _fetch_ta_data(coin: str, timeframes: list[str] | None = None) -> str:
    """Fetch technical analysis from TradingView for selected timeframes."""
    if timeframes is None:
        timeframes = ["1h", "4h", "1d", "1w", "1M"]
    try:
        from tradingview_ta import TA_Handler, Interval

        tv_symbol, coin_name = COIN_TV_MAP.get(coin, (f"{coin}USDT", coin))
        results = []

        # Map our timeframe IDs to TradingView intervals
        tf_map = [
            ("1h", "1H", Interval.INTERVAL_1_HOUR),
            ("4h", "4H", Interval.INTERVAL_4_HOURS),
            ("1d", "Daily", Interval.INTERVAL_1_DAY),
            ("1w", "Weekly", Interval.INTERVAL_1_WEEK),
            ("1M", "Monthly", Interval.INTERVAL_1_MONTH),
        ]

        for tf_id, label, tv_interval in tf_map:
            if tf_id not in timeframes:
                continue
            try:
                handler = TA_Handler(
                    symbol=tv_symbol, screener="crypto",
                    exchange="BINANCE", interval=tv_interval,
                )
                analysis = handler.get_analysis()
                summary = analysis.summary
                osc = analysis.oscillators
                ma = analysis.moving_averages
                ind = analysis.indicators

                lines = [f"\n=== {coin_name} Technical Analysis ({label}) ==="]
                lines.append(
                    f"Overall: {summary['RECOMMENDATION']} "
                    f"(Buy:{summary['BUY']} Sell:{summary['SELL']} Neutral:{summary['NEUTRAL']})"
                )
                lines.append(
                    f"Oscillators: {osc['RECOMMENDATION']} "
                    f"(Buy:{osc['BUY']} Sell:{osc['SELL']} Neutral:{osc['NEUTRAL']})"
                )
                lines.append(
                    f"Moving Averages: {ma['RECOMMENDATION']} "
                    f"(Buy:{ma['BUY']} Sell:{ma['SELL']} Neutral:{ma['NEUTRAL']})"
                )

                lines.append("Indicators:")
                for name, key in [
                    ("RSI(14)", "RSI"), ("MACD", "MACD.macd"), ("MACD Signal", "MACD.signal"),
                    ("Stoch %K", "Stoch.K"), ("Stoch %D", "Stoch.D"), ("ADX", "ADX"),
                    ("CCI(20)", "CCI20"), ("ATR(14)", "ATR"),
                    ("BB Upper", "BB.upper"), ("BB Lower", "BB.lower"),
                    ("Pivot P", "Pivot.M.Classic.Middle"),
                    ("Pivot R1", "Pivot.M.Classic.R1"), ("Pivot S1", "Pivot.M.Classic.S1"),
                ]:
                    val = ind.get(key)
                    if val is not None:
                        lines.append(f"  {name}: {val:,.4f}")

                lines.append("Moving Averages:")
                for name, key in [
                    ("EMA(5)", "EMA5"), ("EMA(10)", "EMA10"), ("EMA(20)", "EMA20"),
                    ("EMA(50)", "EMA50"), ("EMA(100)", "EMA100"), ("EMA(200)", "EMA200"),
                    ("SMA(5)", "SMA5"), ("SMA(10)", "SMA10"), ("SMA(20)", "SMA20"),
                    ("SMA(50)", "SMA50"), ("SMA(100)", "SMA100"), ("SMA(200)", "SMA200"),
                ]:
                    val = ind.get(key)
                    if val is not None:
                        lines.append(f"  {name}: {val:,.4f}")

                results.append("\n".join(lines))
            except Exception as e:
                results.append(f"\n=== {coin_name} TA ({label}) === [Error: {e}]")

        return "\n".join(results)
    except Exception as e:
        logger.warning("tradingview-ta fetch failed for %s: %s", coin, e)
        return f"[Technical analysis unavailable: {e}]"


_TF_LABELS = {"1h": "1-Hour", "4h": "4-Hour", "1d": "Daily", "1w": "Weekly", "1M": "Monthly"}


def _build_system_prompt(coin: str, strategies: list[str], language: str, today_price: str = "", timeframes: list[str] | None = None) -> str:
    coin_name = COIN_TV_MAP.get(coin, (coin, coin))[1]

    strategy_text = "\n".join(
        f"- {STRATEGY_DESCRIPTIONS[s]}" for s in strategies if s in STRATEGY_DESCRIPTIONS
    )

    lang_name = LANG_NAMES.get(language, language)

    if language == "en":
        lang_open = ""
        lang_close = ""
    else:
        lang_open = f"[IMPORTANT: You MUST respond ENTIRELY in {lang_name}. All headings, sentences, and explanations must be written in {lang_name}. Only technical abbreviations like RSI, MACD, SMA, OHLCV may remain in English.]\n\n"
        lang_close = f"\n\n[REMINDER: Your response language is {lang_name}. Write everything in {lang_name}.]"

    return f"""{lang_open}You are a cryptocurrency technical analysis expert. Provide a detailed analysis of {coin_name}({coin}) based on the strategies below.

## IMPORTANT: Today's Reference Price
{today_price}
ALL analysis (support/resistance levels, trend direction, buy/sell signals, entry/stop-loss) MUST be based on this current price. Compare every indicator and level against today's price.

## Selected Timeframes
{', '.join(_TF_LABELS.get(t, t) for t in (timeframes or []))}
Focus your analysis ONLY on these timeframes. Data for other timeframes is not provided.

## Selected Analysis Strategies
{strategy_text}

## Analysis Guidelines — Be as DETAILED and THOROUGH as possible
1. Use ALL provided real-time OHLCV data, calculated moving averages, and TradingView technical indicators. Do not skip any available data.
2. Start each strategy section by stating how today's current price relates to the relevant indicators.
3. Organize by clear sections (## headings) for each selected strategy. Each section should be comprehensive (multiple paragraphs).
4. Cite EVERY relevant specific number (prices, indicator values, percentages) as evidence. Show your reasoning step-by-step.
5. Cross-verify across ALL multi-timeframe data (15min/1H/4H/Daily/Weekly). Explicitly compare signals across timeframes.
6. For moving averages: list each MA value, whether price is above/below, the arrangement (bullish/bearish alignment), and any crossovers.
7. For RSI/MACD/Bollinger: state the exact values, interpret them, and note any divergences with price.
8. Give a Buy/Sell/Hold judgment for the current moment with clear reasoning.
9. Specify key support/resistance price levels concretely with their distance (%) from today's price.
10. If candlestick patterns are visible in recent candles, name the pattern, explain its meaning, and note which timeframe it appears on.
11. Highlight confluence — when 2-3 indicators give the same signal. This is critical for confidence.
12. End with a comprehensive summary: overall judgment, specific entry price, stop-loss level, take-profit targets (all with % from current price), and risk factors.
13. Write a LONG, DETAILED analysis. Do NOT summarize briefly. Cover every angle the selected strategies require.

## Disclaimer
Always include at the end: "This analysis is reference material based on technical indicators. Investment decisions should be made at your own judgment and responsibility."

Use Markdown formatting.{lang_close}"""


@router.post("/analyze")
async def analyze_crypto(req: CryptoAnalyzeRequest):
    if req.coin not in COIN_SYMBOLS_USDT:
        raise HTTPException(status_code=400, detail=f"Unsupported coin: {req.coin}")
    if not req.strategies:
        raise HTTPException(status_code=400, detail="At least one strategy must be selected")

    provider = get_provider_for_model(req.model)
    if not provider:
        raise HTTPException(
            status_code=400,
            detail=f"Model '{req.model}' is not available. Check your API key settings.",
        )

    config = get_config()
    loop = asyncio.get_event_loop()

    # Step 1: Fetch current price first (fast) for the price header
    ticker_data = await loop.run_in_executor(None, _fetch_current_price, req.coin)

    coin_name = COIN_TV_MAP.get(req.coin, (req.coin, req.coin))[1]
    now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    # Build price header block
    b = ticker_data.get("binance", {})
    u = ticker_data.get("upbit", {})
    price_header = f"# {coin_name} ({req.coin}) — {now_str}\n\n"
    if b:
        chg = b.get('change_pct', 0)
        arrow = "+" if chg >= 0 else ""
        price_header += f"**Binance**: ${b.get('price', 0):,.4f}  ({arrow}{chg:.2f}%)  |  24h H: ${b.get('high', 0):,.4f}  L: ${b.get('low', 0):,.4f}\n\n"
    if u:
        chg = u.get('change_pct', 0)
        arrow = "+" if chg >= 0 else ""
        price_header += f"**Upbit**: ₩{u.get('price', 0):,.0f}  ({arrow}{chg:.2f}%)  |  24h H: ₩{u.get('high', 0):,.0f}  L: ₩{u.get('low', 0):,.0f}\n\n"
    price_header += "---\n\n"

    # Step 2: Fetch full OHLCV + TA data in parallel (filtered by selected timeframes)
    tf = req.timeframes
    futures = [
        loop.run_in_executor(None, _fetch_binance_data, req.coin, tf),
        loop.run_in_executor(None, _fetch_ta_data, req.coin, tf),
    ]

    use_upbit = bool(config.api.upbit_access_key and config.api.upbit_secret_key)
    if use_upbit:
        futures.append(loop.run_in_executor(None, _fetch_upbit_data, req.coin, tf))

    results = await asyncio.gather(*futures)

    binance_data = results[0]
    ta_data = results[1]
    upbit_data = results[2] if use_upbit and len(results) > 2 else ""

    # Build system prompt with today's price context
    today_price_ctx = f"\nToday's current price: ${b.get('price', 0):,.4f} (Binance)" if b else ""
    if u:
        today_price_ctx += f", ₩{u.get('price', 0):,.0f} (Upbit)"
    system_prompt = _build_system_prompt(req.coin, req.strategies, config.language, today_price_ctx, tf)

    data_sections = [binance_data]
    if upbit_data:
        data_sections.append(upbit_data)
    data_sections.append(ta_data)

    lang_name = LANG_NAMES.get(config.language, config.language)
    if config.language == "en":
        user_prefix = f"Analyze {req.coin} based on the real-time data below. Today's price is ${b.get('price', 0):,.4f}. All analysis must reference this current price."
    else:
        user_prefix = f"Analyze {req.coin} based on the real-time data below. Today's price is ${b.get('price', 0):,.4f}. All analysis must reference this current price. Respond in {lang_name}."

    user_message = f"{user_prefix}\n\n" + "\n\n".join(data_sections)

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_message},
    ]

    # For non-English languages, prefill assistant response in the target language.
    prefill_tpl = _LANG_PREFILL.get(config.language, "")
    prefill = prefill_tpl.format(coin_name=coin_name, coin=req.coin) if prefill_tpl else ""
    if prefill:
        messages.append({"role": "assistant", "content": prefill.rstrip()})

    async def event_stream():
        try:
            # Send price header immediately so user sees today's price first
            yield f"data: {json.dumps({'type': 'token', 'content': price_header})}\n\n"
            # Send prefill text for language forcing
            if prefill:
                yield f"data: {json.dumps({'type': 'token', 'content': prefill})}\n\n"
            async for token in provider.stream(messages, req.model):
                yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'content': str(e)})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
