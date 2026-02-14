"""Technical indicator calculations for auto-trading."""

from __future__ import annotations

import math


def sma(values: list[float], period: int) -> list[float | None]:
    out: list[float | None] = [None] * len(values)
    for i in range(period - 1, len(values)):
        out[i] = sum(values[i - period + 1 : i + 1]) / period
    return out


def ema(values: list[float], period: int) -> list[float | None]:
    out: list[float | None] = [None] * len(values)
    if len(values) < period:
        return out
    k = 2.0 / (period + 1)
    out[period - 1] = sum(values[:period]) / period
    for i in range(period, len(values)):
        out[i] = values[i] * k + (out[i - 1] or 0) * (1 - k)
    return out


def calc_rsi(closes: list[float], period: int = 14) -> list[float | None]:
    out: list[float | None] = [None] * len(closes)
    if len(closes) < period + 1:
        return out
    gains, losses = 0.0, 0.0
    for i in range(1, period + 1):
        diff = closes[i] - closes[i - 1]
        if diff > 0:
            gains += diff
        else:
            losses -= diff
    avg_gain = gains / period
    avg_loss = losses / period
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


def calc_macd(
    closes: list[float], fast: int = 12, slow: int = 26, signal_p: int = 9
) -> dict:
    """Return latest MACD values: {macd, signal, histogram}."""
    fast_ema = ema(closes, fast)
    slow_ema = ema(closes, slow)

    macd_line: list[float | None] = [None] * len(closes)
    for i in range(len(closes)):
        if fast_ema[i] is not None and slow_ema[i] is not None:
            macd_line[i] = fast_ema[i] - slow_ema[i]

    macd_values = [v for v in macd_line if v is not None]
    if len(macd_values) < signal_p:
        return {"macd": 0, "signal": 0, "histogram": 0}

    signal_line: list[float | None] = [None] * len(closes)
    start_idx = next(i for i, v in enumerate(macd_line) if v is not None)
    k = 2.0 / (signal_p + 1)
    sig_start = start_idx + signal_p - 1
    if sig_start < len(closes):
        signal_line[sig_start] = (
            sum(macd_line[j] for j in range(start_idx, sig_start + 1) if macd_line[j] is not None)
            / signal_p
        )
        for i in range(sig_start + 1, len(closes)):
            if macd_line[i] is not None and signal_line[i - 1] is not None:
                signal_line[i] = macd_line[i] * k + signal_line[i - 1] * (1 - k)

    m = macd_line[-1] or 0
    s = signal_line[-1] or 0
    return {"macd": round(m, 4), "signal": round(s, 4), "histogram": round(m - s, 4)}


def calc_bollinger(
    closes: list[float], period: int = 20, std_dev: float = 2.0
) -> dict:
    """Return latest Bollinger Band values: {upper, middle, lower, position}."""
    if len(closes) < period:
        return {"upper": 0, "middle": 0, "lower": 0, "position": 0.5}
    window = closes[-period:]
    mid = sum(window) / period
    variance = sum((x - mid) ** 2 for x in window) / period
    sd = math.sqrt(variance)
    upper = mid + std_dev * sd
    lower = mid - std_dev * sd
    band_w = upper - lower
    pos = (closes[-1] - lower) / band_w if band_w > 0 else 0.5
    return {
        "upper": round(upper, 2),
        "middle": round(mid, 2),
        "lower": round(lower, 2),
        "position": round(pos, 4),
    }


def calc_atr(
    highs: list[float], lows: list[float], closes: list[float], period: int = 14
) -> float:
    """Average True Range."""
    if len(closes) < period + 1:
        return 0
    trs: list[float] = []
    for i in range(1, len(closes)):
        tr = max(
            highs[i] - lows[i],
            abs(highs[i] - closes[i - 1]),
            abs(lows[i] - closes[i - 1]),
        )
        trs.append(tr)
    if len(trs) < period:
        return 0
    return sum(trs[-period:]) / period


def calculate_all(candles: list) -> dict:
    """Calculate all indicators from OHLCV candle list.

    Each candle: [timestamp, open, high, low, close, volume]
    Returns a flat dict with all latest indicator values.
    """
    closes = [c[4] for c in candles]
    highs = [c[2] for c in candles]
    lows = [c[3] for c in candles]
    volumes = [c[5] for c in candles]

    rsi_arr = calc_rsi(closes)
    macd_data = calc_macd(closes)
    bb = calc_bollinger(closes)
    sma20 = sma(closes, 20)
    sma50 = sma(closes, 50)
    ema12 = ema(closes, 12)
    ema26 = ema(closes, 26)
    vol_sma = sma(volumes, 20)
    atr = calc_atr(highs, lows, closes)

    current = closes[-1]
    prev = closes[-2] if len(closes) >= 2 else current

    return {
        "current_price": current,
        "price_change_pct": round((current - prev) / prev * 100, 4) if prev else 0,
        "rsi": round(rsi_arr[-1], 2) if rsi_arr[-1] is not None else 50,
        "macd": macd_data["macd"],
        "macd_signal": macd_data["signal"],
        "macd_histogram": macd_data["histogram"],
        "bb_upper": bb["upper"],
        "bb_middle": bb["middle"],
        "bb_lower": bb["lower"],
        "bb_position": bb["position"],
        "sma_20": round(sma20[-1], 2) if sma20[-1] is not None else current,
        "sma_50": round(sma50[-1], 2) if sma50[-1] is not None else current,
        "ema_12": round(ema12[-1], 2) if ema12[-1] is not None else current,
        "ema_26": round(ema26[-1], 2) if ema26[-1] is not None else current,
        "volume": volumes[-1] if volumes else 0,
        "volume_avg_20": round(vol_sma[-1], 2) if vol_sma[-1] is not None else 0,
        "atr": round(atr, 2),
    }


def format_recent_candles(candles: list, count: int = 10) -> str:
    """Format the most recent candles as text for LLM."""
    from datetime import datetime, timezone

    recent = candles[-count:]
    lines: list[str] = []
    for c in recent:
        dt = datetime.fromtimestamp(c[0] / 1000, tz=timezone.utc).strftime("%m-%d %H:%M")
        lines.append(
            f"  {dt}: O=₩{c[1]:,.0f} H=₩{c[2]:,.0f} L=₩{c[3]:,.0f} C=₩{c[4]:,.0f} V={c[5]:,.2f}"
        )
    return "\n".join(lines)
