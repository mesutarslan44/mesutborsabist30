# -*- coding: utf-8 -*-
"""
Al/Sat Tavsiye Motoru
Teknik göstergelere dayalı ağırlıklı sinyal üretimi
"""

import pandas as pd
import numpy as np
from config import (
    RSI_OVERBOUGHT, RSI_OVERSOLD, SIGNAL_WEIGHTS
)
from technical_analysis import get_latest_indicators


def analyze_rsi(indicators):
    """RSI sinyali üretir. -100 ile +100 arası."""
    rsi = indicators.get("rsi", 50)
    
    if rsi <= 20:
        return 100, "RSI aşırı satım bölgesinde (güçlü AL)"
    elif rsi <= RSI_OVERSOLD:
        return 70, "RSI satım bölgesinde (AL)"
    elif rsi >= 80:
        return -100, "RSI aşırı alım bölgesinde (güçlü SAT)"
    elif rsi >= RSI_OVERBOUGHT:
        return -70, "RSI alım bölgesinde (SAT)"
    elif rsi <= 40:
        return 30, "RSI nötr-düşük (hafif AL)"
    elif rsi >= 60:
        return -30, "RSI nötr-yüksek (hafif SAT)"
    else:
        return 0, "RSI nötr bölgede (BEKLE)"


def analyze_macd(indicators):
    """MACD sinyali üretir."""
    macd = indicators.get("macd", 0)
    macd_signal = indicators.get("macd_signal", 0)
    macd_prev = indicators.get("macd_prev", 0)
    macd_signal_prev = indicators.get("macd_signal_prev", 0)
    histogram = indicators.get("macd_histogram", 0)
    
    # Yukarı kesişim (bullish crossover)
    if macd_prev <= macd_signal_prev and macd > macd_signal:
        return 100, "MACD yukarı kesişim! (güçlü AL sinyali)"
    # Aşağı kesişim (bearish crossover)
    elif macd_prev >= macd_signal_prev and macd < macd_signal:
        return -100, "MACD aşağı kesişim! (güçlü SAT sinyali)"
    # Histogram pozitif ve artıyor
    elif histogram > 0 and macd > macd_signal:
        strength = min(70, abs(histogram) * 1000)
        return strength, "MACD pozitif momentum (AL)"
    # Histogram negatif
    elif histogram < 0 and macd < macd_signal:
        strength = max(-70, -abs(histogram) * 1000)
        return strength, "MACD negatif momentum (SAT)"
    else:
        return 0, "MACD nötr (BEKLE)"


def analyze_sma_trend(indicators):
    """Fiyat-SMA ilişkisi sinyali."""
    price = indicators.get("price", 0)
    sma_20 = indicators.get("sma_20", 0)
    sma_50 = indicators.get("sma_50", 0)
    
    if price == 0 or sma_20 == 0:
        return 0, "Yetersiz veri"
    
    above_20 = price > sma_20
    above_50 = price > sma_50
    
    if above_20 and above_50:
        diff_pct = ((price - sma_50) / sma_50) * 100
        if diff_pct > 10:
            return 60, f"Fiyat SMA20 ve SMA50 üzerinde (+{diff_pct:.1f}%, güçlü yükseliş)"
        return 80, "Fiyat SMA20 ve SMA50 üzerinde (yükseliş trendi)"
    elif above_20 and not above_50:
        return 30, "Fiyat SMA20 üzerinde ama SMA50 altında (toparlanma)"
    elif not above_20 and above_50:
        return -30, "Fiyat SMA20 altına düştü (kısa vadeli zayıflama)"
    else:
        return -80, "Fiyat SMA20 ve SMA50 altında (düşüş trendi)"


def analyze_sma_cross(indicators):
    """Golden Cross / Death Cross sinyali."""
    sma_50 = indicators.get("sma_50", 0)
    sma_200 = indicators.get("sma_200", 0)
    price = indicators.get("price", 0)
    
    if sma_50 == 0 or sma_200 == 0:
        return 0, "Yetersiz veri (SMA200 için daha fazla veri gerekli)"
    
    if sma_50 > sma_200:
        diff = ((sma_50 - sma_200) / sma_200) * 100
        if diff < 2:
            return 90, "Golden Cross gerçekleşiyor! (güçlü AL)"
        return 60, f"SMA50 > SMA200 (yükseliş trendi, fark: %{diff:.1f})"
    else:
        diff = ((sma_200 - sma_50) / sma_200) * 100
        if diff < 2:
            return -90, "Death Cross gerçekleşiyor! (güçlü SAT)"
        return -60, f"SMA50 < SMA200 (düşüş trendi, fark: %{diff:.1f})"


def analyze_bollinger(indicators):
    """Bollinger Bands sinyali."""
    price = indicators.get("price", 0)
    bb_upper = indicators.get("bb_upper", 0)
    bb_lower = indicators.get("bb_lower", 0)
    bb_middle = indicators.get("bb_middle", 0)
    
    if bb_upper == 0 or bb_lower == 0 or bb_upper == bb_lower:
        return 0, "Yetersiz veri"
    
    # Fiyatın band içindeki pozisyonu (0-1 arası, 0=alt band, 1=üst band)
    position = (price - bb_lower) / (bb_upper - bb_lower)
    
    if position <= 0:
        return 90, "Fiyat alt Bollinger bandı altında (aşırı satım, güçlü AL)"
    elif position <= 0.15:
        return 70, "Fiyat alt Bollinger bandına yakın (AL fırsatı)"
    elif position >= 1:
        return -90, "Fiyat üst Bollinger bandı üstünde (aşırı alım, güçlü SAT)"
    elif position >= 0.85:
        return -70, "Fiyat üst Bollinger bandına yakın (SAT fırsatı)"
    elif position < 0.4:
        return 30, "Fiyat orta bandın altında (hafif AL)"
    elif position > 0.6:
        return -30, "Fiyat orta bandın üstünde (hafif SAT)"
    else:
        return 0, "Fiyat orta bölgede (BEKLE)"


def analyze_volume(indicators):
    """Hacim analizi sinyali."""
    volume_ratio = indicators.get("volume_ratio", 1)
    change_pct = indicators.get("change_pct", 0)
    
    if volume_ratio > 2.0 and change_pct > 2:
        return 80, f"Yüksek hacimle yükseliş! (hacim {volume_ratio:.1f}x ortalama)"
    elif volume_ratio > 2.0 and change_pct < -2:
        return -80, f"Yüksek hacimle düşüş! (hacim {volume_ratio:.1f}x ortalama)"
    elif volume_ratio > 1.5 and change_pct > 0:
        return 50, "Ortalamanın üstünde hacimle yükseliş"
    elif volume_ratio > 1.5 and change_pct < 0:
        return -50, "Ortalamanın üstünde hacimle düşüş"
    elif volume_ratio < 0.5:
        return 0, "Düşük hacim (sinyal zayıf)"
    else:
        return 0, "Normal hacim"


def generate_recommendation(indicators):
    """Tüm göstergeleri birleştirip genel tavsiye üretir."""
    analyses = {
        "rsi": analyze_rsi(indicators),
        "macd": analyze_macd(indicators),
        "sma_trend": analyze_sma_trend(indicators),
        "sma_cross": analyze_sma_cross(indicators),
        "bollinger": analyze_bollinger(indicators),
        "volume": analyze_volume(indicators),
    }
    
    # Ağırlıklı toplam puan hesaplama
    total_score = 0
    details = []
    
    for key, (score, comment) in analyses.items():
        weight = SIGNAL_WEIGHTS.get(key, 0)
        weighted_score = score * weight
        total_score += weighted_score
        details.append({
            "indicator": key,
            "score": score,
            "weight": weight,
            "weighted_score": round(weighted_score, 2),
            "comment": comment,
        })
    
    # Genel tavsiye
    total_score = round(total_score, 2)
    
    if total_score >= 60:
        signal = "GÜÇLÜ AL"
        signal_en = "STRONG_BUY"
        color = "#00e676"
    elif total_score >= 30:
        signal = "AL"
        signal_en = "BUY"
        color = "#00c853"
    elif total_score >= 10:
        signal = "HAFİF AL"
        signal_en = "WEAK_BUY"
        color = "#69f0ae"
    elif total_score <= -60:
        signal = "GÜÇLÜ SAT"
        signal_en = "STRONG_SELL"
        color = "#ff1744"
    elif total_score <= -30:
        signal = "SAT"
        signal_en = "SELL"
        color = "#ff5252"
    elif total_score <= -10:
        signal = "HAFİF SAT"
        signal_en = "WEAK_SELL"
        color = "#ff8a80"
    else:
        signal = "BEKLE"
        signal_en = "HOLD"
        color = "#ffd740"
    
    confidence = min(100, abs(total_score))
    
    return {
        "signal": signal,
        "signal_en": signal_en,
        "score": total_score,
        "confidence": round(confidence, 1),
        "color": color,
        "details": details,
    }


def generate_all_recommendations(all_data):
    """Tüm hisseler için tavsiye üretir."""
    recommendations = {}
    
    for ticker, df in all_data.items():
        indicators = get_latest_indicators(df)
        if indicators:
            rec = generate_recommendation(indicators)
            recommendations[ticker] = {
                "indicators": indicators,
                "recommendation": rec,
            }
    
    return recommendations
