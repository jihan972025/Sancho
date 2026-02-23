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


def update_trade(trade_id: str, updated: dict) -> None:
    """Update an existing trade record by id (e.g. open BUY → closed with SELL data)."""
    data = _load_raw()
    trades = data.get("trades", [])
    for i, t in enumerate(trades):
        if t.get("id") == trade_id:
            trades[i] = updated
            break
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
            # For open trades (no exit_time), use entry_time for filtering
            date_field = t.get("exit_time") or t.get("entry_time", "")
            day = date_field[:10]  # 'YYYY-MM-DD'
            if from_date and day < from_date:
                continue
            if to_date and day > to_date:
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


# ── Trade Notifications ──

_MAX_NOTIFICATIONS = 100


def add_trade_notification(notif: dict) -> None:
    """Queue a trade notification for Electron to deliver to chat apps."""
    data = _load_raw()
    notifications = data.get("notifications", [])
    notifications.insert(0, notif)
    data["notifications"] = notifications[:_MAX_NOTIFICATIONS]
    _save_raw(data)


def get_pending_trade_notifications() -> list[dict]:
    """Return undelivered trade notifications."""
    data = _load_raw()
    notifications = data.get("notifications", [])
    return [n for n in notifications if not n.get("delivered", False)]


def ack_trade_notifications(ids: list[str]) -> None:
    """Mark notifications as delivered and clean up old ones."""
    from datetime import datetime, timezone

    data = _load_raw()
    notifications = data.get("notifications", [])
    now = datetime.now(timezone.utc)
    id_set = set(ids)
    updated = []
    for n in notifications:
        if n.get("id") in id_set:
            n["delivered"] = True
        # Auto-clean delivered notifications older than 24h
        if n.get("delivered", False):
            try:
                created = datetime.fromisoformat(n["created_at"])
                if (now - created).total_seconds() > 86400:
                    continue
            except (ValueError, KeyError):
                pass
        updated.append(n)
    data["notifications"] = updated
    _save_raw(data)
