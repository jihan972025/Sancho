"""Persistent JSON storage for auto-trading history and config."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

_config_dir = Path(os.environ.get("SANCHO_CONFIG_DIR", Path.home() / ".sancho"))
_data_file = _config_dir / "autotrading.json"


def _ensure_dir() -> None:
    _config_dir.mkdir(parents=True, exist_ok=True)


def _load_raw() -> dict:
    _ensure_dir()
    if _data_file.exists():
        try:
            return json.loads(_data_file.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return {}
    return {}


def _save_raw(data: dict) -> None:
    _ensure_dir()
    _data_file.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


# ── Trade History ──

def save_trade(trade: dict) -> None:
    """Append a completed trade record."""
    data = _load_raw()
    trades = data.get("trades", [])
    trades.insert(0, trade)
    data["trades"] = trades
    _save_raw(data)


def get_trades(limit: int = 100, from_date: str = "", to_date: str = "") -> list[dict]:
    """Return most-recent-first trade records, optionally filtered by date range.

    from_date / to_date are ISO-date strings like '2025-01-15'.
    Filtering uses `exit_time` field.
    """
    data = _load_raw()
    trades = data.get("trades", [])

    if from_date or to_date:
        filtered = []
        for t in trades:
            exit_day = t.get("exit_time", "")[:10]  # 'YYYY-MM-DD'
            if from_date and exit_day < from_date:
                continue
            if to_date and exit_day > to_date:
                continue
            filtered.append(t)
        trades = filtered

    return trades[:limit]


def get_today_trades() -> list[dict]:
    """Return trades executed today (UTC)."""
    from datetime import datetime, timezone

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    all_trades = _load_raw().get("trades", [])
    return [t for t in all_trades if t.get("exit_time", "").startswith(today)]


# ── Config ──

def save_trading_config(config: dict) -> None:
    data = _load_raw()
    data["config"] = config
    _save_raw(data)


def get_trading_config() -> dict:
    data = _load_raw()
    return data.get("config", {})
