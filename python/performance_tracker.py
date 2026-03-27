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


ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATE_DIR = os.path.join(ROOT_DIR, "python", "data")
FRONTEND_FILE = os.path.join(ROOT_DIR, "site", "data", "performance.json")

DAILY_EXPIRY_DAYS = 5
WEEKLY_EXPIRY_DAYS = 20
MAX_HISTORY_SIZE = 4000
MIN_HOLD_MINUTES = 60  # Minimum 1 saat açık kalmalı


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

        max_days = DAILY_EXPIRY_DAYS if period == "daily" else WEEKLY_EXPIRY_DAYS
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
        p_stopped = [h for h in p_records if h.get("status") == "STOPPED"]
        p_expired = [h for h in p_records if h.get("status") == "EXPIRED"]
        p_total = len(p_records)
        p_hit_count = len(p_hits)
        stats_by_period[period] = {
            "total": p_total,
            "hits": p_hit_count,
            "stopped": len(p_stopped),
            "expired": len(p_expired),
            "hit_rate": round((p_hit_count / p_total * 100), 1) if p_total else 0.0,
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

    return {
        "overall": {
            "total": total,
            "hits": hits,
            "stopped": stopped,
            "expired": expired,
            "hit_rate": round((hits / total * 100), 1) if total else 0.0,
            "stop_rate": round((stopped / total * 100), 1) if total else 0.0,
        },
        "by_period": stats_by_period,
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
        by_window[f"{days}d"] = {
            "total": total,
            "hits": hits,
            "stopped": stopped,
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
    stop_rate = stats["overall"].get("stop_rate", 0)
    daily_rate = stats["by_period"].get("daily", {}).get("hit_rate", 0)
    weekly_rate = stats["by_period"].get("weekly", {}).get("hit_rate", 0)
    recent_rate = rolling.get("30d", {}).get("hit_rate", overall_rate)

    consistency_penalty = abs(daily_rate - weekly_rate) * 0.3
    recency_bonus = (recent_rate - overall_rate) * 0.15
    stop_penalty = stop_rate * 0.2  # Penalize high stop-loss rate
    raw_score = overall_rate - consistency_penalty + recency_bonus - stop_penalty
    return round(max(min(raw_score, 100.0), 0.0), 1)


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

    stats = _calc_stats(history)
    direction_stats = _calc_direction_stats(history)
    target_level_stats = _calc_target_level_stats(history)
    profit_stats = _calc_profit_stats(history)
    rolling = _calc_rolling_stats(history, as_of_dt)
    status_summary = {
        "open": len(state.get("open_targets", [])),
        "resolved": len(history),
        "hits": stats["overall"].get("hits", 0),
        "stopped": stats["overall"].get("stopped", 0),
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
        "target_level_stats": target_level_stats,
        "profit_stats": profit_stats,
        "consistency_score": _calc_consistency_score(stats, rolling),
        "policy": {
            "single_active_target_per_ticker_period": True,
            "daily_expiry_days": DAILY_EXPIRY_DAYS,
            "weekly_expiry_days": WEEKLY_EXPIRY_DAYS,
            "min_hold_minutes": MIN_HOLD_MINUTES,
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
