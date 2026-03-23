# -*- coding: utf-8 -*-
"""
Prediction performance tracking for daily/weekly targets.

This module stores open targets, resolves them when price reaches target,
and publishes a frontend-friendly performance.json file.
"""

import json
import math
import os
from datetime import datetime


ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATE_DIR = os.path.join(ROOT_DIR, "python", "data")
STATE_FILE = os.path.join(STATE_DIR, "target_tracking_state.json")
FRONTEND_FILE = os.path.join(ROOT_DIR, "site", "data", "performance.json")

DAILY_EXPIRY_DAYS = 5
WEEKLY_EXPIRY_DAYS = 20
MAX_HISTORY_SIZE = 4000


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


def _target_key(item):
    return (item.get("ticker"), item.get("period"))


def _resolve_open_targets(open_targets, current_prices, as_of_dt, historical_data=None):
    still_open = []
    resolved = []

    for target in open_targets:
        ticker = target.get("ticker")
        direction = target.get("direction")
        target_price = target.get("target_price")
        opened_at = _parse_dt(target.get("opened_at", ""))
        period = target.get("period", "daily")

        current_price = current_prices.get(ticker)
        if current_price is None or target_price is None:
            still_open.append(target)
            continue

        hit = False
        hit_date_str = as_of_dt.strftime("%Y-%m-%d %H:%M")

        # Geçmiş iğneleri (High/Low) kontrol et
        if historical_data and ticker in historical_data:
            df_dict = historical_data[ticker]
            if period in df_dict:
                df = df_dict[period]
                try:
                    # Açılış tarihinden sonraki (veya o günkü) verileri kontrol et
                    for idx, row in df.iterrows():
                        row_date = idx.date() if hasattr(idx, 'date') else idx
                        if not isinstance(row_date, str) and row_date >= opened_at.date():
                            if direction == "buy" and row.get("High", current_price) >= target_price:
                                hit = True
                                hit_date_str = idx.strftime("%Y-%m-%d %H:%M") if hasattr(idx, 'strftime') else str(idx)
                                break
                            elif direction == "sell" and row.get("Low", current_price) <= target_price:
                                hit = True
                                hit_date_str = idx.strftime("%Y-%m-%d %H:%M") if hasattr(idx, 'strftime') else str(idx)
                                break
                except Exception as e:
                    pass

        # Geçmişte vurmadıysa, şu anki (güncel) fiyatla son bir kez dene
        if not hit:
            if direction == "buy" and current_price >= target_price:
                hit = True
            elif direction == "sell" and current_price <= target_price:
                hit = True

        max_days = DAILY_EXPIRY_DAYS if period == "daily" else WEEKLY_EXPIRY_DAYS
        age_days = _days_between(opened_at, as_of_dt)
        expired = age_days > max_days

        if hit or expired:
            resolved.append(
                {
                    "ticker": ticker,
                    "period": period,
                    "direction": direction,
                    "opened_at": target.get("opened_at"),
                    "closed_at": hit_date_str if hit else as_of_dt.strftime("%Y-%m-%d %H:%M"),
                    "start_price": target.get("start_price"),
                    "target_price": target_price,
                    "close_price": round(float(target_price if hit else current_price), 4),
                    "days_to_result": age_days,
                    "status": "HIT" if hit else "EXPIRED",
                    "signal": target.get("signal", ""),
                    "confidence": target.get("confidence", 0),
                    "score": target.get("score", 0),
                }
            )
        else:
            still_open.append(target)

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


def _calc_stats(history):
    periods = ["daily", "weekly"]
    stats_by_period = {}

    for period in periods:
        p_records = [h for h in history if h.get("period") == period]
        p_hits = [h for h in p_records if h.get("status") == "HIT"]
        p_total = len(p_records)
        p_hit_count = len(p_hits)
        stats_by_period[period] = {
            "total": p_total,
            "hits": p_hit_count,
            "expired": len([h for h in p_records if h.get("status") == "EXPIRED"]),
            "hit_rate": round((p_hit_count / p_total * 100), 1) if p_total else 0.0,
            "avg_days_to_hit": round(
                sum(h.get("days_to_result", 0) for h in p_hits) / p_hit_count, 1
            )
            if p_hit_count
            else 0.0,
        }

    total = len(history)
    hits = len([h for h in history if h.get("status") == "HIT"])
    expired = len([h for h in history if h.get("status") == "EXPIRED"])

    return {
        "overall": {
            "total": total,
            "hits": hits,
            "expired": expired,
            "hit_rate": round((hits / total * 100), 1) if total else 0.0,
        },
        "by_period": stats_by_period,
    }


def _calc_direction_stats(history):
    result = {}
    for direction in ["buy", "sell"]:
        records = [h for h in history if h.get("direction") == direction]
        total = len(records)
        hits = len([h for h in records if h.get("status") == "HIT"])
        result[direction] = {
            "total": total,
            "hits": hits,
            "hit_rate": round((hits / total * 100), 1) if total else 0.0,
        }
    return result


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
        by_window[f"{days}d"] = {
            "total": total,
            "hits": hits,
            "expired": len([r for r in records if r.get("status") == "EXPIRED"]),
            "hit_rate": round((hits / total * 100), 1) if total else 0.0,
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
    daily_rate = stats["by_period"].get("daily", {}).get("hit_rate", 0)
    weekly_rate = stats["by_period"].get("weekly", {}).get("hit_rate", 0)
    recent_rate = rolling.get("30d", {}).get("hit_rate", overall_rate)

    consistency_penalty = abs(daily_rate - weekly_rate) * 0.3
    recency_bonus = (recent_rate - overall_rate) * 0.15
    raw_score = overall_rate - consistency_penalty + recency_bonus
    return round(max(min(raw_score, 100.0), 0.0), 1)


def _trim_history(history):
    if len(history) <= MAX_HISTORY_SIZE:
        return history
    sorted_items = sorted(history, key=lambda x: x.get("closed_at", ""), reverse=True)
    return sorted_items[:MAX_HISTORY_SIZE]


def _to_frontend_payload(state, generated_at):
    history = _trim_history(state.get("history", []))
    as_of_dt = _parse_dt(generated_at)
    recent_hits = sorted(
        [h for h in history if h.get("status") == "HIT"],
        key=lambda x: x.get("closed_at", ""),
        reverse=True,
    )[:40]

    recent_resolved = sorted(
        history,
        key=lambda x: x.get("closed_at", ""),
        reverse=True,
    )[:80]

    stats = _calc_stats(history)
    direction_stats = _calc_direction_stats(history)
    rolling = _calc_rolling_stats(history, as_of_dt)
    status_summary = {
        "open": len(state.get("open_targets", [])),
        "resolved": len(history),
        "hits": stats["overall"].get("hits", 0),
        "expired": stats["overall"].get("expired", 0),
    }

    return {
        "generated_at": generated_at,
        "overview": stats["overall"],
        "daily": stats["by_period"]["daily"],
        "weekly": stats["by_period"]["weekly"],
        "rolling": rolling,
        "status_summary": status_summary,
        "direction_stats": direction_stats,
        "consistency_score": _calc_consistency_score(stats, rolling),
        "policy": {
            "single_active_target_per_ticker_period": True,
            "daily_expiry_days": DAILY_EXPIRY_DAYS,
            "weekly_expiry_days": WEEKLY_EXPIRY_DAYS,
        },
        "open_targets": sorted(
            state.get("open_targets", []), key=lambda x: x.get("opened_at", ""), reverse=True
        )[:60],
        "recent_hits": recent_hits,
        "recent_resolved": recent_resolved,
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
    history = state.get("history", [])

    open_targets, resolved = _resolve_open_targets(open_targets, current_prices, as_of_dt, historical_data)
    history.extend(resolved)

    open_targets = _add_new_targets(open_targets, candidates)

    state["open_targets"] = open_targets
    state["history"] = _trim_history(history)
    _save_state(state, market_type)

    frontend_payload = _to_frontend_payload(state, generated_at)
    _, frontend_file = _get_files(market_type)
    with open(frontend_file, "w", encoding="utf-8") as f:
        json.dump(frontend_payload, f, ensure_ascii=False, indent=2)

    return frontend_payload
