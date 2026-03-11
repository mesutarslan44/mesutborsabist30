# -*- coding: utf-8 -*-
"""
Teknik Analiz Hesaplama Modülü - Genişletilmiş
RSI, MACD, SMA, EMA, Bollinger Bands, Stochastic, ADX, Fibonacci, Hacim
"""

import pandas as pd
import numpy as np
from config import (
    RSI_PERIOD, MACD_FAST, MACD_SLOW, MACD_SIGNAL,
    SMA_SHORT, SMA_MEDIUM, SMA_LONG,
    EMA_SHORT, EMA_LONG,
    BOLLINGER_PERIOD, BOLLINGER_STD,
    VOLUME_AVG_PERIOD,
    STOCH_K_PERIOD, STOCH_D_PERIOD,
    ADX_PERIOD, FIBONACCI_LEVELS,
    TARGET_MULTIPLIERS
)


def calculate_rsi(df, period=RSI_PERIOD):
    """RSI (Relative Strength Index) hesaplar."""
    delta = df["close"].diff()
    gain = delta.where(delta > 0, 0.0)
    loss = -delta.where(delta < 0, 0.0)
    avg_gain = gain.rolling(window=period, min_periods=period).mean()
    avg_loss = loss.rolling(window=period, min_periods=period).mean()
    for i in range(period, len(avg_gain)):
        avg_gain.iloc[i] = (avg_gain.iloc[i-1] * (period - 1) + gain.iloc[i]) / period
        avg_loss.iloc[i] = (avg_loss.iloc[i-1] * (period - 1) + loss.iloc[i]) / period
    rs = avg_gain / avg_loss
    rsi = 100 - (100 / (1 + rs))
    return rsi


def calculate_macd(df, fast=MACD_FAST, slow=MACD_SLOW, signal=MACD_SIGNAL):
    """MACD hesaplar."""
    ema_fast = df["close"].ewm(span=fast, adjust=False).mean()
    ema_slow = df["close"].ewm(span=slow, adjust=False).mean()
    macd_line = ema_fast - ema_slow
    signal_line = macd_line.ewm(span=signal, adjust=False).mean()
    histogram = macd_line - signal_line
    return macd_line, signal_line, histogram


def calculate_sma(df, period):
    """SMA hesaplar."""
    return df["close"].rolling(window=period, min_periods=1).mean()


def calculate_ema(df, period):
    """EMA hesaplar."""
    return df["close"].ewm(span=period, adjust=False).mean()


def calculate_bollinger_bands(df, period=BOLLINGER_PERIOD, std_dev=BOLLINGER_STD):
    """Bollinger Bands hesaplar."""
    sma = df["close"].rolling(window=period, min_periods=1).mean()
    std = df["close"].rolling(window=period, min_periods=1).std()
    upper = sma + (std * std_dev)
    lower = sma - (std * std_dev)
    return upper, sma, lower


def calculate_stochastic(df, k_period=STOCH_K_PERIOD, d_period=STOCH_D_PERIOD):
    """Stochastic Oscillator (%K, %D) hesaplar."""
    low_min = df["low"].rolling(window=k_period, min_periods=1).min()
    high_max = df["high"].rolling(window=k_period, min_periods=1).max()
    denom = high_max - low_min
    denom = denom.replace(0, np.nan)
    stoch_k = ((df["close"] - low_min) / denom) * 100
    stoch_d = stoch_k.rolling(window=d_period, min_periods=1).mean()
    return stoch_k, stoch_d


def calculate_adx(df, period=ADX_PERIOD):
    """ADX (Average Directional Index) hesaplar."""
    high = df["high"]
    low = df["low"]
    close = df["close"]

    plus_dm = high.diff()
    minus_dm = -low.diff()

    plus_dm = plus_dm.where((plus_dm > minus_dm) & (plus_dm > 0), 0.0)
    minus_dm = minus_dm.where((minus_dm > plus_dm) & (minus_dm > 0), 0.0)

    tr1 = high - low
    tr2 = (high - close.shift(1)).abs()
    tr3 = (low - close.shift(1)).abs()
    tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)

    atr = tr.rolling(window=period, min_periods=1).mean()
    plus_di = 100 * (plus_dm.rolling(window=period, min_periods=1).mean() / atr)
    minus_di = 100 * (minus_dm.rolling(window=period, min_periods=1).mean() / atr)

    dx_denom = (plus_di + minus_di).replace(0, np.nan)
    dx = 100 * ((plus_di - minus_di).abs() / dx_denom)
    adx = dx.rolling(window=period, min_periods=1).mean()

    return adx, plus_di, minus_di


def calculate_fibonacci_levels(df, lookback=60):
    """Fibonacci düzeltme seviyelerini hesaplar."""
    recent = df.tail(lookback)
    high = recent["high"].max()
    low = recent["low"].min()
    diff = high - low

    if diff == 0:
        return {str(level): float(low) for level in FIBONACCI_LEVELS}

    levels = {}
    for level in FIBONACCI_LEVELS:
        levels[str(level)] = round(float(high - diff * level), 2)

    return levels


def calculate_support_resistance(df, lookback=60):
    """Destek ve direnç seviyelerini hesaplar."""
    recent = df.tail(lookback)
    high = float(recent["high"].max())
    low = float(recent["low"].min())
    close = float(recent["close"].iloc[-1])

    # Pivot noktaları
    pivot = (high + low + close) / 3
    r1 = 2 * pivot - low
    r2 = pivot + (high - low)
    r3 = high + 2 * (pivot - low)
    s1 = 2 * pivot - high
    s2 = pivot - (high - low)
    s3 = low - 2 * (high - pivot)

    return {
        "pivot": round(pivot, 2),
        "r1": round(r1, 2), "r2": round(r2, 2), "r3": round(r3, 2),
        "s1": round(s1, 2), "s2": round(s2, 2), "s3": round(s3, 2),
    }


def calculate_targets(indicators, period_name="daily"):
    """Hedef fiyat ve stop-loss hesaplar."""
    price = indicators.get("price", 0)
    if price == 0:
        return {}

    multipliers = TARGET_MULTIPLIERS.get(period_name, TARGET_MULTIPLIERS["daily"])
    score = indicators.get("_score", 0)

    # Score'a göre hedef ayarla
    if score > 0:
        target_1 = price * (1 + multipliers["target_pct"] * 0.5)
        target_2 = price * (1 + multipliers["target_pct"])
        target_3 = price * (1 + multipliers["target_pct"] * 1.5)
        stop_loss = price * (1 - multipliers["stop_pct"])
        add_level = price * (1 - multipliers["stop_pct"] * 0.5)
    else:
        target_1 = price * (1 - multipliers["target_pct"] * 0.5)
        target_2 = price * (1 - multipliers["target_pct"])
        target_3 = price * (1 - multipliers["target_pct"] * 1.5)
        stop_loss = price * (1 + multipliers["stop_pct"])
        add_level = price * (1 + multipliers["stop_pct"] * 0.5)

    return {
        "target_1": round(target_1, 2),
        "target_2": round(target_2, 2),
        "target_3": round(target_3, 2),
        "stop_loss": round(stop_loss, 2),
        "add_level": round(add_level, 2),
    }


def calculate_volume_analysis(df, period=VOLUME_AVG_PERIOD):
    """Hacim analizi."""
    avg_volume = df["volume"].rolling(window=period, min_periods=1).mean()
    volume_ratio = df["volume"] / avg_volume
    return avg_volume, volume_ratio


def calculate_all_indicators(df):
    """Tüm teknik göstergeleri hesaplar."""
    if df is None or len(df) < 2:
        return df
    result = df.copy()

    result["rsi"] = calculate_rsi(df)
    result["macd"], result["macd_signal"], result["macd_histogram"] = calculate_macd(df)
    result["sma_20"] = calculate_sma(df, SMA_SHORT)
    result["sma_50"] = calculate_sma(df, SMA_MEDIUM)
    result["sma_200"] = calculate_sma(df, SMA_LONG)
    result["ema_12"] = calculate_ema(df, EMA_SHORT)
    result["ema_26"] = calculate_ema(df, EMA_LONG)
    result["bb_upper"], result["bb_middle"], result["bb_lower"] = calculate_bollinger_bands(df)
    result["stoch_k"], result["stoch_d"] = calculate_stochastic(df)
    result["adx"], result["plus_di"], result["minus_di"] = calculate_adx(df)
    result["volume_avg"], result["volume_ratio"] = calculate_volume_analysis(df)
    result["change_pct"] = df["close"].pct_change() * 100
    result["change_pct_5d"] = df["close"].pct_change(periods=5) * 100
    result["change_pct_20d"] = df["close"].pct_change(periods=20) * 100

    return result


def safe_val(series, idx, default=0):
    """NaN-safe value getter."""
    v = series.iloc[idx]
    if pd.isna(v):
        return default
    return round(float(v), 4)


def get_latest_indicators(df):
    """En son gösterge değerlerini döndürür."""
    if df is None or len(df) < 2:
        return {}

    analyzed = calculate_all_indicators(df)
    latest = analyzed.iloc[-1]
    prev = analyzed.iloc[-2]

    indicators = {
        "price": safe_val(analyzed["close"], -1),
        "open": safe_val(analyzed["open"], -1),
        "high": safe_val(analyzed["high"], -1),
        "low": safe_val(analyzed["low"], -1),
        "volume": int(latest["volume"]) if not pd.isna(latest["volume"]) else 0,
        "change_pct": safe_val(analyzed["change_pct"], -1),
        "change_5d": safe_val(analyzed["change_pct_5d"], -1),
        "change_20d": safe_val(analyzed["change_pct_20d"], -1),
        "rsi": safe_val(analyzed["rsi"], -1, 50),
        "macd": safe_val(analyzed["macd"], -1),
        "macd_signal": safe_val(analyzed["macd_signal"], -1),
        "macd_histogram": safe_val(analyzed["macd_histogram"], -1),
        "macd_prev": safe_val(analyzed["macd"], -2),
        "macd_signal_prev": safe_val(analyzed["macd_signal"], -2),
        "sma_20": safe_val(analyzed["sma_20"], -1),
        "sma_50": safe_val(analyzed["sma_50"], -1),
        "sma_200": safe_val(analyzed["sma_200"], -1),
        "ema_12": safe_val(analyzed["ema_12"], -1),
        "ema_26": safe_val(analyzed["ema_26"], -1),
        "bb_upper": safe_val(analyzed["bb_upper"], -1),
        "bb_middle": safe_val(analyzed["bb_middle"], -1),
        "bb_lower": safe_val(analyzed["bb_lower"], -1),
        "stoch_k": safe_val(analyzed["stoch_k"], -1, 50),
        "stoch_d": safe_val(analyzed["stoch_d"], -1, 50),
        "stoch_k_prev": safe_val(analyzed["stoch_k"], -2, 50),
        "stoch_d_prev": safe_val(analyzed["stoch_d"], -2, 50),
        "adx": safe_val(analyzed["adx"], -1),
        "plus_di": safe_val(analyzed["plus_di"], -1),
        "minus_di": safe_val(analyzed["minus_di"], -1),
        "volume_avg": int(latest["volume_avg"]) if not pd.isna(latest["volume_avg"]) else 0,
        "volume_ratio": safe_val(analyzed["volume_ratio"], -1, 1),
        "fibonacci": calculate_fibonacci_levels(df),
        "support_resistance": calculate_support_resistance(df),
    }

    return indicators
