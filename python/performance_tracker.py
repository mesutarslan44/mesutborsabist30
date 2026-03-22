# -*- coding: utf-8 -*-
"""
Prediction performance tracking for daily/weekly targets.

This module stores open targets, resolves them when price reaches target,
and publishes a frontend-friendly performance.json file.
"""

import json
import os
from datetime import datetime


ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATE_DIR = os.path.join(ROOT_DIR, "python", "data")
STATE_FILE = os.path.join(STATE_DIR, "target_tracking_state.json")
FRONTEND_FILE = os.path.join(ROOT_DIR, "site", "data", "performance.json")


def _ensure_dirs():
    os.makedirs(STATE_DIR, exist_ok=True)


def _load_state():
    _ensure_dirs()
    if not os.path.exists(STATE_FILE):
        return {"open_targets": [], "history": []}

    try:
        with open(STATE_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            data.setdefault("open_targets", [])
            data.setdefault("history", [])
            return data
    except Exception:
        return {"open_targets": [], "history": []}


def _save_state(state):
    with open(STATE_FILE, "w", encoding="utf-8") as f:
        json.dump(state, f, ensure_ascii=False, indent=2)


def _parse_dt(dt_str):
    try:
        return datetime.strptime(dt_str, "%Y-%m-%d %H:%M")
    except Exception:
        return datetime.now()


def _days_between(start_dt, end_dt):
    return max((end_dt.date() - start_dt.date()).days, 0)


def _resolve_open_targets(open_targets, current_prices, as_of_dt):
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
        if direction == "buy" and current_price >= target_price:
            hit = True
        elif direction == "sell" and current_price <= target_price:
            hit = True

        max_days = 5 if period == "daily" else 20
        age_days = _days_between(opened_at, as_of_dt)
        expired = age_days > max_days

        if hit or expired:
            resolved.append(
                {
                    "ticker": ticker,
                    "period": period,
                    "direction": direction,
                    "opened_at": target.get("opened_at"),
                    "closed_at": as_of_dt.strftime("%Y-%m-%d %H:%M"),
                    "start_price": target.get("start_price"),
                    "target_price": target_price,
                    "close_price": round(float(current_price), 4),
                    "days_to_result": age_days,
                    "status": "HIT" if hit else "EXPIRED",
                }
            )
        else:
            still_open.append(target)

    return still_open, resolved


def _add_new_targets(open_targets, candidates):
    seen = {
        (t.get("ticker"), t.get("period"), t.get("opened_at"), t.get("direction"))
        for t in open_targets
    }

    for c in candidates:
        key = (c.get("ticker"), c.get("period"), c.get("opened_at"), c.get("direction"))
        if key in seen:
            continue
        seen.add(key)
        open_targets.append(c)

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
            "hit_rate": round((p_hit_count / p_total * 100), 1) if p_total else 0.0,
            "avg_days_to_hit": round(
                sum(h.get("days_to_result", 0) for h in p_hits) / p_hit_count, 1
            )
            if p_hit_count
            else 0.0,
        }

    total = len(history)
    hits = len([h for h in history if h.get("status") == "HIT"])

    return {
        "overall": {
            "total": total,
            "hits": hits,
            "hit_rate": round((hits / total * 100), 1) if total else 0.0,
        },
        "by_period": stats_by_period,
    }


def _to_frontend_payload(state, generated_at):
    history = state.get("history", [])
    recent = sorted(
        [h for h in history if h.get("status") == "HIT"],
        key=lambda x: x.get("closed_at", ""),
        reverse=True,
    )[:30]

    stats = _calc_stats(history)

    return {
        "generated_at": generated_at,
        "overview": stats["overall"],
        "daily": stats["by_period"]["daily"],
        "weekly": stats["by_period"]["weekly"],
        "open_targets": sorted(
            state.get("open_targets", []), key=lambda x: x.get("opened_at", ""), reverse=True
        )[:30],
        "recent_hits": recent,
    }


def update_performance_tracker(candidates, current_prices, generated_at):
    """
    candidates: list of target candidates with required fields.
    current_prices: dict[ticker] = current price.
    generated_at: datetime string in "%Y-%m-%d %H:%M".
    """
    as_of_dt = _parse_dt(generated_at)
    state = _load_state()

    open_targets = state.get("open_targets", [])
    history = state.get("history", [])

    open_targets, resolved = _resolve_open_targets(open_targets, current_prices, as_of_dt)
    history.extend(resolved)

    open_targets = _add_new_targets(open_targets, candidates)

    state["open_targets"] = open_targets
    state["history"] = history
    _save_state(state)

    frontend_payload = _to_frontend_payload(state, generated_at)
    with open(FRONTEND_FILE, "w", encoding="utf-8") as f:
        json.dump(frontend_payload, f, ensure_ascii=False, indent=2)

    return frontend_payload
