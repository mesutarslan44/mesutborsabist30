# -*- coding: utf-8 -*-
"""
Teknik Analiz Hesaplama Modülü
RSI, MACD, SMA, EMA, Bollinger Bands, Hacim Analizi
"""

import pandas as pd
import numpy as np
from config import (
    RSI_PERIOD, MACD_FAST, MACD_SLOW, MACD_SIGNAL,
    SMA_SHORT, SMA_MEDIUM, SMA_LONG,
    EMA_SHORT, EMA_LONG,
    BOLLINGER_PERIOD, BOLLINGER_STD,
    VOLUME_AVG_PERIOD
)


def calculate_rsi(df, period=RSI_PERIOD):
    """RSI (Relative Strength Index) hesaplar."""
    delta = df["close"].diff()
    gain = delta.where(delta > 0, 0.0)
    loss = -delta.where(delta < 0, 0.0)
    avg_gain = gain.rolling(window=period, min_periods=period).mean()
    avg_loss = loss.rolling(window=period, min_periods=period).mean()
    
    # Wilder smoothing
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
    """SMA (Simple Moving Average) hesaplar."""
    return df["close"].rolling(window=period, min_periods=1).mean()


def calculate_ema(df, period):
    """EMA (Exponential Moving Average) hesaplar."""
    return df["close"].ewm(span=period, adjust=False).mean()


def calculate_bollinger_bands(df, period=BOLLINGER_PERIOD, std_dev=BOLLINGER_STD):
    """Bollinger Bands hesaplar."""
    sma = df["close"].rolling(window=period, min_periods=1).mean()
    std = df["close"].rolling(window=period, min_periods=1).std()
    upper = sma + (std * std_dev)
    lower = sma - (std * std_dev)
    return upper, sma, lower


def calculate_volume_analysis(df, period=VOLUME_AVG_PERIOD):
    """Hacim analizi yapar."""
    avg_volume = df["volume"].rolling(window=period, min_periods=1).mean()
    volume_ratio = df["volume"] / avg_volume
    return avg_volume, volume_ratio


def calculate_all_indicators(df):
    """Tüm teknik göstergeleri hesaplar ve DataFrame'e ekler."""
    if df is None or len(df) < 2:
        return df
    
    result = df.copy()
    
    # RSI
    result["rsi"] = calculate_rsi(df)
    
    # MACD
    result["macd"], result["macd_signal"], result["macd_histogram"] = calculate_macd(df)
    
    # SMA
    result["sma_20"] = calculate_sma(df, SMA_SHORT)
    result["sma_50"] = calculate_sma(df, SMA_MEDIUM)
    result["sma_200"] = calculate_sma(df, SMA_LONG)
    
    # EMA
    result["ema_12"] = calculate_ema(df, EMA_SHORT)
    result["ema_26"] = calculate_ema(df, EMA_LONG)
    
    # Bollinger Bands
    result["bb_upper"], result["bb_middle"], result["bb_lower"] = calculate_bollinger_bands(df)
    
    # Hacim
    result["volume_avg"], result["volume_ratio"] = calculate_volume_analysis(df)
    
    # Fiyat değişim yüzdeleri
    result["change_pct"] = df["close"].pct_change() * 100
    result["change_pct_5d"] = df["close"].pct_change(periods=5) * 100
    result["change_pct_20d"] = df["close"].pct_change(periods=20) * 100
    
    return result


def get_latest_indicators(df):
    """En son gösterge değerlerini döndürür."""
    if df is None or len(df) < 2:
        return {}
    
    analyzed = calculate_all_indicators(df)
    latest = analyzed.iloc[-1]
    prev = analyzed.iloc[-2]
    
    indicators = {
        "price": round(float(latest["close"]), 2),
        "open": round(float(latest["open"]), 2),
        "high": round(float(latest["high"]), 2),
        "low": round(float(latest["low"]), 2),
        "volume": int(latest["volume"]),
        "change_pct": round(float(latest["change_pct"]), 2) if not pd.isna(latest["change_pct"]) else 0,
        "change_5d": round(float(latest["change_pct_5d"]), 2) if not pd.isna(latest["change_pct_5d"]) else 0,
        "change_20d": round(float(latest["change_pct_20d"]), 2) if not pd.isna(latest["change_pct_20d"]) else 0,
        "rsi": round(float(latest["rsi"]), 2) if not pd.isna(latest["rsi"]) else 50,
        "macd": round(float(latest["macd"]), 4) if not pd.isna(latest["macd"]) else 0,
        "macd_signal": round(float(latest["macd_signal"]), 4) if not pd.isna(latest["macd_signal"]) else 0,
        "macd_histogram": round(float(latest["macd_histogram"]), 4) if not pd.isna(latest["macd_histogram"]) else 0,
        "macd_prev": round(float(prev["macd"]), 4) if not pd.isna(prev["macd"]) else 0,
        "macd_signal_prev": round(float(prev["macd_signal"]), 4) if not pd.isna(prev["macd_signal"]) else 0,
        "sma_20": round(float(latest["sma_20"]), 2) if not pd.isna(latest["sma_20"]) else 0,
        "sma_50": round(float(latest["sma_50"]), 2) if not pd.isna(latest["sma_50"]) else 0,
        "sma_200": round(float(latest["sma_200"]), 2) if not pd.isna(latest["sma_200"]) else 0,
        "ema_12": round(float(latest["ema_12"]), 2) if not pd.isna(latest["ema_12"]) else 0,
        "ema_26": round(float(latest["ema_26"]), 2) if not pd.isna(latest["ema_26"]) else 0,
        "bb_upper": round(float(latest["bb_upper"]), 2) if not pd.isna(latest["bb_upper"]) else 0,
        "bb_middle": round(float(latest["bb_middle"]), 2) if not pd.isna(latest["bb_middle"]) else 0,
        "bb_lower": round(float(latest["bb_lower"]), 2) if not pd.isna(latest["bb_lower"]) else 0,
        "volume_avg": int(latest["volume_avg"]) if not pd.isna(latest["volume_avg"]) else 0,
        "volume_ratio": round(float(latest["volume_ratio"]), 2) if not pd.isna(latest["volume_ratio"]) else 1,
    }
    
    return indicators
