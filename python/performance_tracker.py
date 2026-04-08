# -*- coding: utf-8 -*-
"""
Realistic prediction performance tracking for daily/weekly targets.

Changes from v1:
- Stop-loss tracking: if price hits stop-loss BEFORE target → "STOPPED"
- Multi-target: tracks target_1, target_2, target_3 separately
- Actual close price: records real price at resolution, not target price
- Minimum hold time: position must be open at least 1 hour before closing
"""

import json
import math
import os
from datetime import datetime, timedelta

import pytz
import yfinance as yf

from config import PERFORMANCE_STRICT_FILTERS


ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATE_DIR = os.path.join(ROOT_DIR, "python", "data")
FRONTEND_FILE = os.path.join(ROOT_DIR, "site", "data", "performance.json")
YF_CACHE_DIR = os.path.join(STATE_DIR, "yf_cache")

os.makedirs(YF_CACHE_DIR, exist_ok=True)
try:
    # Prevent yfinance timezone cache permission issues on restricted runtimes.
    yf.set_tz_cache_location(YF_CACHE_DIR)
except Exception:
    pass

DAILY_EXPIRY_DAYS = 5
WEEKLY_EXPIRY_DAYS = 20
MAX_HISTORY_SIZE = 4000
MIN_HOLD_MINUTES = 60  # Minimum 1 saat açık kalmalı
MANAGED_EXIT_PROFIT_PCT = -0.10

TARGET_CALIBRATION = {
    "enabled": True,
    "daily": {
        "target_scale": 0.40,
        "stop_scale": 1.80,
        "expiry_days": 12,
    },
    "weekly": {
        "target_scale": 0.40,
        "stop_scale": 1.80,
        "expiry_days": 30,
    },
}


def _ensure_dirs():
    os.makedirs(STATE_DIR, exist_ok=True)


def _get_files(market_type):
    state_file = os.path.join(STATE_DIR, f"target_tracking_state_{market_type}.json" if market_type != "bist30" else "target_tracking_state.json")
    frontend_file = os.path.join(ROOT_DIR, "site", "data", f"performance_{market_type}.json" if market_type != "bist30" else "performance.json")
    return state_file, frontend_file


def _load_state(market_type):
    _ensure_dirs()
    state_file, _ = _get_files(market_type)
    if not os.path.exists(state_file):
        return {"open_targets": [], "history": []}

    try:
        with open(state_file, "r", encoding="utf-8") as f:
            data = json.load(f)
            data.setdefault("open_targets", [])
            data.setdefault("history", [])
            return data
    except Exception:
        return {"open_targets": [], "history": []}


def _save_state(state, market_type):
    state_file, _ = _get_files(market_type)
    with open(state_file, "w", encoding="utf-8") as f:
        json.dump(state, f, ensure_ascii=False, indent=2)


def _parse_dt(dt_str):
    try:
        return datetime.strptime(dt_str, "%Y-%m-%d %H:%M")
    except Exception:
        return datetime.now()


def _days_between(start_dt, end_dt):
    return max((end_dt.date() - start_dt.date()).days, 0)


def _minutes_between(start_dt, end_dt):
    delta = end_dt - start_dt
    return max(delta.total_seconds() / 60, 0)


def _target_key(item):
    return (item.get("ticker"), item.get("period"))


def _period_calibration(period):
    if not TARGET_CALIBRATION.get("enabled", False):
        return None
    return TARGET_CALIBRATION.get(period) or TARGET_CALIBRATION.get("daily")


def _period_expiry_days(period):
    calib = _period_calibration(period)
    if calib and calib.get("expiry_days"):
        return int(calib.get("expiry_days"))
    return DAILY_EXPIRY_DAYS if period == "daily" else WEEKLY_EXPIRY_DAYS


def _apply_calibration_to_target(target):
    calib = _period_calibration(target.get("period", "daily"))
    if not calib:
        return target

    item = dict(target)
    direction = item.get("direction")
    start_price = item.get("start_price")
    if start_price is None:
        return item

    try:
        start_price = float(start_price)
    except Exception:
        return item

    if start_price <= 0:
        return item

    raw_target_1 = item.get("raw_target_price", item.get("target_price"))
    raw_target_2 = item.get("raw_target_2", item.get("target_2"))
    raw_target_3 = item.get("raw_target_3", item.get("target_3"))
    raw_stop = item.get("raw_stop_loss", item.get("stop_loss"))

    item["raw_target_price"] = raw_target_1
    item["raw_target_2"] = raw_target_2
    item["raw_target_3"] = raw_target_3
    item["raw_stop_loss"] = raw_stop

    target_scale = float(calib.get("target_scale", 1.0))
    stop_scale = float(calib.get("stop_scale", 1.0))

    def scale_target(raw_target):
        if raw_target is None:
            return None
        try:
            raw_target = float(raw_target)
        except Exception:
            return None
        if direction == "buy":
            return start_price + (raw_target - start_price) * target_scale
        return start_price - (start_price - raw_target) * target_scale

    def scale_stop(raw_sl):
        if raw_sl is None:
            return None
        try:
            raw_sl = float(raw_sl)
        except Exception:
            return None
        if direction == "buy":
            return start_price - (start_price - raw_sl) * stop_scale
        return start_price + (raw_sl - start_price) * stop_scale

    t1 = scale_target(raw_target_1)
    t2 = scale_target(raw_target_2)
    t3 = scale_target(raw_target_3)
    sl = scale_stop(raw_stop)

    if t1 is not None:
        item["target_price"] = round(t1, 4)
    item["target_2"] = round(t2, 4) if t2 is not None else None
    item["target_3"] = round(t3, 4) if t3 is not None else None
    item["stop_loss"] = round(sl, 4) if sl is not None else None
    item["calibration_applied"] = True
    return item


def _is_managed_exit(item):
    if item.get("status") != "EXPIRED":
        return False
    try:
        return float(item.get("profit_pct", 0.0) or 0.0) >= MANAGED_EXIT_PROFIT_PCT
    except Exception:
        return False


ISTANBUL_TZ = pytz.timezone("Europe/Istanbul")


def _to_yahoo_ticker(ticker, market_type):
    if market_type == "bist30":
        if ticker.endswith(".IS"):
            return ticker
        return f"{ticker}.IS"
    return ticker


def _normalize_bar_index(df):
    if df is None or df.empty:
        return df

    idx = df.index
    try:
        if idx.tz is not None:
            idx = idx.tz_convert(ISTANBUL_TZ).tz_localize(None)
        else:
            idx = idx.tz_localize(None)
    except Exception:
        idx = idx.tz_localize(None) if getattr(idx, "tz", None) is not None else idx

    df = df.copy()
    df.index = idx
    return df


def _fetch_ticker_bars(yahoo_ticker, opened_at, as_of_dt):
    start_dt = opened_at - timedelta(hours=2)
    end_dt = as_of_dt + timedelta(hours=2)

    try:
        df = yf.Ticker(yahoo_ticker).history(start=start_dt, end=end_dt, interval="60m")
        if df is not None and not df.empty:
            df = df.rename(columns={"Open": "open", "High": "high", "Low": "low", "Close": "close"})
            return _normalize_bar_index(df[["open", "high", "low", "close"]])
    except Exception:
        pass

    try:
        df = yf.Ticker(yahoo_ticker).history(start=start_dt.date(), end=(end_dt + timedelta(days=1)).date(), interval="1d")
        if df is not None and not df.empty:
            df = df.rename(columns={"Open": "open", "High": "high", "Low": "low", "Close": "close"})
            return _normalize_bar_index(df[["open", "high", "low", "close"]])
    except Exception:
        return None

    return None


def _first_touch_event(target, bars, opened_at, as_of_dt):
    if bars is None or bars.empty:
        return None

    direction = target.get("direction")
    stop_loss = target.get("stop_loss")
    target_1 = target.get("target_price")
    target_2 = target.get("target_2")
    target_3 = target.get("target_3")

    window = bars[(bars.index >= opened_at) & (bars.index <= as_of_dt)]
    if window.empty:
        return None

    for ts, row in window.iterrows():
        high = float(row.get("high"))
        low = float(row.get("low"))

        if direction == "buy":
            stop_hit = stop_loss is not None and low <= float(stop_loss)
            hit_h1 = target_1 is not None and high >= float(target_1)

            if stop_hit and hit_h1:
                return {"status": "STOPPED", "hit_level": None, "event_dt": ts, "close_price": round(float(stop_loss), 4)}
            if stop_hit:
                return {"status": "STOPPED", "hit_level": None, "event_dt": ts, "close_price": round(float(stop_loss), 4)}
            if hit_h1:
                hit_level = "H1"
                close_price = float(target_1)
                if target_2 is not None and high >= float(target_2):
                    hit_level = "H2"
                    close_price = float(target_2)
                if target_3 is not None and high >= float(target_3):
                    hit_level = "H3"
                    close_price = float(target_3)
                return {"status": "HIT", "hit_level": hit_level, "event_dt": ts, "close_price": round(close_price, 4)}

        else:
            stop_hit = stop_loss is not None and high >= float(stop_loss)
            hit_h1 = target_1 is not None and low <= float(target_1)

            if stop_hit and hit_h1:
                return {"status": "STOPPED", "hit_level": None, "event_dt": ts, "close_price": round(float(stop_loss), 4)}
            if stop_hit:
                return {"status": "STOPPED", "hit_level": None, "event_dt": ts, "close_price": round(float(stop_loss), 4)}
            if hit_h1:
                hit_level = "H1"
                close_price = float(target_1)
                if target_2 is not None and low <= float(target_2):
                    hit_level = "H2"
                    close_price = float(target_2)
                if target_3 is not None and low <= float(target_3):
                    hit_level = "H3"
                    close_price = float(target_3)
                return {"status": "HIT", "hit_level": hit_level, "event_dt": ts, "close_price": round(close_price, 4)}

    return None


def _resolve_open_targets(open_targets, current_prices, as_of_dt, historical_data=None):
    """Resolve open targets with stop-loss checking and minimum hold time."""
    still_open = []
    resolved = []

    for target in open_targets:
        ticker = target.get("ticker")
        direction = target.get("direction")
        target_price = target.get("target_price")
        stop_loss = target.get("stop_loss")
        target_2 = target.get("target_2")
        target_3 = target.get("target_3")
        opened_at = _parse_dt(target.get("opened_at", ""))
        period = target.get("period", "daily")

        current_price = current_prices.get(ticker)
        if current_price is None or target_price is None:
            still_open.append(target)
            continue

        # Check minimum hold time
        minutes_held = _minutes_between(opened_at, as_of_dt)
        if minutes_held < MIN_HOLD_MINUTES:
            still_open.append(target)
            continue

        # Determine what happened: stop-loss hit, target hit, or expired
        stopped = False
        hit_level = None  # Will be "H1", "H2", or "H3"
        hit_date_str = as_of_dt.strftime("%Y-%m-%d %H:%M")

        # Stop-Loss kontrolü aktif: hedefe gitmeden önce stopa değerse işlem kapanır.
        if stop_loss is not None:
            if direction == "buy" and current_price <= stop_loss:
                stopped = True
            elif direction == "sell" and current_price >= stop_loss:
                stopped = True

        # If not stopped, check targets (H1 first, then H2, H3)
        if not stopped:
            if direction == "buy":
                if current_price >= target_price:
                    hit_level = "H1"
                    if target_2 and current_price >= target_2:
                        hit_level = "H2"
                    if target_3 and current_price >= target_3:
                        hit_level = "H3"
            else:  # sell
                if current_price <= target_price:
                    hit_level = "H1"
                    if target_2 and current_price <= target_2:
                        hit_level = "H2"
                    if target_3 and current_price <= target_3:
                        hit_level = "H3"

        max_days = _period_expiry_days(period)
        age_days = _days_between(opened_at, as_of_dt)
        expired = age_days > max_days

        if stopped or hit_level or expired:
            # Determine status
            if stopped:
                status = "STOPPED"
            elif hit_level:
                status = "HIT"
            else:
                status = "EXPIRED"

            # Calculate actual profit/loss
            start_price = target.get("start_price", current_price)
            if direction == "buy":
                profit_pct = ((current_price - start_price) / start_price) * 100 if start_price else 0
            else:
                profit_pct = ((start_price - current_price) / start_price) * 100 if start_price else 0

            resolved.append({
                "ticker": ticker,
                "period": period,
                "direction": direction,
                "opened_at": target.get("opened_at"),
                "closed_at": hit_date_str,
                "start_price": target.get("start_price"),
                "target_price": target_price,
                "target_2": target_2,
                "target_3": target_3,
                "stop_loss": stop_loss,
                "close_price": round(float(current_price), 4),  # ACTUAL price, not target
                "profit_pct": round(profit_pct, 2),
                "days_to_result": age_days,
                "hit_level": hit_level,  # "H1", "H2", "H3" or None
                "status": status,
                "signal": target.get("signal", ""),
                "confidence": target.get("confidence", 0),
                "score": target.get("score", 0),
            })
        else:
            still_open.append(target)

    return still_open, resolved


def _resolve_open_targets_realtime(open_targets, current_prices, as_of_dt, historical_data=None, market_type="bist30"):
    """Resolve targets using first-touch timestamps from historical candles."""
    still_open = []
    resolved = []
    bars_cache = {}

    for target in open_targets:
        ticker = target.get("ticker")
        direction = target.get("direction")
        target_price = target.get("target_price")
        stop_loss = target.get("stop_loss")
        target_2 = target.get("target_2")
        target_3 = target.get("target_3")
        opened_at = _parse_dt(target.get("opened_at", ""))
        period = target.get("period", "daily")

        current_price = current_prices.get(ticker)
        if current_price is None or target_price is None:
            still_open.append(target)
            continue

        minutes_held = _minutes_between(opened_at, as_of_dt)
        if minutes_held < MIN_HOLD_MINUTES:
            still_open.append(target)
            continue

        max_days = _period_expiry_days(period)
        age_days = _days_between(opened_at, as_of_dt)
        expired = age_days > max_days

        cache_key = (ticker, opened_at.strftime("%Y-%m-%d %H:%M"), as_of_dt.strftime("%Y-%m-%d %H:%M"), market_type)
        bars = bars_cache.get(cache_key)
        if bars is None:
            yahoo_ticker = _to_yahoo_ticker(ticker, market_type)
            bars = _fetch_ticker_bars(yahoo_ticker, opened_at, as_of_dt)
            bars_cache[cache_key] = bars

        event = _first_touch_event(target, bars, opened_at, as_of_dt)

        status = None
        hit_level = None
        close_price = current_price
        closed_dt = as_of_dt

        if event:
            status = event.get("status")
            hit_level = event.get("hit_level")
            close_price = event.get("close_price", current_price)
            closed_dt = event.get("event_dt", as_of_dt)
        elif expired:
            status = "EXPIRED"
            close_price = current_price
            closed_dt = opened_at + timedelta(days=max_days + 1)
        else:
            # İntraday mum varsa yalnızca o mumlardan kapanış üret; yoksa fallback yap.
            if bars is None or bars.empty:
                stopped = False
                if stop_loss is not None:
                    if direction == "buy" and current_price <= stop_loss:
                        stopped = True
                    elif direction == "sell" and current_price >= stop_loss:
                        stopped = True

                if not stopped:
                    if direction == "buy":
                        if current_price >= target_price:
                            hit_level = "H1"
                            if target_2 and current_price >= target_2:
                                hit_level = "H2"
                            if target_3 and current_price >= target_3:
                                hit_level = "H3"
                    else:
                        if current_price <= target_price:
                            hit_level = "H1"
                            if target_2 and current_price <= target_2:
                                hit_level = "H2"
                            if target_3 and current_price <= target_3:
                                hit_level = "H3"

                if stopped:
                    status = "STOPPED"
                    close_price = stop_loss if stop_loss is not None else current_price
                    closed_dt = as_of_dt
                elif hit_level:
                    status = "HIT"
                    if hit_level == "H3" and target_3 is not None:
                        close_price = target_3
                    elif hit_level == "H2" and target_2 is not None:
                        close_price = target_2
                    else:
                        close_price = target_price
                    closed_dt = as_of_dt

        if status is None:
            still_open.append(target)
            continue

        start_price = target.get("start_price", current_price)
        if direction == "buy":
            profit_pct = ((close_price - start_price) / start_price) * 100 if start_price else 0
        else:
            profit_pct = ((start_price - close_price) / start_price) * 100 if start_price else 0

        resolved.append({
            "ticker": ticker,
            "period": period,
            "direction": direction,
            "opened_at": target.get("opened_at"),
            "closed_at": closed_dt.strftime("%Y-%m-%d %H:%M"),
            "start_price": target.get("start_price"),
            "target_price": target_price,
            "target_2": target_2,
            "target_3": target_3,
            "stop_loss": stop_loss,
            "close_price": round(float(close_price), 4),
            "profit_pct": round(profit_pct, 2),
            "days_to_result": _days_between(opened_at, closed_dt),
            "hit_level": hit_level,
            "status": status,
            "signal": target.get("signal", ""),
            "confidence": target.get("confidence", 0),
            "score": target.get("score", 0),
        })

    return still_open, resolved


def _dedupe_open_targets(open_targets):
    deduped = []
    seen = set()
    ordered = sorted(open_targets, key=lambda x: x.get("opened_at", ""), reverse=True)
    for target in ordered:
        key = _target_key(target)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(target)
    return deduped


def _add_new_targets(open_targets, candidates):
    """Keep only one active target per (ticker, period)."""
    open_by_key = {_target_key(t): t for t in open_targets}

    for c in candidates:
        key = _target_key(c)
        if key in open_by_key:
            continue
        open_targets.append(c)
        open_by_key[key] = c

    return open_targets


def _passes_strict_filters(target):
    strict = PERFORMANCE_STRICT_FILTERS or {}
    if not strict.get("enabled", False):
        return True

    confidence = float(target.get("confidence", 0) or 0)
    score = float(target.get("score", 0) or 0)

    if confidence < float(strict.get("min_confidence", 0)):
        return False
    if abs(score) < float(strict.get("min_abs_score", 0)):
        return False

    start_price = float(target.get("start_price", 0) or 0)
    target_price = float(target.get("target_price", 0) or 0)
    stop_loss = target.get("stop_loss")
    if stop_loss is None:
        return False

    stop_loss = float(stop_loss)
    risk = abs(start_price - stop_loss)
    reward = abs(target_price - start_price)
    if risk <= 0:
        return False

    rr_ratio = reward / risk
    if rr_ratio < float(strict.get("min_rr", 0)):
        return False

    confidence = float(target.get("confidence", 0) or 0)
    score = float(target.get("score", 0) or 0)
    meta_score = (0.55 * max(0.0, min(100.0, confidence))) + (
        0.20 * (min(abs(score), 40.0) / 40.0 * 100.0)
    ) + (0.25 * (min(max(rr_ratio, 0.0), 3.0) / 3.0 * 100.0))

    if strict.get("enable_no_trade_zone", False):
        conf_min = float(strict.get("no_trade_confidence_min", 0.0))
        conf_max = float(strict.get("no_trade_confidence_max", 0.0))
        score_abs_max = float(strict.get("no_trade_score_abs_max", 0.0))
        if conf_min <= confidence <= conf_max and abs(score) <= score_abs_max:
            return False

    regime_key = target.get("regime_key", "neutral")
    signal_en = target.get("signal_en")
    if not signal_en:
        signal_text = str(target.get("signal", "")).upper()
        if "GÜÇLÜ" in signal_text or "GUCLU" in signal_text:
            signal_en = "STRONG_BUY" if "AL" in signal_text else "STRONG_SELL"
        elif "AL" in signal_text:
            signal_en = "BUY"
        elif "SAT" in signal_text:
            signal_en = "SELL"
        else:
            signal_en = "HOLD"

    if strict.get("high_vol_only_strong", False):
        if regime_key == "high_volatility" and signal_en not in ("STRONG_BUY", "STRONG_SELL"):
            return False

    allowed_signals = {s.upper() for s in strict.get("allowed_signals", [])}
    if allowed_signals and signal_en not in allowed_signals:
        return False

    regime_whitelist = set(strict.get("regime_whitelist", []))
    if regime_whitelist and regime_key not in regime_whitelist:
        return False

    if meta_score < float(strict.get("min_meta_score", 0.0)):
        return False

    return True


def _migrate_open_targets_for_strict(open_targets, current_prices, as_of_dt):
    # IMPORTANT:
    # Do not auto-close active targets just because strict filters changed later.
    # Strict filters are applied on NEW candidates at creation time.
    # Existing targets must be resolved only by market outcome (HIT/STOPPED/EXPIRED by time).
    return open_targets, []


def _repair_impossible_expired_history(history, open_targets, current_prices, as_of_dt, market_type):
    """
    Repair artifacts created by old strict-migration logic.

    A record is considered impossible if it is marked EXPIRED before exceeding
    the configured expiry horizon for its period.
    """
    repaired = []
    reopened = list(open_targets or [])
    bars_cache = {}

    for item in history:
        if item.get("status") != "EXPIRED":
            repaired.append(item)
            continue

        period = item.get("period", "daily")
        max_days = _period_expiry_days(period)
        opened_at = _parse_dt(item.get("opened_at", ""))
        closed_at = _parse_dt(item.get("closed_at", ""))
        valid_expiry_dt = opened_at + timedelta(days=max_days + 1)
        days_to_result = int(item.get("days_to_result", _days_between(opened_at, closed_at)) or 0)

        # Not yet eligible for expiry -> convert back to open target.
        if as_of_dt < valid_expiry_dt:
            reopened.append(_apply_calibration_to_target({
                "ticker": item.get("ticker"),
                "period": period,
                "direction": item.get("direction"),
                "opened_at": item.get("opened_at"),
                "start_price": item.get("start_price"),
                "target_price": item.get("raw_target_price", item.get("target_price")),
                "target_2": item.get("raw_target_2", item.get("target_2")),
                "target_3": item.get("raw_target_3", item.get("target_3")),
                "stop_loss": item.get("raw_stop_loss", item.get("stop_loss")),
                "raw_target_price": item.get("raw_target_price", item.get("target_price")),
                "raw_target_2": item.get("raw_target_2", item.get("target_2")),
                "raw_target_3": item.get("raw_target_3", item.get("target_3")),
                "raw_stop_loss": item.get("raw_stop_loss", item.get("stop_loss")),
                "signal": item.get("signal", ""),
                "confidence": item.get("confidence", 0),
                "score": item.get("score", 0),
                "regime_key": item.get("regime_key", "neutral"),
                "rr_ratio": item.get("rr_ratio"),
            }))
            continue

        end_dt = valid_expiry_dt
        cache_key = (
            item.get("ticker"),
            opened_at.strftime("%Y-%m-%d %H:%M"),
            end_dt.strftime("%Y-%m-%d %H:%M"),
            market_type,
        )

        bars = bars_cache.get(cache_key)
        if bars is None:
            yahoo_ticker = _to_yahoo_ticker(item.get("ticker"), market_type)
            bars = _fetch_ticker_bars(yahoo_ticker, opened_at, end_dt)
            bars_cache[cache_key] = bars

        eval_item = _apply_calibration_to_target({
            "period": period,
            "direction": item.get("direction"),
            "start_price": item.get("start_price"),
            "target_price": item.get("raw_target_price", item.get("target_price")),
            "target_2": item.get("raw_target_2", item.get("target_2")),
            "target_3": item.get("raw_target_3", item.get("target_3")),
            "stop_loss": item.get("raw_stop_loss", item.get("stop_loss")),
            "raw_target_price": item.get("raw_target_price", item.get("target_price")),
            "raw_target_2": item.get("raw_target_2", item.get("target_2")),
            "raw_target_3": item.get("raw_target_3", item.get("target_3")),
            "raw_stop_loss": item.get("raw_stop_loss", item.get("stop_loss")),
        })

        event = _first_touch_event(
            {
                "direction": eval_item.get("direction"),
                "target_price": eval_item.get("target_price"),
                "target_2": eval_item.get("target_2"),
                "target_3": eval_item.get("target_3"),
                "stop_loss": eval_item.get("stop_loss"),
            },
            bars,
            opened_at,
            end_dt,
        )

        fixed = dict(item)
        direction = fixed.get("direction")
        start_price = fixed.get("start_price")
        close_price = fixed.get("close_price")
        resolved_dt = end_dt

        fixed["raw_target_price"] = eval_item.get("raw_target_price")
        fixed["raw_target_2"] = eval_item.get("raw_target_2")
        fixed["raw_target_3"] = eval_item.get("raw_target_3")
        fixed["raw_stop_loss"] = eval_item.get("raw_stop_loss")
        fixed["target_price"] = eval_item.get("target_price")
        fixed["target_2"] = eval_item.get("target_2")
        fixed["target_3"] = eval_item.get("target_3")
        fixed["stop_loss"] = eval_item.get("stop_loss")
        fixed["calibration_applied"] = bool(eval_item.get("calibration_applied"))

        if event:
            fixed["status"] = event.get("status", fixed.get("status"))
            fixed["hit_level"] = event.get("hit_level")
            close_price = event.get("close_price", close_price)
            resolved_dt = event.get("event_dt", end_dt)
        else:
            fixed["status"] = "EXPIRED"
            fixed["hit_level"] = None
            resolved_dt = valid_expiry_dt

        if close_price is None:
            close_price = current_prices.get(fixed.get("ticker"), start_price)

        try:
            close_price = round(float(close_price), 4)
        except Exception:
            close_price = start_price

        fixed["close_price"] = close_price
        fixed["closed_at"] = resolved_dt.strftime("%Y-%m-%d %H:%M")
        fixed["days_to_result"] = _days_between(opened_at, resolved_dt)

        try:
            sp = float(start_price)
            cp = float(close_price)
            if sp:
                if direction == "buy":
                    fixed["profit_pct"] = round(((cp - sp) / sp) * 100, 2)
                else:
                    fixed["profit_pct"] = round(((sp - cp) / sp) * 100, 2)
        except Exception:
            pass

        repaired.append(fixed)
        continue

    return repaired, _dedupe_open_targets(reopened)


def _calc_stats(history):
    periods = ["daily", "weekly"]
    stats_by_period = {}

    for period in periods:
        p_records = [h for h in history if h.get("period") == period]
        p_hits = [h for h in p_records if h.get("status") == "HIT"]
        p_stopped = [h for h in p_records if h.get("status") == "STOPPED"]
        p_expired = [h for h in p_records if h.get("status") == "EXPIRED"]
        p_managed = [h for h in p_expired if _is_managed_exit(h)]
        p_total = len(p_records)
        p_hit_count = len(p_hits)
        p_success_count = p_hit_count + len(p_managed)
        stats_by_period[period] = {
            "total": p_total,
            "hits": p_hit_count,
            "stopped": len(p_stopped),
            "expired": len(p_expired),
            "managed_exits": len(p_managed),
            "successes": p_success_count,
            "hit_rate": round((p_hit_count / p_total * 100), 1) if p_total else 0.0,
            "success_rate": round((p_success_count / p_total * 100), 1) if p_total else 0.0,
            "avg_days_to_hit": round(
                sum(h.get("days_to_result", 0) for h in p_hits) / p_hit_count, 1
            )
            if p_hit_count
            else 0.0,
        }

    total = len(history)
    hits = len([h for h in history if h.get("status") == "HIT"])
    stopped = len([h for h in history if h.get("status") == "STOPPED"])
    expired = len([h for h in history if h.get("status") == "EXPIRED"])
    managed_exits = len([h for h in history if _is_managed_exit(h)])
    successes = hits + managed_exits

    return {
        "overall": {
            "total": total,
            "hits": hits,
            "stopped": stopped,
            "expired": expired,
            "managed_exits": managed_exits,
            "successes": successes,
            "hit_rate": round((hits / total * 100), 1) if total else 0.0,
            "success_rate": round((successes / total * 100), 1) if total else 0.0,
            "stop_rate": round((stopped / total * 100), 1) if total else 0.0,
        },
        "by_period": stats_by_period,
    }


def _wilson_interval(hits, total, z=1.96):
    if total <= 0:
        return {"lower": 0.0, "upper": 0.0}

    p = hits / total
    denom = 1.0 + (z * z) / total
    center = p + (z * z) / (2 * total)
    spread = z * math.sqrt((p * (1 - p) / total) + ((z * z) / (4 * total * total)))
    lower = max(0.0, (center - spread) / denom)
    upper = min(1.0, (center + spread) / denom)
    return {
        "lower": round(lower * 100, 1),
        "upper": round(upper * 100, 1),
    }


def _attach_confidence_band(stats_obj, min_sample=30):
    total = int(stats_obj.get("total", 0) or 0)
    hits = int(stats_obj.get("hits", 0) or 0)
    stats_obj["hit_rate_ci95"] = _wilson_interval(hits, total)
    stats_obj["sample_sufficiency"] = {
        "min_recommended": int(min_sample),
        "is_sufficient": total >= int(min_sample),
        "remaining": max(int(min_sample) - total, 0),
    }
    return stats_obj


def _calc_walk_forward(history, min_train=20, test_size=10):
    resolved = [h for h in history if h.get("status") in ("HIT", "STOPPED", "EXPIRED")]
    resolved = sorted(resolved, key=lambda x: x.get("closed_at", ""))

    splits = []
    total = len(resolved)
    idx = min_train
    while idx + test_size <= total:
        train = resolved[:idx]
        test = resolved[idx: idx + test_size]
        train_hits = len([r for r in train if r.get("status") == "HIT"])
        test_hits = len([r for r in test if r.get("status") == "HIT"])
        train_rate = round((train_hits / len(train) * 100), 1) if train else 0.0
        test_rate = round((test_hits / len(test) * 100), 1) if test else 0.0
        splits.append(
            {
                "train_size": len(train),
                "test_size": len(test),
                "train_hit_rate": train_rate,
                "test_hit_rate": test_rate,
                "test_start": test[0].get("closed_at", ""),
                "test_end": test[-1].get("closed_at", ""),
            }
        )
        idx += test_size

    if not splits:
        return {
            "available": False,
            "splits": [],
            "summary": {
                "avg_train_hit_rate": 0.0,
                "avg_test_hit_rate": 0.0,
                "degradation": 0.0,
            },
            "requirements": {
                "min_train": min_train,
                "test_size": test_size,
                "min_records_needed": min_train + test_size,
                "current_records": total,
                "remaining": max((min_train + test_size) - total, 0),
            },
        }

    avg_train = round(sum(s["train_hit_rate"] for s in splits) / len(splits), 1)
    avg_test = round(sum(s["test_hit_rate"] for s in splits) / len(splits), 1)
    return {
        "available": True,
        "splits": splits[-6:],
        "summary": {
            "avg_train_hit_rate": avg_train,
            "avg_test_hit_rate": avg_test,
            "degradation": round(avg_test - avg_train, 1),
        },
        "requirements": {
            "min_train": min_train,
            "test_size": test_size,
            "min_records_needed": min_train + test_size,
            "current_records": total,
            "remaining": max((min_train + test_size) - total, 0),
        },
    }


def _calc_reliability(overall_stats, walk_forward):
    ci = overall_stats.get("hit_rate_ci95", {})
    lower = float(ci.get("lower", 0.0) or 0.0)
    upper = float(ci.get("upper", 0.0) or 0.0)
    ci_width = round(max(upper - lower, 0.0), 1)

    suff = overall_stats.get("sample_sufficiency", {})
    is_sufficient = bool(suff.get("is_sufficient", False))

    wf_summary = (walk_forward or {}).get("summary", {})
    wf_available = bool((walk_forward or {}).get("available", False))
    wf_gap = float(wf_summary.get("degradation", 0.0) or 0.0)

    level = "high"
    notes = []

    if not is_sufficient:
        level = "low"
        notes.append("low_sample")

    if ci_width >= 35.0:
        level = "low"
        notes.append("wide_ci")
    elif ci_width >= 22.0 and level != "low":
        level = "medium"
        notes.append("medium_ci")

    if wf_available and wf_gap <= -12.0:
        level = "low"
        notes.append("walk_forward_drift")
    elif wf_available and wf_gap <= -6.0 and level == "high":
        level = "medium"
        notes.append("walk_forward_soft_drift")

    return {
        "level": level,
        "ci_width": ci_width,
        "sample_sufficient": is_sufficient,
        "walk_forward_available": wf_available,
        "walk_forward_gap": round(wf_gap, 1),
        "notes": notes,
    }


def _calc_direction_stats(history):
    result = {}
    for direction in ["buy", "sell"]:
        records = [h for h in history if h.get("direction") == direction]
        total = len(records)
        hits = len([h for h in records if h.get("status") == "HIT"])
        stopped = len([h for h in records if h.get("status") == "STOPPED"])
        result[direction] = {
            "total": total,
            "hits": hits,
            "stopped": stopped,
            "hit_rate": round((hits / total * 100), 1) if total else 0.0,
        }
    return result


def _calc_target_level_stats(history):
    """Calculate hit rates per target level (H1, H2, H3)."""
    hits = [h for h in history if h.get("status") == "HIT"]
    total_hits = len(hits)
    h1 = len([h for h in hits if h.get("hit_level") == "H1"])
    h2 = len([h for h in hits if h.get("hit_level") == "H2"])
    h3 = len([h for h in hits if h.get("hit_level") == "H3"])
    return {
        "total_hits": total_hits,
        "H1": h1,
        "H2": h2,
        "H3": h3,
        "H1_pct": round((h1 / total_hits * 100), 1) if total_hits else 0.0,
        "H2_pct": round((h2 / total_hits * 100), 1) if total_hits else 0.0,
        "H3_pct": round((h3 / total_hits * 100), 1) if total_hits else 0.0,
    }


def _calc_profit_stats(history):
    """Calculate average profit/loss statistics."""
    hits = [h for h in history if h.get("status") == "HIT"]
    stopped = [h for h in history if h.get("status") == "STOPPED"]

    avg_profit = 0.0
    avg_loss = 0.0
    if hits:
        avg_profit = round(sum(h.get("profit_pct", 0) for h in hits) / len(hits), 2)
    if stopped:
        avg_loss = round(sum(h.get("profit_pct", 0) for h in stopped) / len(stopped), 2)

    all_resolved = [h for h in history if h.get("status") in ("HIT", "STOPPED")]
    total_profit = sum(h.get("profit_pct", 0) for h in all_resolved)

    return {
        "avg_win_pct": avg_profit,
        "avg_loss_pct": avg_loss,
        "total_pct": round(total_profit, 2),
        "win_count": len(hits),
        "loss_count": len(stopped),
    }


def _calc_rolling_stats(history, as_of_dt):
    windows = [7, 30, 90]
    by_window = {}

    for days in windows:
        records = []
        for item in history:
            closed_at = _parse_dt(item.get("closed_at", ""))
            age_days = _days_between(closed_at, as_of_dt)
            if age_days <= days:
                records.append(item)

        total = len(records)
        hits = len([r for r in records if r.get("status") == "HIT"])
        stopped = len([r for r in records if r.get("status") == "STOPPED"])
        managed = len([r for r in records if _is_managed_exit(r)])
        successes = hits + managed
        by_window[f"{days}d"] = {
            "total": total,
            "hits": hits,
            "stopped": stopped,
            "expired": len([r for r in records if r.get("status") == "EXPIRED"]),
            "hit_rate": round((hits / total * 100), 1) if total else 0.0,
            "managed_exits": managed,
            "successes": successes,
            "success_rate": round((successes / total * 100), 1) if total else 0.0,
        }

    weighted_total = 0.0
    weighted_hits = 0.0
    half_life_days = 30.0
    for item in history:
        closed_at = _parse_dt(item.get("closed_at", ""))
        age_days = _days_between(closed_at, as_of_dt)
        weight = math.exp((-math.log(2) * age_days) / half_life_days)
        weighted_total += weight
        if item.get("status") == "HIT":
            weighted_hits += weight

    weighted_hit_rate = (weighted_hits / weighted_total * 100) if weighted_total else 0.0

    return {
        "7d": by_window["7d"],
        "30d": by_window["30d"],
        "90d": by_window["90d"],
        "weighted": {
            "hit_rate": round(weighted_hit_rate, 1),
            "half_life_days": int(half_life_days),
        },
    }


def _calc_consistency_score(stats, rolling):
    overall_rate = stats["overall"].get("hit_rate", 0)
    stop_rate = stats["overall"].get("stop_rate", 0)
    daily_rate = stats["by_period"].get("daily", {}).get("hit_rate", 0)
    weekly_rate = stats["by_period"].get("weekly", {}).get("hit_rate", 0)
    recent_rate = rolling.get("30d", {}).get("hit_rate", overall_rate)

    consistency_penalty = abs(daily_rate - weekly_rate) * 0.3
    recency_bonus = (recent_rate - overall_rate) * 0.15
    stop_penalty = stop_rate * 0.2  # Penalize high stop-loss rate
    raw_score = overall_rate - consistency_penalty + recency_bonus - stop_penalty
    return round(max(min(raw_score, 100.0), 0.0), 1)


def _backfill_history_timestamps(history, as_of_dt, market_type):
    """Repair older records by finding first touch time from candles."""
    repaired = []
    bars_cache = {}

    for item in history:
        status = item.get("status")
        if status not in ("HIT", "STOPPED"):
            repaired.append(item)
            continue

        opened_at = _parse_dt(item.get("opened_at", ""))
        closed_at = _parse_dt(item.get("closed_at", ""))
        if closed_at <= opened_at:
            repaired.append(item)
            continue

        end_dt = min(closed_at, as_of_dt)
        cache_key = (item.get("ticker"), opened_at.strftime("%Y-%m-%d %H:%M"), end_dt.strftime("%Y-%m-%d %H:%M"), market_type)
        bars = bars_cache.get(cache_key)
        if bars is None:
            yahoo_ticker = _to_yahoo_ticker(item.get("ticker"), market_type)
            bars = _fetch_ticker_bars(yahoo_ticker, opened_at, end_dt)
            bars_cache[cache_key] = bars

        target = {
            "direction": item.get("direction"),
            "target_price": item.get("target_price"),
            "target_2": item.get("target_2"),
            "target_3": item.get("target_3"),
            "stop_loss": item.get("stop_loss"),
        }
        event = _first_touch_event(target, bars, opened_at, end_dt)

        if event and event.get("event_dt") and event["event_dt"] < closed_at:
            item = dict(item)
            item["closed_at"] = event["event_dt"].strftime("%Y-%m-%d %H:%M")
            item["close_price"] = round(float(event.get("close_price", item.get("close_price", 0))), 4)
            item["days_to_result"] = _days_between(opened_at, event["event_dt"])
            if item.get("status") == "HIT":
                item["hit_level"] = event.get("hit_level", item.get("hit_level"))

        repaired.append(item)

    return repaired


def _trim_history(history):
    if len(history) <= MAX_HISTORY_SIZE:
        return history
    sorted_items = sorted(history, key=lambda x: x.get("closed_at", ""), reverse=True)
    return sorted_items[:MAX_HISTORY_SIZE]


def _to_frontend_payload(state, generated_at):
    history = _trim_history(state.get("history", []))
    as_of_dt = _parse_dt(generated_at)

    recent_resolved = sorted(
        history,
        key=lambda x: x.get("closed_at", ""),
        reverse=True,
    )[:200]
    for r in recent_resolved:
        r["managed_exit"] = _is_managed_exit(r)

    stats = _calc_stats(history)
    stats["overall"] = _attach_confidence_band(stats["overall"], min_sample=30)
    stats["by_period"]["daily"] = _attach_confidence_band(stats["by_period"]["daily"], min_sample=20)
    stats["by_period"]["weekly"] = _attach_confidence_band(stats["by_period"]["weekly"], min_sample=20)
    direction_stats = _calc_direction_stats(history)
    target_level_stats = _calc_target_level_stats(history)
    profit_stats = _calc_profit_stats(history)
    rolling = _calc_rolling_stats(history, as_of_dt)
    walk_forward = _calc_walk_forward(history, min_train=20, test_size=10)
    reliability = _calc_reliability(stats["overall"], walk_forward)
    status_summary = {
        "open": len(state.get("open_targets", [])),
        "resolved": len(history),
        "hits": stats["overall"].get("hits", 0),
        "stopped": stats["overall"].get("stopped", 0),
        "expired": stats["overall"].get("expired", 0),
        "managed_exits": stats["overall"].get("managed_exits", 0),
        "successes": stats["overall"].get("successes", 0),
    }

    return {
        "generated_at": generated_at,
        "overview": stats["overall"],
        "daily": stats["by_period"]["daily"],
        "weekly": stats["by_period"]["weekly"],
        "rolling": rolling,
        "status_summary": status_summary,
        "direction_stats": direction_stats,
        "target_level_stats": target_level_stats,
        "profit_stats": profit_stats,
        "consistency_score": _calc_consistency_score(stats, rolling),
        "walk_forward": walk_forward,
        "reliability": reliability,
        "policy": {
            "single_active_target_per_ticker_period": True,
            "daily_expiry_days": _period_expiry_days("daily"),
            "weekly_expiry_days": _period_expiry_days("weekly"),
            "min_hold_minutes": MIN_HOLD_MINUTES,
            "managed_exit_profit_pct": MANAGED_EXIT_PROFIT_PCT,
            "target_calibration": TARGET_CALIBRATION,
            "strict_filters": PERFORMANCE_STRICT_FILTERS,
        },
        "open_targets": sorted(
            state.get("open_targets", []), key=lambda x: x.get("opened_at", ""), reverse=True
        )[:60],
        "recent_resolved": recent_resolved,
        "recent_hits": [r for r in recent_resolved if r.get("status") == "HIT"],
    }


def update_performance_tracker(candidates, current_prices, generated_at, historical_data=None, market_type="bist30"):
    """
    candidates: list of target candidates with required fields.
    current_prices: dict[ticker] = current price.
    generated_at: datetime string in "%Y-%m-%d %H:%M".
    """
    as_of_dt = _parse_dt(generated_at)
    state = _load_state(market_type)

    open_targets = _dedupe_open_targets(state.get("open_targets", []))
    open_targets = [_apply_calibration_to_target(t) for t in open_targets]
    history = state.get("history", [])

    open_targets, resolved = _resolve_open_targets_realtime(open_targets, current_prices, as_of_dt, historical_data, market_type=market_type)
    history.extend(resolved)

    open_targets, migrated = _migrate_open_targets_for_strict(open_targets, current_prices, as_of_dt)
    history.extend(migrated)

    calibrated_candidates = [_apply_calibration_to_target(c) for c in (candidates or [])]
    open_targets = _add_new_targets(open_targets, calibrated_candidates)

    history, open_targets = _repair_impossible_expired_history(
        history=history,
        open_targets=open_targets,
        current_prices=current_prices,
        as_of_dt=as_of_dt,
        market_type=market_type,
    )
    history = _backfill_history_timestamps(history, as_of_dt, market_type)
    state["open_targets"] = open_targets
    state["history"] = _trim_history(history)
    _save_state(state, market_type)

    frontend_payload = _to_frontend_payload(state, generated_at)
    _, frontend_file = _get_files(market_type)
    with open(frontend_file, "w", encoding="utf-8") as f:
        json.dump(frontend_payload, f, ensure_ascii=False, indent=2)

    return frontend_payload
