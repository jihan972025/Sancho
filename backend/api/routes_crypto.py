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
    # Backtest strategy descriptions (bt_ prefix)
    "bt_sma_cross": (
        "SMA Cross 전략 백테스트: 단기/장기 이동평균선(SMA) 골든크로스 시 매수, "
        "데드크로스 시 매도하는 추세추종 전략의 과거 성과를 분석"
    ),
    "bt_rsi": (
        "RSI 전략 백테스트: RSI가 과매도 구간에 진입 시 매수, "
        "과매수 구간 진입 시 매도하는 역추세 전략의 과거 성과를 분석"
    ),
    "bt_bollinger": (
        "Bollinger Bands 전략 백테스트: 볼린저 밴드 하단 이탈 시 매수, "
        "상단 이탈 시 매도하는 평균회귀 전략의 과거 성과를 분석"
    ),
    "bt_macd": (
        "MACD 전략 백테스트: MACD 라인이 시그널선을 상향 돌파 시 매수, "
        "하향 돌파 시 매도하는 모멘텀 전략의 과거 성과를 분석"
    ),
    "bt_triple_filter": (
        "Triple Filter 전략 백테스트: MA 추세 + 볼린저 밴드 위치 + RSI 과매도 반전을 "
        "결합한 다중 필터 전략의 과거 성과를 분석"
    ),
    "bt_sentiment": (
        "Sentiment 전략 백테스트: SMA Cross 기술적 백테스트 + 현재 뉴스 감성 분석을 "
        "결합한 하이브리드 전략의 과거 성과를 분석"
    ),
    "bt_drl": (
        "DRL Q-Learning 전략 백테스트: 강화학습 에이전트가 가격 추세·RSI·변동성을 "
        "상태로 관찰하여 최적 매매 정책을 학습한 결과를 분석"
    ),
    "bt_ml_boost": (
        "ML Gradient Boosting 전략 백테스트: 13개 기술적 피처(수익률, RSI, BB, 거래량 등)로 "
        "다음 봉의 방향을 예측하는 머신러닝 모델의 과거 성과를 분석"
    ),
}


class CryptoAnalyzeRequest(BaseModel):
    coin: str
    strategies: list[str]
    timeframes: list[str] = ["1h", "4h", "1d", "1w", "1M"]
    model: str
    backtest_timeframe: str = "1d"
    backtest_period_days: int = 365


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


def _build_system_prompt(coin: str, strategies: list[str], language: str, today_price: str = "", timeframes: list[str] | None = None, has_backtest: bool = False) -> str:
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

    backtest_guidelines = ""
    if has_backtest:
        backtest_guidelines = """
## Backtest Results Analysis Guidelines
When backtest results are provided in the data section, you MUST:
1. Analyze each backtest strategy's performance metrics (total return, win rate, max drawdown, profit factor).
2. Compare the strategy's return against Buy & Hold return — is the strategy adding alpha?
3. Evaluate the risk-adjusted performance: high return with low drawdown is ideal.
4. Review the trade history for patterns (are wins clustered? are losses getting bigger?).
5. Assess strategy strengths and weaknesses based on the data.
6. Combine backtest insights with the current technical analysis to form a stronger recommendation.
7. If DRL/ML strategies are included, comment on model quality (accuracy, feature importance).
"""

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
{backtest_guidelines}
## Disclaimer
Always include at the end: "This analysis is reference material based on technical indicators. Investment decisions should be made at your own judgment and responsibility."

Use Markdown formatting.{lang_close}"""


# Mapping from bt_ prefix analysis IDs to _STRATEGY_RUNNERS keys
_BT_ANALYSIS_MAP = {
    "bt_sma_cross": "sma_cross",
    "bt_rsi": "rsi",
    "bt_bollinger": "bollinger",
    "bt_macd": "macd",
    "bt_triple_filter": "triple_filter",
    "bt_sentiment": "sentiment",
    "bt_drl": "drl",
    "bt_ml_boost": "ml_boost",
}


def _run_backtest_for_analysis(
    runner_key: str, candles: list, commission: float = 0.001
) -> dict:
    """Run a backtest strategy and return result dict.

    Uses default params for each strategy. Returns {"trades": [...], ...}.
    """
    runner = _STRATEGY_RUNNERS.get(runner_key)
    if not runner:
        return {"trades": []}

    kwargs: dict = {"candles": candles, "commission": commission}

    # DRL and ML need extra params but defaults are fine
    if runner_key == "drl":
        kwargs["episodes"] = 300  # fewer for analysis context (faster)
    elif runner_key == "ml_boost":
        kwargs["n_trees"] = 30  # lighter for analysis context

    return runner(**kwargs)


def _format_backtest_summary(
    strategy_label: str, metrics: dict, trades: list[dict]
) -> str:
    """Format backtest results into a text block for LLM consumption."""
    lines = [f"\n=== Backtest Result: {strategy_label} ==="]
    lines.append(f"  Total Return: {metrics.get('total_return', 0)}%")
    lines.append(f"  CAGR: {metrics.get('cagr', 0)}%")
    lines.append(f"  Max Drawdown: {metrics.get('mdd', 0)}%")
    lines.append(f"  Win Rate: {metrics.get('win_rate', 0)}%")
    lines.append(f"  Total Trades: {metrics.get('total_trades', 0)}")
    lines.append(f"  Profit Factor: {metrics.get('profit_factor', 0)}")
    lines.append(f"  Avg Hold: {metrics.get('avg_hold_bars', 0)} bars")
    lines.append(f"  Buy & Hold Return: {metrics.get('buy_hold_return', 0)}%")

    if trades:
        lines.append(f"\n  Recent Trades (last {min(len(trades), 15)}):")
        for t in trades[-15:]:
            entry_dt = datetime.fromtimestamp(
                t["entry_ts"] / 1000, tz=timezone.utc
            ).strftime("%Y-%m-%d %H:%M")
            exit_dt = datetime.fromtimestamp(
                t["exit_ts"] / 1000, tz=timezone.utc
            ).strftime("%Y-%m-%d %H:%M")
            lines.append(
                f"    {entry_dt} → {exit_dt}: "
                f"${t['entry_price']:,.4f} → ${t['exit_price']:,.4f} "
                f"({t['pnl_pct']:+.2f}%)"
            )

    return "\n".join(lines)


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

    # Separate TA strategies from backtest strategies
    ta_strategies = [s for s in req.strategies if not s.startswith("bt_")]
    bt_strategies = [s for s in req.strategies if s.startswith("bt_")]

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
    data_sections: list[str] = []

    if ta_strategies:
        futures = [
            loop.run_in_executor(None, _fetch_binance_data, req.coin, tf),
            loop.run_in_executor(None, _fetch_ta_data, req.coin, tf),
        ]

        use_upbit = bool(config.api.upbit_access_key and config.api.upbit_secret_key)
        if use_upbit:
            futures.append(loop.run_in_executor(None, _fetch_upbit_data, req.coin, tf))

        results = await asyncio.gather(*futures)

        data_sections.append(results[0])  # binance_data
        if use_upbit and len(results) > 2 and results[2]:
            data_sections.append(results[2])  # upbit_data
        data_sections.append(results[1])  # ta_data

    # Build system prompt with today's price context
    today_price_ctx = f"\nToday's current price: ${b.get('price', 0):,.4f} (Binance)" if b else ""
    if u:
        today_price_ctx += f", ₩{u.get('price', 0):,.0f} (Upbit)"

    all_strat_ids = ta_strategies + bt_strategies
    system_prompt = _build_system_prompt(
        req.coin, all_strat_ids, config.language, today_price_ctx,
        tf if ta_strategies else None,
        has_backtest=bool(bt_strategies),
    )

    lang_name = LANG_NAMES.get(config.language, config.language)
    if config.language == "en":
        user_prefix = f"Analyze {req.coin} based on the data below. Today's price is ${b.get('price', 0):,.4f}. All analysis must reference this current price."
    else:
        user_prefix = f"Analyze {req.coin} based on the data below. Today's price is ${b.get('price', 0):,.4f}. All analysis must reference this current price. Respond in {lang_name}."

    # For non-English languages, prefill assistant response in the target language.
    prefill_tpl = _LANG_PREFILL.get(config.language, "")
    prefill = prefill_tpl.format(coin_name=coin_name, coin=req.coin) if prefill_tpl else ""

    async def event_stream():
        try:
            # Send price header immediately so user sees today's price first
            yield f"data: {json.dumps({'type': 'token', 'content': price_header})}\n\n"

            backtest_sections: list[str] = []

            # Step 3: Run backtest strategies if any
            if bt_strategies:
                yield f"data: {json.dumps({'type': 'progress', 'content': 'Running backtest strategies...'})}\n\n"

                # Fetch OHLCV for backtest
                bt_tf = req.backtest_timeframe
                tf_limits = {"1h": 24, "4h": 6, "1d": 1, "1w": 1 / 7}
                bars_per_day = tf_limits.get(bt_tf, 1)
                bt_limit = min(int(req.backtest_period_days * bars_per_day) + 100, 1000)

                bt_candles = await loop.run_in_executor(
                    None, _fetch_binance_ohlcv_raw, req.coin, bt_tf, bt_limit
                )

                if bt_candles and len(bt_candles) >= 30:
                    for bt_id in bt_strategies:
                        runner_key = _BT_ANALYSIS_MAP.get(bt_id)
                        if not runner_key:
                            continue

                        label = STRATEGY_DESCRIPTIONS.get(bt_id, bt_id).split(":")[0]
                        yield f"data: {json.dumps({'type': 'progress', 'content': f'Running {label}...'})}\n\n"

                        try:
                            bt_result = await loop.run_in_executor(
                                None, _run_backtest_for_analysis, runner_key, bt_candles, 0.001
                            )
                            bt_trades = bt_result.get("trades", [])
                            bt_metrics = _calc_metrics(bt_trades, bt_candles, 10000)

                            summary = _format_backtest_summary(label, bt_metrics, bt_trades)
                            backtest_sections.append(summary)

                            # Add ML/DRL-specific info
                            if runner_key == "ml_boost":
                                ml_stats = bt_result.get("ml_stats", {})
                                if ml_stats:
                                    backtest_sections.append(
                                        f"  ML Stats: Train Acc={ml_stats.get('train_accuracy', 0)}%, "
                                        f"Test Acc={ml_stats.get('test_accuracy', 0)}%, "
                                        f"Trees={ml_stats.get('n_trees', 0)}, "
                                        f"Top Features: {', '.join(f['name'] for f in ml_stats.get('top_features', [])[:3])}"
                                    )
                            elif runner_key == "drl":
                                q_size = bt_result.get("q_table_size", 0)
                                train_rewards = bt_result.get("train_rewards", [])
                                if train_rewards:
                                    backtest_sections.append(
                                        f"  DRL Stats: Q-table={q_size} states, "
                                        f"Best Reward={max(train_rewards):.1f}, "
                                        f"Final Reward={train_rewards[-1]:.1f}"
                                    )
                        except Exception as e:
                            logger.warning("Backtest %s failed in analysis: %s", runner_key, e)
                            backtest_sections.append(f"\n=== Backtest {label}: Error — {e} ===")
                else:
                    backtest_sections.append("\n=== Backtest: Not enough candle data ===")

            # Combine all data sections
            all_sections = data_sections + backtest_sections
            user_message = f"{user_prefix}\n\n" + "\n\n".join(all_sections)

            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ]
            if prefill:
                messages.append({"role": "assistant", "content": prefill.rstrip()})

            yield f"data: {json.dumps({'type': 'progress', 'content': 'Generating AI analysis...'})}\n\n"

            # Send prefill text for language forcing
            if prefill:
                yield f"data: {json.dumps({'type': 'token', 'content': prefill})}\n\n"
            async for token in provider.stream(messages, req.model):
                yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'content': str(e)})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


# ─── Backtest ────────────────────────────────────────────────────────────────

class BacktestRequest(BaseModel):
    coin: str
    strategy: str  # sma_cross | rsi | bollinger | macd
    timeframe: str = "1d"
    period_days: int = 365
    initial_capital: float = 10000
    commission_pct: float = 0.1
    strategy_params: dict = {}
    model: str = ""  # optional – LLM analysis


def _fetch_binance_ohlcv_raw(coin: str, timeframe: str, limit: int = 500) -> list:
    """Return raw [[ts, O, H, L, C, V], ...] from Binance via ccxt."""
    import ccxt
    exchange = ccxt.binance({"enableRateLimit": True})
    symbol = COIN_SYMBOLS_USDT.get(coin, f"{coin}/USDT")
    return exchange.fetch_ohlcv(symbol, timeframe, limit=limit)


def _fetch_crypto_news(coin: str, coin_name: str, max_results: int = 5) -> list[dict]:
    """Fetch current crypto news from DuckDuckGo. Returns list of {title, body, date, source, url}."""
    from ddgs import DDGS

    articles: list[dict] = []
    queries = [f"{coin_name} crypto news today", f"{coin} cryptocurrency market"]

    try:
        with DDGS() as ddgs:
            for query in queries:
                results = list(ddgs.news(query, max_results=max_results))
                for r in results:
                    articles.append({
                        "title": r.get("title", ""),
                        "body": r.get("body", ""),
                        "date": r.get("date", ""),
                        "source": r.get("source", ""),
                        "url": r.get("url", ""),
                    })
                if articles:
                    break
    except Exception as e:
        logger.warning("DuckDuckGo news fetch failed for %s: %s", coin, e)

    # Deduplicate by title prefix
    seen: set[str] = set()
    unique: list[dict] = []
    for a in articles:
        key = a["title"].lower().strip()[:60]
        if key and key not in seen:
            seen.add(key)
            unique.append(a)

    return unique[:max_results]


def _sma(closes: list[float], period: int) -> list[float | None]:
    out: list[float | None] = [None] * len(closes)
    for i in range(period - 1, len(closes)):
        out[i] = sum(closes[i - period + 1 : i + 1]) / period
    return out


def _ema(closes: list[float], period: int) -> list[float | None]:
    out: list[float | None] = [None] * len(closes)
    k = 2 / (period + 1)
    out[period - 1] = sum(closes[:period]) / period
    for i in range(period, len(closes)):
        out[i] = closes[i] * k + (out[i - 1] or 0) * (1 - k)
    return out


def _calc_rsi(closes: list[float], period: int = 14) -> list[float | None]:
    out: list[float | None] = [None] * len(closes)
    if len(closes) < period + 1:
        return out
    gains, losses = [], []
    for i in range(1, period + 1):
        diff = closes[i] - closes[i - 1]
        gains.append(max(diff, 0))
        losses.append(max(-diff, 0))
    avg_gain = sum(gains) / period
    avg_loss = sum(losses) / period
    if avg_loss == 0:
        out[period] = 100.0
    else:
        out[period] = 100 - 100 / (1 + avg_gain / avg_loss)
    for i in range(period + 1, len(closes)):
        diff = closes[i] - closes[i - 1]
        avg_gain = (avg_gain * (period - 1) + max(diff, 0)) / period
        avg_loss = (avg_loss * (period - 1) + max(-diff, 0)) / period
        if avg_loss == 0:
            out[i] = 100.0
        else:
            out[i] = 100 - 100 / (1 + avg_gain / avg_loss)
    return out


# ── Strategy functions ──

def _backtest_sma_cross(candles: list, short_p: int = 20, long_p: int = 50,
                         commission: float = 0.001) -> dict:
    closes = [c[4] for c in candles]
    timestamps = [c[0] for c in candles]
    short_ma = _sma(closes, short_p)
    long_ma = _sma(closes, long_p)

    trades: list[dict] = []
    position = None  # {"entry_ts", "entry_price", "entry_idx"}

    for i in range(1, len(closes)):
        if short_ma[i] is None or long_ma[i] is None or short_ma[i - 1] is None or long_ma[i - 1] is None:
            continue
        # Golden cross → buy
        if short_ma[i - 1] <= long_ma[i - 1] and short_ma[i] > long_ma[i] and position is None:
            position = {"entry_ts": timestamps[i], "entry_price": closes[i], "entry_idx": i}
        # Dead cross → sell
        elif short_ma[i - 1] >= long_ma[i - 1] and short_ma[i] < long_ma[i] and position is not None:
            pnl = (closes[i] / position["entry_price"] - 1) * 100 - commission * 200
            trades.append({
                "type": "BUY",
                "entry_ts": position["entry_ts"], "entry_price": position["entry_price"],
                "exit_ts": timestamps[i], "exit_price": closes[i],
                "pnl_pct": round(pnl, 2),
                "hold_bars": i - position["entry_idx"],
            })
            position = None

    # Close open position at last candle
    if position is not None:
        i = len(closes) - 1
        pnl = (closes[i] / position["entry_price"] - 1) * 100 - commission * 200
        trades.append({
            "type": "BUY",
            "entry_ts": position["entry_ts"], "entry_price": position["entry_price"],
            "exit_ts": timestamps[i], "exit_price": closes[i],
            "pnl_pct": round(pnl, 2),
            "hold_bars": i - position["entry_idx"],
        })

    return {"trades": trades}


def _backtest_rsi(candles: list, period: int = 14, oversold: float = 30,
                   overbought: float = 70, commission: float = 0.001) -> dict:
    closes = [c[4] for c in candles]
    timestamps = [c[0] for c in candles]
    rsi_vals = _calc_rsi(closes, period)

    trades: list[dict] = []
    position = None

    for i in range(1, len(closes)):
        if rsi_vals[i] is None or rsi_vals[i - 1] is None:
            continue
        # RSI crosses above oversold → buy
        if rsi_vals[i - 1] <= oversold and rsi_vals[i] > oversold and position is None:
            position = {"entry_ts": timestamps[i], "entry_price": closes[i], "entry_idx": i}
        # RSI crosses above overbought → sell
        elif rsi_vals[i] >= overbought and position is not None:
            pnl = (closes[i] / position["entry_price"] - 1) * 100 - commission * 200
            trades.append({
                "type": "BUY",
                "entry_ts": position["entry_ts"], "entry_price": position["entry_price"],
                "exit_ts": timestamps[i], "exit_price": closes[i],
                "pnl_pct": round(pnl, 2),
                "hold_bars": i - position["entry_idx"],
            })
            position = None

    if position is not None:
        i = len(closes) - 1
        pnl = (closes[i] / position["entry_price"] - 1) * 100 - commission * 200
        trades.append({
            "type": "BUY",
            "entry_ts": position["entry_ts"], "entry_price": position["entry_price"],
            "exit_ts": timestamps[i], "exit_price": closes[i],
            "pnl_pct": round(pnl, 2),
            "hold_bars": i - position["entry_idx"],
        })

    return {"trades": trades}


def _backtest_bollinger(candles: list, period: int = 20, std_dev: float = 2.0,
                         commission: float = 0.001) -> dict:
    closes = [c[4] for c in candles]
    timestamps = [c[0] for c in candles]

    trades: list[dict] = []
    position = None

    for i in range(period - 1, len(closes)):
        window = closes[i - period + 1 : i + 1]
        mid = sum(window) / period
        variance = sum((x - mid) ** 2 for x in window) / period
        sd = variance ** 0.5
        upper = mid + std_dev * sd
        lower = mid - std_dev * sd

        if closes[i] <= lower and position is None:
            position = {"entry_ts": timestamps[i], "entry_price": closes[i], "entry_idx": i}
        elif closes[i] >= upper and position is not None:
            pnl = (closes[i] / position["entry_price"] - 1) * 100 - commission * 200
            trades.append({
                "type": "BUY",
                "entry_ts": position["entry_ts"], "entry_price": position["entry_price"],
                "exit_ts": timestamps[i], "exit_price": closes[i],
                "pnl_pct": round(pnl, 2),
                "hold_bars": i - position["entry_idx"],
            })
            position = None

    if position is not None:
        i = len(closes) - 1
        pnl = (closes[i] / position["entry_price"] - 1) * 100 - commission * 200
        trades.append({
            "type": "BUY",
            "entry_ts": position["entry_ts"], "entry_price": position["entry_price"],
            "exit_ts": timestamps[i], "exit_price": closes[i],
            "pnl_pct": round(pnl, 2),
            "hold_bars": i - position["entry_idx"],
        })

    return {"trades": trades}


def _backtest_macd(candles: list, fast: int = 12, slow: int = 26, signal_p: int = 9,
                    commission: float = 0.001) -> dict:
    closes = [c[4] for c in candles]
    timestamps = [c[0] for c in candles]
    fast_ema = _ema(closes, fast)
    slow_ema = _ema(closes, slow)

    macd_line: list[float | None] = [None] * len(closes)
    for i in range(len(closes)):
        if fast_ema[i] is not None and slow_ema[i] is not None:
            macd_line[i] = fast_ema[i] - slow_ema[i]

    # Signal line = EMA of MACD line
    macd_values = [v for v in macd_line if v is not None]
    if len(macd_values) < signal_p:
        return {"trades": []}

    signal_line: list[float | None] = [None] * len(closes)
    start_idx = next(i for i, v in enumerate(macd_line) if v is not None)
    k = 2 / (signal_p + 1)
    sig_start = start_idx + signal_p - 1
    if sig_start < len(closes):
        signal_line[sig_start] = sum(
            macd_line[j] for j in range(start_idx, sig_start + 1) if macd_line[j] is not None
        ) / signal_p
        for i in range(sig_start + 1, len(closes)):
            if macd_line[i] is not None and signal_line[i - 1] is not None:
                signal_line[i] = macd_line[i] * k + signal_line[i - 1] * (1 - k)

    trades: list[dict] = []
    position = None

    for i in range(1, len(closes)):
        if macd_line[i] is None or signal_line[i] is None or macd_line[i - 1] is None or signal_line[i - 1] is None:
            continue
        # MACD crosses above signal → buy
        if macd_line[i - 1] <= signal_line[i - 1] and macd_line[i] > signal_line[i] and position is None:
            position = {"entry_ts": timestamps[i], "entry_price": closes[i], "entry_idx": i}
        # MACD crosses below signal → sell
        elif macd_line[i - 1] >= signal_line[i - 1] and macd_line[i] < signal_line[i] and position is not None:
            pnl = (closes[i] / position["entry_price"] - 1) * 100 - commission * 200
            trades.append({
                "type": "BUY",
                "entry_ts": position["entry_ts"], "entry_price": position["entry_price"],
                "exit_ts": timestamps[i], "exit_price": closes[i],
                "pnl_pct": round(pnl, 2),
                "hold_bars": i - position["entry_idx"],
            })
            position = None

    if position is not None:
        i = len(closes) - 1
        pnl = (closes[i] / position["entry_price"] - 1) * 100 - commission * 200
        trades.append({
            "type": "BUY",
            "entry_ts": position["entry_ts"], "entry_price": position["entry_price"],
            "exit_ts": timestamps[i], "exit_price": closes[i],
            "pnl_pct": round(pnl, 2),
            "hold_bars": i - position["entry_idx"],
        })

    return {"trades": trades}


def _backtest_triple_filter(candles: list, ma_short: int = 20, ma_long: int = 60,
                             bb_period: int = 20, bb_std: float = 2.0,
                             rsi_period: int = 14, rsi_buy: float = 40, rsi_sell: float = 70,
                             commission: float = 0.001) -> dict:
    """Triple-Filter Strategy: MA trend + Bollinger proximity + RSI reversal.

    Buy when ALL three conditions are met:
      1. SMA(short) > SMA(long)  — uptrend confirmation
      2. Price is in lower 20% of Bollinger Band range — dip-buy zone
      3. RSI was below rsi_buy within last 3 bars and is now rising — oversold reversal

    Sell when:
      - RSI >= rsi_sell (overbought), OR
      - Price is in upper 20% of Bollinger Band range and rising momentum fades, OR
      - SMA(short) crosses below SMA(long) (trend reversal)
    """
    closes = [c[4] for c in candles]
    timestamps = [c[0] for c in candles]
    n = len(closes)

    # Calculate indicators
    short_ma = _sma(closes, ma_short)
    long_ma = _sma(closes, ma_long)
    rsi_vals = _calc_rsi(closes, rsi_period)

    # Bollinger Bands
    bb_mid = _sma(closes, bb_period)
    bb_upper: list[float | None] = [None] * n
    bb_lower: list[float | None] = [None] * n
    for i in range(bb_period - 1, n):
        window = closes[i - bb_period + 1 : i + 1]
        mid = bb_mid[i]
        if mid is not None:
            variance = sum((x - mid) ** 2 for x in window) / bb_period
            sd = variance ** 0.5
            bb_upper[i] = mid + bb_std * sd
            bb_lower[i] = mid - bb_std * sd

    trades: list[dict] = []
    position = None

    lookback = 3  # RSI lookback window for recent oversold detection

    for i in range(lookback, n):
        # Need all indicators available
        if (short_ma[i] is None or long_ma[i] is None or rsi_vals[i] is None
                or bb_lower[i] is None or bb_upper[i] is None):
            continue

        if position is None:
            # ── BUY conditions (all three filters) ──
            # Filter 1: Uptrend — short MA above long MA
            trend_ok = short_ma[i] > long_ma[i]

            # Filter 2: Price in lower zone of Bollinger Band
            band_width = bb_upper[i] - bb_lower[i]
            if band_width > 0:
                band_position = (closes[i] - bb_lower[i]) / band_width  # 0.0 = lower, 1.0 = upper
                band_ok = band_position <= 0.25  # in bottom 25% of band
            else:
                band_ok = False

            # Filter 3: RSI was oversold recently (within lookback bars) and is now rising
            recent_rsi_low = False
            for j in range(max(1, i - lookback), i):
                if rsi_vals[j] is not None and rsi_vals[j] <= rsi_buy:
                    recent_rsi_low = True
                    break
            rsi_rising = rsi_vals[i] > rsi_vals[i - 1] if rsi_vals[i - 1] is not None else False
            rsi_ok = recent_rsi_low and rsi_rising and rsi_vals[i] <= rsi_buy + 10

            if trend_ok and band_ok and rsi_ok:
                position = {"entry_ts": timestamps[i], "entry_price": closes[i], "entry_idx": i}
        else:
            # ── SELL conditions (any one trigger) ──
            sell_rsi = rsi_vals[i] >= rsi_sell

            band_width = bb_upper[i] - bb_lower[i]
            sell_band = False
            if band_width > 0:
                band_position = (closes[i] - bb_lower[i]) / band_width
                sell_band = band_position >= 0.9  # price near upper band

            sell_trend = short_ma[i] < long_ma[i]  # trend reversal

            if sell_rsi or sell_band or sell_trend:
                pnl = (closes[i] / position["entry_price"] - 1) * 100 - commission * 200
                trades.append({
                    "type": "BUY",
                    "entry_ts": position["entry_ts"], "entry_price": position["entry_price"],
                    "exit_ts": timestamps[i], "exit_price": closes[i],
                    "pnl_pct": round(pnl, 2),
                    "hold_bars": i - position["entry_idx"],
                })
                position = None

    # Close open position at last candle
    if position is not None:
        i = n - 1
        pnl = (closes[i] / position["entry_price"] - 1) * 100 - commission * 200
        trades.append({
            "type": "BUY",
            "entry_ts": position["entry_ts"], "entry_price": position["entry_price"],
            "exit_ts": timestamps[i], "exit_price": closes[i],
            "pnl_pct": round(pnl, 2),
            "hold_bars": i - position["entry_idx"],
        })

    return {"trades": trades}


def _backtest_sentiment(candles: list, short_p: int = 20, long_p: int = 50,
                         commission: float = 0.001) -> dict:
    """Sentiment strategy (technical component): SMA cross for historical backtest.

    News sentiment analysis is done separately in the endpoint after the backtest completes.
    """
    return _backtest_sma_cross(candles, short_p=short_p, long_p=long_p, commission=commission)


# ── Deep Reinforcement Learning (Q-Learning) Strategy ──

import math
import random

def _backtest_drl(candles: list, episodes: int = 500, lookback: int = 10,
                   lr: float = 0.1, gamma: float = 0.95, epsilon_start: float = 1.0,
                   epsilon_end: float = 0.01, commission: float = 0.001,
                   _progress_cb=None) -> dict:
    """Q-Learning reinforcement learning backtest.

    The agent observes a discretized state (price trend, RSI zone, volatility zone, position)
    and learns an optimal policy (BUY / SELL / HOLD) over many episodes of simulated trading.

    After training, it runs a final episode to produce the actual trade log.
    """
    closes = [c[4] for c in candles]
    timestamps = [c[0] for c in candles]
    n = len(closes)

    if n < lookback + 20:
        return {"trades": [], "train_rewards": []}

    # ── Feature engineering: discretize continuous features into state bins ──

    def _get_features(idx: int) -> tuple[int, int, int]:
        """Return (trend_bin, rsi_bin, vol_bin) for candle at idx."""
        # Trend: short-term return over lookback
        ret = (closes[idx] - closes[idx - lookback]) / closes[idx - lookback]
        if ret > 0.03:
            trend = 2    # strong up
        elif ret > 0.005:
            trend = 1    # mild up
        elif ret > -0.005:
            trend = 0    # flat
        elif ret > -0.03:
            trend = -1   # mild down
        else:
            trend = -2   # strong down

        # RSI approximation (using lookback window)
        gains, losses = 0.0, 0.0
        for j in range(idx - lookback + 1, idx + 1):
            diff = closes[j] - closes[j - 1]
            if diff > 0:
                gains += diff
            else:
                losses -= diff
        avg_gain = gains / lookback
        avg_loss = losses / lookback
        if avg_loss == 0:
            rsi = 100.0
        else:
            rsi = 100 - 100 / (1 + avg_gain / avg_loss)

        if rsi < 30:
            rsi_bin = 0     # oversold
        elif rsi < 50:
            rsi_bin = 1     # low
        elif rsi < 70:
            rsi_bin = 2     # mid
        else:
            rsi_bin = 3     # overbought

        # Volatility: std of returns over lookback
        rets = [(closes[j] - closes[j - 1]) / closes[j - 1]
                for j in range(idx - lookback + 1, idx + 1)]
        mean_r = sum(rets) / len(rets)
        var_r = sum((r - mean_r) ** 2 for r in rets) / len(rets)
        vol = math.sqrt(var_r)
        if vol < 0.01:
            vol_bin = 0     # low vol
        elif vol < 0.03:
            vol_bin = 1     # mid vol
        else:
            vol_bin = 2     # high vol

        return (trend + 2, rsi_bin, vol_bin)  # trend shifted to 0-4

    # State: (trend_bin: 0-4, rsi_bin: 0-3, vol_bin: 0-2, has_position: 0-1)
    # Actions: 0=HOLD, 1=BUY, 2=SELL
    N_ACTIONS = 3

    # Q-table as dict for sparse access
    q_table: dict[tuple, list[float]] = {}

    def _get_q(state: tuple) -> list[float]:
        if state not in q_table:
            q_table[state] = [0.0] * N_ACTIONS
        return q_table[state]

    start_idx = lookback + 1
    train_rewards: list[float] = []

    # ── Training phase ──
    for ep in range(episodes):
        epsilon = max(epsilon_end, epsilon_start - (epsilon_start - epsilon_end) * ep / max(episodes - 1, 1))
        has_position = False
        entry_price = 0.0
        total_reward = 0.0

        for i in range(start_idx, n):
            feat = _get_features(i)
            state = (*feat, int(has_position))
            q_vals = _get_q(state)

            # Epsilon-greedy action selection
            if random.random() < epsilon:
                action = random.randint(0, N_ACTIONS - 1)
            else:
                action = q_vals.index(max(q_vals))

            # Execute action and calculate reward
            reward = 0.0
            if action == 1 and not has_position:  # BUY
                has_position = True
                entry_price = closes[i]
                reward = -commission * 100   # small cost for entering
            elif action == 2 and has_position:  # SELL
                pnl = (closes[i] / entry_price - 1) * 100 - commission * 200
                reward = pnl
                has_position = False
                entry_price = 0.0
            elif action == 1 and has_position:
                reward = -0.1   # penalty: already in position
            elif action == 2 and not has_position:
                reward = -0.1   # penalty: nothing to sell
            else:  # HOLD
                if has_position:
                    # Small reward/penalty based on unrealized PnL direction
                    price_change = (closes[i] - closes[i - 1]) / closes[i - 1] * 100
                    reward = price_change * 0.1

            total_reward += reward

            # Next state
            if i + 1 < n:
                next_feat = _get_features(i + 1) if i + 1 >= lookback + 1 else feat
                next_state = (*next_feat, int(has_position))
                next_q = _get_q(next_state)
                max_next_q = max(next_q)
            else:
                max_next_q = 0.0

            # Q-value update
            q_vals[action] += lr * (reward + gamma * max_next_q - q_vals[action])

        # If still in position at end, close with penalty
        if has_position:
            total_reward += (closes[-1] / entry_price - 1) * 100 - commission * 200

        train_rewards.append(round(total_reward, 2))

        # Report progress every 100 episodes
        if _progress_cb and (ep + 1) % 100 == 0:
            _progress_cb(ep + 1, episodes, total_reward)

    # ── Final exploitation run (epsilon=0) to generate trade log ──
    trades: list[dict] = []
    has_position = False
    position_data: dict = {}

    for i in range(start_idx, n):
        feat = _get_features(i)
        state = (*feat, int(has_position))
        q_vals = _get_q(state)
        action = q_vals.index(max(q_vals))

        if action == 1 and not has_position:
            has_position = True
            position_data = {"entry_ts": timestamps[i], "entry_price": closes[i], "entry_idx": i}
        elif action == 2 and has_position:
            pnl = (closes[i] / position_data["entry_price"] - 1) * 100 - commission * 200
            trades.append({
                "type": "BUY",
                "entry_ts": position_data["entry_ts"],
                "entry_price": position_data["entry_price"],
                "exit_ts": timestamps[i],
                "exit_price": closes[i],
                "pnl_pct": round(pnl, 2),
                "hold_bars": i - position_data["entry_idx"],
            })
            has_position = False

    # Close open position
    if has_position:
        i = n - 1
        pnl = (closes[i] / position_data["entry_price"] - 1) * 100 - commission * 200
        trades.append({
            "type": "BUY",
            "entry_ts": position_data["entry_ts"],
            "entry_price": position_data["entry_price"],
            "exit_ts": timestamps[i],
            "exit_price": closes[i],
            "pnl_pct": round(pnl, 2),
            "hold_bars": i - position_data["entry_idx"],
        })

    return {
        "trades": trades,
        "train_rewards": train_rewards,
        "q_table_size": len(q_table),
    }


# ── ML Gradient Boosting Strategy ──


def _backtest_ml_boost(
    candles: list,
    train_ratio: float = 0.7,
    n_trees: int = 50,
    max_depth: int = 3,
    learning_rate: float = 0.1,
    min_samples_leaf: int = 5,
    threshold: float = 0.5,
    commission: float = 0.001,
    _progress_cb=None,
) -> dict:
    """Gradient Boosting ML backtest using multiple technical features.

    Pure-Python implementation of decision-tree gradient boosting (mini-XGBoost).

    Feature set (per candle):
      - Returns over 1/3/5/10 bars
      - RSI (14)
      - Bollinger Band position (0-1)
      - BB width (volatility proxy)
      - SMA slope (20-bar)
      - EMA(12)/EMA(26) ratio (MACD-like)
      - Volume change ratio
      - ATR (14) normalized
      - Price relative to SMA50
      - Momentum (close - close[10])

    Target: next-bar return direction (1 = up, 0 = down)
    """

    closes = [c[4] for c in candles]
    highs = [c[2] for c in candles]
    lows = [c[3] for c in candles]
    volumes = [c[5] for c in candles]
    timestamps = [c[0] for c in candles]
    n = len(closes)

    if n < 60:
        return {"trades": [], "ml_stats": {}}

    # ── Feature engineering ──

    def _ema_arr(data: list[float], period: int) -> list[float | None]:
        out: list[float | None] = [None] * len(data)
        if len(data) < period:
            return out
        k = 2.0 / (period + 1)
        out[period - 1] = sum(data[:period]) / period
        for i in range(period, len(data)):
            out[i] = data[i] * k + out[i - 1] * (1 - k)
        return out

    def _sma_arr(data: list[float], period: int) -> list[float | None]:
        out: list[float | None] = [None] * len(data)
        for i in range(period - 1, len(data)):
            out[i] = sum(data[i - period + 1 : i + 1]) / period
        return out

    # Pre-compute indicators
    sma20 = _sma_arr(closes, 20)
    sma50 = _sma_arr(closes, 50)
    ema12 = _ema_arr(closes, 12)
    ema26 = _ema_arr(closes, 26)

    # RSI (14)
    rsi_period = 14
    rsi_arr: list[float | None] = [None] * n
    if n > rsi_period:
        gains, losses = 0.0, 0.0
        for j in range(1, rsi_period + 1):
            d = closes[j] - closes[j - 1]
            if d > 0:
                gains += d
            else:
                losses -= d
        avg_gain = gains / rsi_period
        avg_loss = losses / rsi_period
        rsi_arr[rsi_period] = 100 - 100 / (1 + avg_gain / max(avg_loss, 1e-10))
        for j in range(rsi_period + 1, n):
            d = closes[j] - closes[j - 1]
            avg_gain = (avg_gain * (rsi_period - 1) + max(d, 0)) / rsi_period
            avg_loss = (avg_loss * (rsi_period - 1) + max(-d, 0)) / rsi_period
            rsi_arr[j] = 100 - 100 / (1 + avg_gain / max(avg_loss, 1e-10))

    # Bollinger Bands (20, 2)
    bb_pos: list[float | None] = [None] * n
    bb_width: list[float | None] = [None] * n
    for i in range(19, n):
        window = closes[i - 19 : i + 1]
        mid = sum(window) / 20
        sd = (sum((x - mid) ** 2 for x in window) / 20) ** 0.5
        upper = mid + 2 * sd
        lower = mid - 2 * sd
        band_w = upper - lower
        if band_w > 0:
            bb_pos[i] = (closes[i] - lower) / band_w
            bb_width[i] = band_w / mid  # normalized
        else:
            bb_pos[i] = 0.5
            bb_width[i] = 0.0

    # ATR (14)
    atr_arr: list[float | None] = [None] * n
    if n > 14:
        tr_sum = 0.0
        for j in range(1, 15):
            tr = max(
                highs[j] - lows[j],
                abs(highs[j] - closes[j - 1]),
                abs(lows[j] - closes[j - 1]),
            )
            tr_sum += tr
        atr_arr[14] = tr_sum / 14
        for j in range(15, n):
            tr = max(
                highs[j] - lows[j],
                abs(highs[j] - closes[j - 1]),
                abs(lows[j] - closes[j - 1]),
            )
            atr_arr[j] = (atr_arr[j - 1] * 13 + tr) / 14

    # Build feature matrix (start from index 50 to ensure all indicators ready)
    start_idx = 50
    features: list[list[float]] = []
    labels: list[int] = []
    feat_indices: list[int] = []  # map row -> candle index

    for i in range(start_idx, n - 1):  # n-1 because we need next bar for label
        # Skip if any indicator is None
        if (
            sma20[i] is None or sma50[i] is None
            or ema12[i] is None or ema26[i] is None
            or rsi_arr[i] is None
            or bb_pos[i] is None or bb_width[i] is None
            or atr_arr[i] is None
        ):
            continue
        if closes[i] == 0 or closes[i - 1] == 0:
            continue

        # Features
        ret_1 = (closes[i] - closes[i - 1]) / closes[i - 1]
        ret_3 = (closes[i] - closes[i - 3]) / closes[i - 3] if i >= 3 else 0
        ret_5 = (closes[i] - closes[i - 5]) / closes[i - 5] if i >= 5 else 0
        ret_10 = (closes[i] - closes[i - 10]) / closes[i - 10] if i >= 10 else 0

        rsi_val = rsi_arr[i] / 100.0  # normalize to 0-1

        bb_p = bb_pos[i]
        bb_w = bb_width[i]

        # SMA slope (normalized)
        sma_slope = (sma20[i] - sma20[i - 5]) / sma20[i] if i >= 5 and sma20[i - 5] else 0

        # EMA ratio (MACD-like)
        ema_ratio = ema12[i] / ema26[i] - 1.0 if ema26[i] else 0

        # Volume change
        avg_vol = sum(volumes[max(0, i - 10) : i]) / min(10, i) if i > 0 else 1
        vol_ratio = volumes[i] / max(avg_vol, 1e-10)

        # ATR normalized
        atr_norm = atr_arr[i] / closes[i] if closes[i] else 0

        # Price vs SMA50
        price_vs_sma50 = closes[i] / sma50[i] - 1.0 if sma50[i] else 0

        # Momentum
        momentum = (closes[i] - closes[i - 10]) / closes[i - 10] if i >= 10 and closes[i - 10] else 0

        row = [
            ret_1, ret_3, ret_5, ret_10,
            rsi_val, bb_p, bb_w,
            sma_slope, ema_ratio,
            vol_ratio, atr_norm,
            price_vs_sma50, momentum,
        ]
        features.append(row)

        # Label: next candle goes up = 1, down = 0
        next_ret = (closes[i + 1] - closes[i]) / closes[i]
        labels.append(1 if next_ret > 0 else 0)
        feat_indices.append(i)

    if len(features) < 40:
        return {"trades": [], "ml_stats": {"error": "Not enough data for ML training"}}

    n_feat = len(features[0])
    FEATURE_NAMES = [
        "Return_1", "Return_3", "Return_5", "Return_10",
        "RSI", "BB_Pos", "BB_Width",
        "SMA_Slope", "EMA_Ratio",
        "Vol_Ratio", "ATR_Norm",
        "Price_vs_SMA50", "Momentum",
    ]

    # ── Train / Test split ──
    split = int(len(features) * train_ratio)
    X_train, y_train = features[:split], labels[:split]
    X_test, y_test = features[split:], labels[split:]
    test_indices = feat_indices[split:]

    if len(X_train) < 20 or len(X_test) < 10:
        return {"trades": [], "ml_stats": {"error": "Insufficient train/test samples"}}

    # ── Mini Decision Tree (regression stump / shallow tree) ──

    class _TreeNode:
        __slots__ = ("feat_idx", "threshold", "left", "right", "value")

        def __init__(self):
            self.feat_idx: int = 0
            self.threshold: float = 0.0
            self.left: "_TreeNode | None" = None
            self.right: "_TreeNode | None" = None
            self.value: float = 0.0

    def _build_tree(
        X: list[list[float]], y: list[float], depth: int, max_d: int, min_leaf: int
    ) -> _TreeNode:
        node = _TreeNode()
        node.value = sum(y) / len(y) if y else 0.0

        if depth >= max_d or len(y) <= min_leaf:
            return node

        best_gain = 0.0
        best_feat = 0
        best_thresh = 0.0
        parent_var = _variance(y)

        if parent_var < 1e-12:
            return node

        n_samples = len(X)

        # Try each feature, sample thresholds
        for f in range(n_feat):
            vals = sorted(set(row[f] for row in X))
            # Sample up to 20 candidate thresholds for efficiency
            if len(vals) > 20:
                step = max(1, len(vals) // 20)
                vals = vals[::step]

            for v in vals:
                left_y = [y[j] for j in range(n_samples) if X[j][f] <= v]
                right_y = [y[j] for j in range(n_samples) if X[j][f] > v]

                if len(left_y) < min_leaf or len(right_y) < min_leaf:
                    continue

                w_l = len(left_y) / n_samples
                w_r = len(right_y) / n_samples
                gain = parent_var - w_l * _variance(left_y) - w_r * _variance(right_y)

                if gain > best_gain:
                    best_gain = gain
                    best_feat = f
                    best_thresh = v

        if best_gain < 1e-10:
            return node

        node.feat_idx = best_feat
        node.threshold = best_thresh

        left_X, left_y, right_X, right_y = [], [], [], []
        for j in range(n_samples):
            if X[j][best_feat] <= best_thresh:
                left_X.append(X[j])
                left_y.append(y[j])
            else:
                right_X.append(X[j])
                right_y.append(y[j])

        node.left = _build_tree(left_X, left_y, depth + 1, max_d, min_leaf)
        node.right = _build_tree(right_X, right_y, depth + 1, max_d, min_leaf)
        return node

    def _predict_tree(node: _TreeNode, x: list[float]) -> float:
        if node.left is None or node.right is None:
            return node.value
        if x[node.feat_idx] <= node.threshold:
            return _predict_tree(node.left, x)
        else:
            return _predict_tree(node.right, x)

    def _variance(arr: list[float]) -> float:
        if len(arr) == 0:
            return 0.0
        m = sum(arr) / len(arr)
        return sum((x - m) ** 2 for x in arr) / len(arr)

    # ── Gradient Boosting Training ──
    # For binary classification, we use log-odds (logistic) gradient boosting
    # Initial prediction = log(p / (1-p)) where p = mean(y_train)

    p_mean = sum(y_train) / len(y_train)
    p_mean = max(0.01, min(0.99, p_mean))  # clip
    init_pred = math.log(p_mean / (1 - p_mean))

    # Current predictions (log-odds)
    F_train = [init_pred] * len(X_train)

    trees: list[_TreeNode] = []
    train_losses: list[float] = []

    feature_importance = [0.0] * n_feat

    def _sigmoid(x: float) -> float:
        if x > 20:
            return 1.0
        if x < -20:
            return 0.0
        return 1.0 / (1.0 + math.exp(-x))

    def _accumulate_importance(node: _TreeNode, imp: list[float]):
        if node.left is None or node.right is None:
            return
        imp[node.feat_idx] += 1.0
        _accumulate_importance(node.left, imp)
        _accumulate_importance(node.right, imp)

    for t in range(n_trees):
        # Compute pseudo-residuals (negative gradient of log-loss)
        residuals = []
        for j in range(len(y_train)):
            p = _sigmoid(F_train[j])
            residuals.append(y_train[j] - p)

        # Fit tree to residuals
        tree = _build_tree(X_train, residuals, 0, max_depth, min_samples_leaf)
        trees.append(tree)

        # Update predictions
        for j in range(len(X_train)):
            F_train[j] += learning_rate * _predict_tree(tree, X_train[j])

        # Log-loss
        loss = 0.0
        for j in range(len(y_train)):
            p = _sigmoid(F_train[j])
            p = max(1e-10, min(1 - 1e-10, p))
            loss -= y_train[j] * math.log(p) + (1 - y_train[j]) * math.log(1 - p)
        loss /= len(y_train)
        train_losses.append(round(loss, 4))

        # Track feature importance (based on tree splits)
        _accumulate_importance(tree, feature_importance)

        if _progress_cb and (t + 1) % 10 == 0:
            _progress_cb(t + 1, n_trees, loss)

    # Normalize importance
    total_imp = sum(feature_importance) or 1.0
    feature_importance = [round(x / total_imp, 4) for x in feature_importance]

    # ── Predict on test set ──
    def _predict_proba(x: list[float]) -> float:
        f = init_pred
        for tree in trees:
            f += learning_rate * _predict_tree(tree, x)
        return _sigmoid(f)

    # Train accuracy
    train_correct = 0
    for j in range(len(X_train)):
        pred = 1 if _predict_proba(X_train[j]) >= threshold else 0
        if pred == y_train[j]:
            train_correct += 1
    train_acc = train_correct / len(X_train) * 100

    # Test predictions + accuracy
    test_preds: list[float] = []
    test_correct = 0
    for j in range(len(X_test)):
        prob = _predict_proba(X_test[j])
        test_preds.append(prob)
        pred_label = 1 if prob >= threshold else 0
        if pred_label == y_test[j]:
            test_correct += 1
    test_acc = test_correct / len(X_test) * 100

    # ── Generate trades from test predictions ──
    trades: list[dict] = []
    position = None

    for j in range(len(X_test)):
        prob = test_preds[j]
        candle_idx = test_indices[j]

        if position is None:
            # Buy if model predicts UP with confidence
            if prob >= threshold:
                position = {
                    "entry_ts": timestamps[candle_idx + 1],  # enter at next bar
                    "entry_price": closes[candle_idx + 1] if candle_idx + 1 < n else closes[candle_idx],
                    "entry_idx": candle_idx + 1,
                }
        else:
            # Sell if model predicts DOWN or if it's the last bar
            if prob < threshold or j == len(X_test) - 1:
                exit_idx = min(candle_idx + 1, n - 1)
                pnl = (closes[exit_idx] / position["entry_price"] - 1) * 100 - commission * 200
                trades.append({
                    "type": "BUY",
                    "entry_ts": position["entry_ts"],
                    "entry_price": position["entry_price"],
                    "exit_ts": timestamps[exit_idx],
                    "exit_price": closes[exit_idx],
                    "pnl_pct": round(pnl, 2),
                    "hold_bars": exit_idx - position["entry_idx"],
                })
                position = None

    # Close any remaining position
    if position is not None:
        exit_idx = n - 1
        pnl = (closes[exit_idx] / position["entry_price"] - 1) * 100 - commission * 200
        trades.append({
            "type": "BUY",
            "entry_ts": position["entry_ts"],
            "entry_price": position["entry_price"],
            "exit_ts": timestamps[exit_idx],
            "exit_price": closes[exit_idx],
            "pnl_pct": round(pnl, 2),
            "hold_bars": exit_idx - position["entry_idx"],
        })

    # Top features
    feat_imp_sorted = sorted(
        zip(FEATURE_NAMES, feature_importance), key=lambda x: x[1], reverse=True
    )
    top_features = [{"name": name, "importance": imp} for name, imp in feat_imp_sorted[:5]]

    ml_stats = {
        "train_samples": len(X_train),
        "test_samples": len(X_test),
        "n_trees": n_trees,
        "max_depth": max_depth,
        "train_accuracy": round(train_acc, 1),
        "test_accuracy": round(test_acc, 1),
        "final_loss": train_losses[-1] if train_losses else 0,
        "top_features": top_features,
    }

    return {"trades": trades, "ml_stats": ml_stats}


_STRATEGY_RUNNERS = {
    "sma_cross": _backtest_sma_cross,
    "rsi": _backtest_rsi,
    "bollinger": _backtest_bollinger,
    "macd": _backtest_macd,
    "triple_filter": _backtest_triple_filter,
    "sentiment": _backtest_sentiment,
    "drl": _backtest_drl,
    "ml_boost": _backtest_ml_boost,
}


def _calc_metrics(trades: list[dict], candles: list, initial_capital: float) -> dict:
    """Calculate performance metrics from trade list."""
    if not trades:
        buy_hold = ((candles[-1][4] / candles[0][4]) - 1) * 100 if candles else 0
        return {
            "total_return": 0, "cagr": 0, "mdd": 0, "win_rate": 0,
            "total_trades": 0, "avg_hold_bars": 0, "profit_factor": 0,
            "buy_hold_return": round(buy_hold, 2),
        }

    # Equity curve
    equity = initial_capital
    peak = equity
    max_dd = 0
    wins = 0
    gross_profit = 0
    gross_loss = 0
    total_hold = 0

    for t in trades:
        pnl_ratio = t["pnl_pct"] / 100
        equity *= (1 + pnl_ratio)
        if equity > peak:
            peak = equity
        dd = (peak - equity) / peak * 100
        if dd > max_dd:
            max_dd = dd
        if t["pnl_pct"] > 0:
            wins += 1
            gross_profit += t["pnl_pct"]
        elif t["pnl_pct"] < 0:
            gross_loss += abs(t["pnl_pct"])
        total_hold += t.get("hold_bars", 0)

    total_return = (equity / initial_capital - 1) * 100
    n_trades = len(trades)

    # CAGR: approximate from number of candles
    if candles and len(candles) > 1:
        days = (candles[-1][0] - candles[0][0]) / (1000 * 86400)
        years = days / 365.25 if days > 0 else 1
    else:
        years = 1
    cagr = ((equity / initial_capital) ** (1 / years) - 1) * 100 if years > 0 else 0

    buy_hold = ((candles[-1][4] / candles[0][4]) - 1) * 100 if candles else 0

    return {
        "total_return": round(total_return, 2),
        "cagr": round(cagr, 2),
        "mdd": round(-max_dd, 2),
        "win_rate": round(wins / n_trades * 100, 1) if n_trades else 0,
        "total_trades": n_trades,
        "avg_hold_bars": round(total_hold / n_trades, 1) if n_trades else 0,
        "profit_factor": round(gross_profit / gross_loss, 2) if gross_loss > 0 else (999 if gross_profit > 0 else 0),
        "buy_hold_return": round(buy_hold, 2),
    }


@router.post("/backtest")
async def run_backtest(req: BacktestRequest):
    if req.coin not in COIN_SYMBOLS_USDT:
        raise HTTPException(status_code=400, detail=f"Unsupported coin: {req.coin}")
    if req.strategy not in _STRATEGY_RUNNERS:
        raise HTTPException(status_code=400, detail=f"Unknown strategy: {req.strategy}")

    loop = asyncio.get_event_loop()
    config = get_config()

    # Map timeframe to ccxt limit
    tf_limits = {"1h": 24, "4h": 6, "1d": 1, "1w": 1 / 7}
    bars_per_day = tf_limits.get(req.timeframe, 1)
    limit = min(int(req.period_days * bars_per_day) + 100, 1000)  # extra for indicator warmup

    async def backtest_stream():
        try:
            yield f"data: {json.dumps({'type': 'progress', 'content': 'Fetching OHLCV data...'})}\n\n"

            candles = await loop.run_in_executor(
                None, _fetch_binance_ohlcv_raw, req.coin, req.timeframe, limit
            )

            if not candles or len(candles) < 30:
                yield f"data: {json.dumps({'type': 'error', 'content': 'Not enough candle data'})}\n\n"
                return

            yield f"data: {json.dumps({'type': 'progress', 'content': f'Running {req.strategy} backtest on {len(candles)} candles...'})}\n\n"

            # Build strategy kwargs from request params
            runner = _STRATEGY_RUNNERS[req.strategy]
            kwargs: dict = {"candles": candles, "commission": req.commission_pct / 100}

            sp = req.strategy_params
            if req.strategy == "sma_cross":
                kwargs["short_p"] = sp.get("short_period", 20)
                kwargs["long_p"] = sp.get("long_period", 50)
            elif req.strategy == "rsi":
                kwargs["period"] = sp.get("period", 14)
                kwargs["oversold"] = sp.get("oversold", 30)
                kwargs["overbought"] = sp.get("overbought", 70)
            elif req.strategy == "bollinger":
                kwargs["period"] = sp.get("period", 20)
                kwargs["std_dev"] = sp.get("std_dev", 2.0)
            elif req.strategy == "macd":
                kwargs["fast"] = sp.get("fast", 12)
                kwargs["slow"] = sp.get("slow", 26)
                kwargs["signal_p"] = sp.get("signal", 9)
            elif req.strategy == "triple_filter":
                kwargs["ma_short"] = sp.get("ma_short", 20)
                kwargs["ma_long"] = sp.get("ma_long", 60)
                kwargs["bb_period"] = sp.get("bb_period", 20)
                kwargs["bb_std"] = sp.get("bb_std", 2.0)
                kwargs["rsi_period"] = sp.get("rsi_period", 14)
                kwargs["rsi_buy"] = sp.get("rsi_buy", 40)
                kwargs["rsi_sell"] = sp.get("rsi_sell", 70)
            elif req.strategy == "sentiment":
                kwargs["short_p"] = sp.get("ma_short", 20)
                kwargs["long_p"] = sp.get("ma_long", 50)
            elif req.strategy == "drl":
                kwargs["episodes"] = int(sp.get("episodes", 500))
                kwargs["lookback"] = int(sp.get("lookback", 10))
                kwargs["lr"] = sp.get("lr", 0.1)
                kwargs["gamma"] = sp.get("gamma", 0.95)
                kwargs["epsilon_start"] = sp.get("epsilon_start", 1.0)
                kwargs["epsilon_end"] = sp.get("epsilon_end", 0.01)
            elif req.strategy == "ml_boost":
                kwargs["train_ratio"] = sp.get("train_ratio", 0.7)
                kwargs["n_trees"] = int(sp.get("n_trees", 50))
                kwargs["max_depth"] = int(sp.get("max_depth", 3))
                kwargs["learning_rate"] = sp.get("learning_rate", 0.1)
                kwargs["min_samples_leaf"] = int(sp.get("min_samples_leaf", 5))
                kwargs["threshold"] = sp.get("threshold", 0.5)

            # DRL / ML needs special async handling for progress reporting
            if req.strategy == "drl":
                progress_msgs: list[str] = []

                def _drl_progress(ep: int, total: int, reward: float):
                    progress_msgs.append(
                        f"Training episode {ep}/{total} — reward: {reward:+.1f}"
                    )

                kwargs["_progress_cb"] = _drl_progress
                result = await loop.run_in_executor(None, lambda: runner(**kwargs))

                # Send collected progress messages
                for msg in progress_msgs:
                    yield f"data: {json.dumps({'type': 'progress', 'content': msg})}\n\n"

                # Send training stats
                train_rewards = result.get("train_rewards", [])
                q_size = result.get("q_table_size", 0)
                drl_info = {
                    "q_table_size": q_size,
                    "final_reward": train_rewards[-1] if train_rewards else 0,
                    "avg_reward_last50": round(sum(train_rewards[-50:]) / max(len(train_rewards[-50:]), 1), 2),
                    "best_reward": max(train_rewards) if train_rewards else 0,
                }
                yield f"data: {json.dumps({'type': 'drl_info', 'content': drl_info})}\n\n"
            elif req.strategy == "ml_boost":
                progress_msgs_ml: list[str] = []

                def _ml_progress(tree_num: int, total: int, loss: float):
                    progress_msgs_ml.append(
                        f"Training tree {tree_num}/{total} — loss: {loss:.4f}"
                    )

                kwargs["_progress_cb"] = _ml_progress
                result = await loop.run_in_executor(None, lambda: runner(**kwargs))

                for msg in progress_msgs_ml:
                    yield f"data: {json.dumps({'type': 'progress', 'content': msg})}\n\n"

                # Send ML training stats
                ml_stats = result.get("ml_stats", {})
                if ml_stats:
                    yield f"data: {json.dumps({'type': 'ml_info', 'content': ml_stats})}\n\n"
            else:
                result = runner(**kwargs)

            metrics = _calc_metrics(result["trades"], candles, req.initial_capital)

            # Format trades for frontend (convert timestamps)
            formatted_trades = []
            for t in result["trades"]:
                formatted_trades.append({
                    **t,
                    "entry_date": datetime.fromtimestamp(t["entry_ts"] / 1000, tz=timezone.utc).strftime("%Y-%m-%d %H:%M"),
                    "exit_date": datetime.fromtimestamp(t["exit_ts"] / 1000, tz=timezone.utc).strftime("%Y-%m-%d %H:%M"),
                    "entry_price": round(t["entry_price"], 4),
                    "exit_price": round(t["exit_price"], 4),
                })

            yield f"data: {json.dumps({'type': 'result', 'content': {'metrics': metrics, 'trades': formatted_trades}})}\n\n"

            # ── Sentiment strategy: news fetch + LLM sentiment analysis ──
            if req.strategy == "sentiment" and req.model:
                provider = get_provider_for_model(req.model)
                if provider:
                    # Phase 1: Fetch current news
                    yield f"data: {json.dumps({'type': 'progress', 'content': 'Fetching current crypto news...'})}\n\n"

                    coin_name = COIN_TV_MAP.get(req.coin, (req.coin, req.coin))[1]
                    news_count = int(sp.get("news_count", 5))
                    articles = await loop.run_in_executor(
                        None, _fetch_crypto_news, req.coin, coin_name, news_count
                    )

                    if not articles:
                        yield f"data: {json.dumps({'type': 'progress', 'content': 'No news found. Generating technical analysis only...'})}\n\n"
                    else:
                        yield f"data: {json.dumps({'type': 'sentiment_data', 'content': {'articles': articles, 'count': len(articles)}})}\n\n"

                    # Phase 2: LLM sentiment analysis
                    yield f"data: {json.dumps({'type': 'progress', 'content': 'Analyzing sentiment with AI...'})}\n\n"

                    lang = config.language
                    lang_name = LANG_NAMES.get(lang, lang)

                    bt_summary = (
                        f"## Backtest Performance Summary\n"
                        f"Coin: {coin_name} ({req.coin}/USDT)\n"
                        f"Strategy: SMA Cross (Short={sp.get('ma_short', 20)}, Long={sp.get('ma_long', 50)})\n"
                        f"Timeframe: {req.timeframe}, Period: {req.period_days} days\n"
                        f"Total Return: {metrics['total_return']}%\n"
                        f"Win Rate: {metrics['win_rate']}%\n"
                        f"Max Drawdown: {metrics['mdd']}%\n"
                        f"Total Trades: {metrics['total_trades']}\n"
                        f"Profit Factor: {metrics['profit_factor']}\n"
                        f"Buy & Hold Return: {metrics['buy_hold_return']}%\n"
                    )

                    news_text = "\n\n## Current News Articles\n\n"
                    if articles:
                        for idx, a in enumerate(articles, 1):
                            news_text += f"{idx}. **{a['title']}**\n"
                            if a.get("source"):
                                news_text += f"   Source: {a['source']}"
                            if a.get("date"):
                                news_text += f" | {a['date']}"
                            news_text += "\n"
                            if a.get("body"):
                                news_text += f"   {a['body'][:300]}\n"
                            news_text += "\n"
                    else:
                        news_text += "(No news articles found)\n"

                    lang_instr = ""
                    if lang != "en":
                        lang_instr = f"\n\nIMPORTANT: Respond ENTIRELY in {lang_name}."

                    system_prompt = (
                        "You are a cryptocurrency analyst combining quantitative backtest data "
                        "with news sentiment analysis.\n\n"
                        "Analyze the following and provide:\n"
                        "1. **Backtest Performance Review**: Briefly assess the SMA cross strategy's historical performance.\n"
                        "2. **News Sentiment Analysis**: For each news article, assign a sentiment score from "
                        "-1.0 (very bearish) to +1.0 (very bullish). Explain your reasoning briefly.\n"
                        "3. **Overall Sentiment Score**: Provide a weighted average sentiment score.\n"
                        "4. **Combined Signal**: Merge the technical backtest performance with current sentiment "
                        "to give a final recommendation: **Strong Buy / Buy / Hold / Sell / Strong Sell**.\n"
                        "5. **Risk Assessment**: Note any conflicting signals between technical and sentiment indicators.\n\n"
                        "Format sentiment scores clearly, e.g., 'Sentiment: +0.7 (Bullish)'\n"
                        "Use Markdown formatting with clear headings."
                        f"{lang_instr}"
                    )

                    messages = [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": bt_summary + news_text},
                    ]

                    async for token in provider.stream(messages, req.model):
                        yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n"

                yield f"data: {json.dumps({'type': 'done'})}\n\n"
                return

            # Optional LLM analysis (for non-sentiment strategies)
            if req.model:
                provider = get_provider_for_model(req.model)
                if provider:
                    yield f"data: {json.dumps({'type': 'progress', 'content': 'Generating AI analysis...'})}\n\n"

                    coin_name = COIN_TV_MAP.get(req.coin, (req.coin, req.coin))[1]
                    lang = config.language
                    lang_name = LANG_NAMES.get(lang, lang)

                    bt_summary = (
                        f"Coin: {coin_name} ({req.coin}/USDT)\n"
                        f"Strategy: {req.strategy}\n"
                        f"Timeframe: {req.timeframe}, Period: {req.period_days} days\n"
                        f"Initial Capital: ${req.initial_capital:,.0f}, Commission: {req.commission_pct}%\n"
                        f"Total Return: {metrics['total_return']}%\n"
                        f"CAGR: {metrics['cagr']}%\n"
                        f"Max Drawdown: {metrics['mdd']}%\n"
                        f"Win Rate: {metrics['win_rate']}%\n"
                        f"Total Trades: {metrics['total_trades']}\n"
                        f"Avg Hold: {metrics['avg_hold_bars']} bars\n"
                        f"Profit Factor: {metrics['profit_factor']}\n"
                        f"Buy & Hold Return: {metrics['buy_hold_return']}%\n"
                        f"\nTrade Log (last 20):\n"
                    )
                    for t in formatted_trades[-20:]:
                        bt_summary += f"  {t['entry_date']} → {t['exit_date']}: ${t['entry_price']} → ${t['exit_price']} ({t['pnl_pct']:+.2f}%)\n"

                    lang_instr = ""
                    if lang != "en":
                        lang_instr = f"\n\nIMPORTANT: Respond ENTIRELY in {lang_name}."

                    messages = [
                        {"role": "system", "content": f"You are a quantitative trading analyst. Analyze the backtest results below. Provide insights on strategy performance, strengths, weaknesses, and suggestions for parameter optimization.{lang_instr}"},
                        {"role": "user", "content": bt_summary},
                    ]

                    async for token in provider.stream(messages, req.model):
                        yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n"

            yield f"data: {json.dumps({'type': 'done'})}\n\n"

        except Exception as e:
            logger.error("Backtest error: %s", e, exc_info=True)
            yield f"data: {json.dumps({'type': 'error', 'content': str(e)})}\n\n"

    return StreamingResponse(backtest_stream(), media_type="text/event-stream")
