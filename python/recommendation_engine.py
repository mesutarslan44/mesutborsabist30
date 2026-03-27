# -*- coding: utf-8 -*-
"""
Gelişmiş Tavsiye Motoru
Detaylı Türkçe açıklamalar, hedef fiyatlar, stop-loss, ekleme seviyeleri
"""

from config import (
    SIGNAL_WEIGHTS, RSI_OVERBOUGHT, RSI_OVERSOLD,
    STOCH_OVERBOUGHT, STOCH_OVERSOLD,
    ADX_STRONG_TREND, ADX_VERY_STRONG_TREND,
    TARGET_MULTIPLIERS
)


REGIME_PROFILES = {
    "trend_up": {
        "label": "TREND_YUKARI",
        "score_factor": 1.05,
        "thresholds": {
            "strong_buy": 45,
            "buy": 20,
            "weak_buy": 8,
            "weak_sell": -14,
            "sell": -30,
            "strong_sell": -48,
        },
    },
    "trend_down": {
        "label": "TREND_ASAGI",
        "score_factor": 1.05,
        "thresholds": {
            "strong_buy": 60,
            "buy": 33,
            "weak_buy": 15,
            "weak_sell": -8,
            "sell": -20,
            "strong_sell": -45,
        },
    },
    "range_low_vol": {
        "label": "YATAY_DUSUK_VOL",
        "score_factor": 0.90,
        "thresholds": {
            "strong_buy": 58,
            "buy": 30,
            "weak_buy": 12,
            "weak_sell": -12,
            "sell": -30,
            "strong_sell": -58,
        },
    },
    "high_volatility": {
        "label": "YUKSEK_VOL",
        "score_factor": 0.85,
        "thresholds": {
            "strong_buy": 60,
            "buy": 33,
            "weak_buy": 15,
            "weak_sell": -15,
            "sell": -33,
            "strong_sell": -60,
        },
    },
    "neutral": {
        "label": "NOTR",
        "score_factor": 1.00,
        "thresholds": {
            "strong_buy": 50,
            "buy": 25,
            "weak_buy": 10,
            "weak_sell": -10,
            "sell": -25,
            "strong_sell": -50,
        },
    },
}


def _safe_number(val, default=0.0):
    if isinstance(val, (int, float)):
        return float(val)
    return float(default)


def classify_market_regime(indicators):
    adx_val = _safe_number(indicators.get("adx"), 0)
    plus_di = _safe_number(indicators.get("plus_di"), 0)
    minus_di = _safe_number(indicators.get("minus_di"), 0)
    price = max(_safe_number(indicators.get("price"), 0), 0.0001)
    atr_pct = _safe_number(indicators.get("atr_pct"), 0)
    if atr_pct <= 0:
        atr = _safe_number(indicators.get("atr"), 0)
        atr_pct = atr / price if atr > 0 else 0

    bb_upper = _safe_number(indicators.get("bb_upper"), price)
    bb_lower = _safe_number(indicators.get("bb_lower"), price)
    bb_width_pct = max(bb_upper - bb_lower, 0) / price
    di_spread = plus_di - minus_di
    abs_di_spread = abs(di_spread)

    if adx_val >= 30 and abs_di_spread >= 8:
        return "trend_up" if di_spread > 0 else "trend_down"
    if atr_pct >= 0.035 or bb_width_pct >= 0.16:
        return "high_volatility"
    if adx_val < 18 and atr_pct <= 0.018 and bb_width_pct <= 0.09:
        return "range_low_vol"
    return "neutral"


def classify_signal(score, thresholds):
    if score >= thresholds["strong_buy"]:
        return "GÜÇLÜ AL", "STRONG_BUY", "#00e676"
    if score >= thresholds["buy"]:
        return "AL", "BUY", "#00c853"
    if score >= thresholds["weak_buy"]:
        return "HAFİF AL", "WEAK_BUY", "#69f0ae"
    if score > thresholds["weak_sell"]:
        return "BEKLE", "HOLD", "#ffd740"
    if score > thresholds["sell"]:
        return "HAFİF SAT", "WEAK_SELL", "#ff8a80"
    if score > thresholds["strong_sell"]:
        return "SAT", "SELL", "#ff5252"
    return "GÜÇLÜ SAT", "STRONG_SELL", "#ff1744"


def analyze_rsi(indicators):
    """RSI analizi — detaylı açıklama ile."""
    rsi = indicators.get("rsi", 50)
    score = 0
    if rsi <= 20:
        score = 100
        comment = f"RSI {rsi:.1f} ile aşırı satım bölgesinde! Güçlü bir toparlanma sinyali. Fiyat olması gereken seviyenin çok altında, bu tarihi bir fırsat olabilir."
        aksiyon = "GÜÇLÜ AL — Aşırı satım bölgesine girmiş, hisse çok ucuzlamış."
    elif rsi <= 30:
        score = 70
        comment = f"RSI {rsi:.1f} ile satım bölgesinde. Hisse değerinin altında fiyatlanıyor, alım fırsatı oluşabilir."
        aksiyon = "AL — RSI satım bölgesinde, toparlanma bekleniyor."
    elif rsi <= 40:
        score = 30
        comment = f"RSI {rsi:.1f} ile düşük bölgede. Trend zayıf ama potansiyel dip oluşumu var."
        aksiyon = "HAFİF AL — Dip oluşumu izlenebilir, kademeli alım düşünülebilir."
    elif rsi <= 60:
        score = 0
        comment = f"RSI {rsi:.1f} ile nötr bölgede. Net bir yön sinyali yok, piyasa kararsız."
        aksiyon = "BEKLE — RSI nötr bölgede, yön belli değil."
    elif rsi <= 70:
        score = -30
        comment = f"RSI {rsi:.1f} ile yüksek bölgeye yaklaşıyor. Yükseliş devam ediyor ama dikkatli olunmalı."
        aksiyon = "DİKKAT — RSI yükseliyor, pozisyon azaltma düşünülebilir."
    elif rsi <= 80:
        score = -70
        comment = f"RSI {rsi:.1f} ile aşırı alım bölgesine girdi! Kâr realizasyonu gelebilir."
        aksiyon = "SAT — Aşırı alım bölgesinde, kâr realizasyonu yakın."
    else:
        score = -100
        comment = f"RSI {rsi:.1f} ile aşırı yüksek! Hisse pahalı, düzeltme kaçınılmaz görünüyor."
        aksiyon = "GÜÇLÜ SAT — Aşırı alım, ciddi düzeltme riski var."

    return {"indicator": "rsi", "score": score, "weight": SIGNAL_WEIGHTS["rsi"],
            "weighted_score": score * SIGNAL_WEIGHTS["rsi"],
            "comment": comment, "aksiyon": aksiyon}


def analyze_macd(indicators):
    """MACD analizi — detaylı açıklama ile."""
    macd = indicators.get("macd", 0)
    signal = indicators.get("macd_signal", 0)
    histogram = indicators.get("macd_histogram", 0)
    macd_prev = indicators.get("macd_prev", 0)
    signal_prev = indicators.get("macd_signal_prev", 0)

    fresh_cross_up = (macd_prev <= signal_prev) and (macd > signal)
    fresh_cross_down = (macd_prev >= signal_prev) and (macd < signal)

    if fresh_cross_up:
        score = 90
        comment = f"MACD ({macd:.4f}) sinyal çizgisini ({signal:.4f}) yukarı kesti! Bu güçlü bir ALIŞ sinyalidir. Yükseliş trendi başlıyor olabilir."
        aksiyon = "GÜÇLÜ AL — MACD yukarı kesişim (Golden Cross). Yükseliş başlangıcı!"
    elif fresh_cross_down:
        score = -90
        comment = f"MACD ({macd:.4f}) sinyal çizgisini ({signal:.4f}) aşağı kesti! Bu güçlü bir SATIŞ sinyalidir. Düşüş trendi başlıyor olabilir."
        aksiyon = "GÜÇLÜ SAT — MACD aşağı kesişim (Death Cross). Düşüş başlangıcı!"
    elif macd > signal and histogram > 0:
        if histogram > abs(macd) * 0.5:
            score = 70
            comment = f"MACD sinyal üstünde ve momentum çok güçlü! Histogram ({histogram:.4f}) genişliyor, yükseliş hız kazanıyor."
            aksiyon = "AL — Güçlü yükseliş momentumu devam ediyor."
        else:
            score = 40
            comment = f"MACD sinyal üstünde, yükseliş devam ediyor. Histogram ({histogram:.4f}) pozitif."
            aksiyon = "HAFİF AL — Yükseliş trendi sürüyor ama momentum azalıyor."
    elif macd < signal and histogram < 0:
        if abs(histogram) > abs(macd) * 0.5:
            score = -70
            comment = f"MACD sinyal altında ve düşüş momentumu güçlü! Histogram ({histogram:.4f}) derinleşiyor."
            aksiyon = "SAT — Güçlü düşüş momentumu, pozisyonları azaltın."
        else:
            score = -40
            comment = f"MACD sinyal altında, düşüş devam ediyor ama momentum azalıyor."
            aksiyon = "HAFİF SAT — Düşüş trendi var ama zayıflıyor."
    else:
        score = 0
        comment = "MACD ve sinyal çizgisi yakın, piyasa yön arıyor."
        aksiyon = "BEKLE — Net sinyal yok."

    return {"indicator": "macd", "score": score, "weight": SIGNAL_WEIGHTS["macd"],
            "weighted_score": score * SIGNAL_WEIGHTS["macd"],
            "comment": comment, "aksiyon": aksiyon}


def analyze_sma_trend(indicators):
    """SMA Trend analizi."""
    price = indicators.get("price", 0)
    sma20 = indicators.get("sma_20", price)
    sma50 = indicators.get("sma_50", price)
    sma200 = indicators.get("sma_200", price)

    above_count = sum([price > sma20, price > sma50, price > sma200])

    if above_count == 3:
        score = 80
        comment = f"Fiyat (₺{price:.2f}) tüm hareketli ortalamaların üstünde! (SMA20: ₺{sma20:.2f}, SMA50: ₺{sma50:.2f}, SMA200: ₺{sma200:.2f}). Güçlü yükseliş trendi."
        aksiyon = "AL — Tüm ortalamalar altında, mükemmel teknik görünüm."
    elif above_count == 2:
        score = 30
        comment = f"Fiyat 3 ortalamadan 2'sinin üstünde. Trend olumlu ama dikkat edilmeli."
        aksiyon = "HAFİF AL — Genel trend yukarı yönlü."
    elif above_count == 1:
        score = -30
        comment = f"Fiyat ortalamaların çoğunun altında. Zayıf teknik görünüm."
        aksiyon = "HAFİF SAT — Trend aşağı yönlü, dikkatli olun."
    else:
        score = -80
        comment = f"Fiyat (₺{price:.2f}) tüm hareketli ortalamaların altında! Ciddi düşüş trendi. SMA200: ₺{sma200:.2f}."
        aksiyon = "SAT — Tüm ortalamalar üstünde, ağır düşüş trendi."

    return {"indicator": "sma_trend", "score": score, "weight": SIGNAL_WEIGHTS["sma_trend"],
            "weighted_score": score * SIGNAL_WEIGHTS["sma_trend"],
            "comment": comment, "aksiyon": aksiyon}


def analyze_sma_cross(indicators):
    """SMA Kesişim analizi."""
    sma20 = indicators.get("sma_20", 0)
    sma50 = indicators.get("sma_50", 0)
    sma200 = indicators.get("sma_200", 0)

    if sma20 > sma50 > sma200:
        score = 80
        comment = "SMA20 > SMA50 > SMA200 — Mükemmel Golden Cross formasyonu! Uzun vadeli yükseliş trendi teyit edildi."
        aksiyon = "AL — Altın kesişim aktif. Uzun vadeli yatırım için ideal."
    elif sma20 > sma50:
        score = 40
        comment = "SMA20 SMA50'nin üstüne çıkmış, kısa vadeli trend yukarı dönmüş."
        aksiyon = "HAFİF AL — Kısa vadeli toparlanma mevcut."
    elif sma20 < sma50 < sma200:
        score = -80
        comment = "SMA20 < SMA50 < SMA200 — Death Cross! Uzun vadeli düşüş trendi. Çok tehlikeli bölge."
        aksiyon = "SAT — Ölüm kesişimi aktif. Uzun vadeli düşüş baskısı."
    elif sma20 < sma50:
        score = -40
        comment = "SMA20 SMA50'nin altına düşmüş, kısa vadeli trend aşağı yönlü."
        aksiyon = "HAFİF SAT — Kısa vadeli düşüş baskısı var."
    else:
        score = 0
        comment = "Hareketli ortalamalar yakın, yön belirsiz."
        aksiyon = "BEKLE — Ortalamalar iç içe geçmiş."

    return {"indicator": "sma_cross", "score": score, "weight": SIGNAL_WEIGHTS["sma_cross"],
            "weighted_score": score * SIGNAL_WEIGHTS["sma_cross"],
            "comment": comment, "aksiyon": aksiyon}


def analyze_bollinger(indicators):
    """Bollinger Bands analizi."""
    price = indicators.get("price", 0)
    upper = indicators.get("bb_upper", price)
    lower = indicators.get("bb_lower", price)
    middle = indicators.get("bb_middle", price)

    if upper == lower:
        band_pos = 0.5
    else:
        band_pos = (price - lower) / (upper - lower)

    if band_pos <= 0.05:
        score = 90
        comment = f"Fiyat Bollinger alt bandına temas etti! (₺{lower:.2f}). Aşırı satım bölgesi, güçlü geri dönüş bekleniyor."
        aksiyon = "GÜÇLÜ AL — Bollinger alt bandında, sert yükseliş gelebilir!"
    elif band_pos <= 0.2:
        score = 50
        comment = f"Fiyat alt banda yakın (₺{lower:.2f}). Destek bulabilir."
        aksiyon = "AL — Alt bant desteğinden faydalanılabilir."
    elif band_pos >= 0.95:
        score = -90
        comment = f"Fiyat Bollinger üst bandına temas etti! (₺{upper:.2f}). Aşırı alım, geri çekilme gelebilir."
        aksiyon = "GÜÇLÜ SAT — Üst bandda, düzeltme riski çok yüksek!"
    elif band_pos >= 0.8:
        score = -50
        comment = f"Fiyat üst banda yakın (₺{upper:.2f}). Direnç bölgesinde."
        aksiyon = "SAT — Üst bant direnci, kâr al düşünülebilir."
    else:
        score = 0
        comment = f"Fiyat Bollinger bandının orta bölgesinde. Orta band: ₺{middle:.2f}."
        aksiyon = "BEKLE — Bandın ortasında, net sinyal yok."

    return {"indicator": "bollinger", "score": score, "weight": SIGNAL_WEIGHTS["bollinger"],
            "weighted_score": score * SIGNAL_WEIGHTS["bollinger"],
            "comment": comment, "aksiyon": aksiyon}


def analyze_volume(indicators):
    """Hacim analizi."""
    vol_ratio = indicators.get("volume_ratio", 1)
    change = indicators.get("change_pct", 0)

    if vol_ratio > 2.5 and change > 0:
        score = 80
        comment = f"Olağanüstü yüksek hacimle yükseliş! Hacim ortalamanın {vol_ratio:.1f} katı. Büyük alıcılar piyasada, güçlü talep."
        aksiyon = "GÜÇLÜ AL — Kurumsal alım sinyali! Dev hacim + yükseliş."
    elif vol_ratio > 1.5 and change > 0:
        score = 50
        comment = f"Ortalamanın üstünde hacimle yükseliş ({vol_ratio:.1f}x). Sağlıklı alım var."
        aksiyon = "AL — Hacim destekli yükseliş, güvenilir sinyal."
    elif vol_ratio > 2.5 and change < 0:
        score = -80
        comment = f"Olağanüstü yüksek hacimle düşüş! ({vol_ratio:.1f}x). Ciddi satış baskısı, panik satışı olabilir."
        aksiyon = "SAT — Büyük satıcılar çıkıyor, kaçının!"
    elif vol_ratio > 1.5 and change < 0:
        score = -50
        comment = f"Ortalamanın üstünde hacimle düşüş ({vol_ratio:.1f}x). Satış baskısı artıyor."
        aksiyon = "HAFİF SAT — Hacimli düşüş, dikkatli olun."
    else:
        score = 0
        comment = f"Hacim normal seviyede ({vol_ratio:.1f}x). Piyasada belirgin bir hareket yok."
        aksiyon = "BEKLE — Hacim sinyali yok."

    return {"indicator": "volume", "score": score, "weight": SIGNAL_WEIGHTS["volume"],
            "weighted_score": score * SIGNAL_WEIGHTS["volume"],
            "comment": comment, "aksiyon": aksiyon}


def analyze_stochastic(indicators):
    """Stochastic Oscillator analizi."""
    k = indicators.get("stoch_k", 50)
    d = indicators.get("stoch_d", 50)
    k_prev = indicators.get("stoch_k_prev", 50)
    d_prev = indicators.get("stoch_d_prev", 50)

    cross_up = (k_prev <= d_prev) and (k > d)
    cross_down = (k_prev >= d_prev) and (k < d)

    if k <= STOCH_OVERSOLD and cross_up:
        score = 90
        comment = f"Stochastic %K ({k:.1f}) aşırı satım bölgesinde yukarı kesişim yaptı! Çok güçlü dönüş sinyali."
        aksiyon = "GÜÇLÜ AL — Stochastic dip kesişimi, sert yükseliş gelebilir!"
    elif k <= STOCH_OVERSOLD:
        score = 60
        comment = f"Stochastic %K ({k:.1f}) aşırı satım bölgesinde. Dönüş yakın olabilir."
        aksiyon = "AL — Stochastic aşırı satım, dip oluşumu izleniyor."
    elif k >= STOCH_OVERBOUGHT and cross_down:
        score = -90
        comment = f"Stochastic %K ({k:.1f}) aşırı alım bölgesinde aşağı kesişim yaptı! Çok güçlü düşüş sinyali."
        aksiyon = "GÜÇLÜ SAT — Stochastic tepe kesişimi, düşüş başlıyor!"
    elif k >= STOCH_OVERBOUGHT:
        score = -60
        comment = f"Stochastic %K ({k:.1f}) aşırı alım bölgesinde. Düzeltme yakın olabilir."
        aksiyon = "SAT — Stochastic aşırı alım, tepe oluşumu mümkün."
    elif cross_up:
        score = 40
        comment = f"Stochastic yukarı kesişim (%K: {k:.1f}, %D: {d:.1f}). Alım sinyali."
        aksiyon = "HAFİF AL — Stochastic yukarı kesiyor."
    elif cross_down:
        score = -40
        comment = f"Stochastic aşağı kesişim (%K: {k:.1f}, %D: {d:.1f}). Satış sinyali."
        aksiyon = "HAFİF SAT — Stochastic aşağı kesiyor."
    else:
        score = 0
        comment = f"Stochastic nötr bölgede (%K: {k:.1f}, %D: {d:.1f}). Net sinyal yok."
        aksiyon = "BEKLE — Stochastic belirsiz."

    return {"indicator": "stochastic", "score": score, "weight": SIGNAL_WEIGHTS["stochastic"],
            "weighted_score": score * SIGNAL_WEIGHTS["stochastic"],
            "comment": comment, "aksiyon": aksiyon}


def analyze_adx(indicators):
    """ADX analizi — trend gücü."""
    adx_val = indicators.get("adx", 0)
    plus_di = indicators.get("plus_di", 0)
    minus_di = indicators.get("minus_di", 0)

    if adx_val >= ADX_VERY_STRONG_TREND:
        trend_strength = "ÇOK GÜÇLÜ"
    elif adx_val >= ADX_STRONG_TREND:
        trend_strength = "GÜÇLÜ"
    elif adx_val >= 20:
        trend_strength = "ZAYIF"
    else:
        trend_strength = "YOK"

    if adx_val >= ADX_STRONG_TREND and plus_di > minus_di:
        score = 70
        comment = f"ADX: {adx_val:.1f} — {trend_strength} yükseliş trendi! +DI ({plus_di:.1f}) > -DI ({minus_di:.1f}). Alıcılar hakim."
        aksiyon = "AL — Güçlü yükseliş trendi teyit edildi. Trendle gidin."
    elif adx_val >= ADX_STRONG_TREND and minus_di > plus_di:
        score = -70
        comment = f"ADX: {adx_val:.1f} — {trend_strength} düşüş trendi! -DI ({minus_di:.1f}) > +DI ({plus_di:.1f}). Satıcılar hakim."
        aksiyon = "SAT — Güçlü düşüş trendi teyit edildi. Trendin karşısına geçmeyin."
    elif adx_val < 20:
        score = 0
        comment = f"ADX: {adx_val:.1f} — Trend yok, piyasa yatay seyrediyor. Alım-satım fırsatı sınırlı."
        aksiyon = "BEKLE — Trend oluşana kadar bekleyin."
    else:
        if plus_di > minus_di:
            score = 20
            comment = f"ADX: {adx_val:.1f} — Zayıf yükseliş trendi. +DI ({plus_di:.1f}) hafif üstün."
            aksiyon = "HAFİF AL — Zayıf ama pozitif trend."
        else:
            score = -20
            comment = f"ADX: {adx_val:.1f} — Zayıf düşüş trendi. -DI ({minus_di:.1f}) hafif üstün."
            aksiyon = "HAFİF SAT — Zayıf ama negatif trend."

    return {"indicator": "adx", "score": score, "weight": SIGNAL_WEIGHTS["adx"],
            "weighted_score": score * SIGNAL_WEIGHTS["adx"],
            "comment": comment, "aksiyon": aksiyon}


def analyze_fibonacci(indicators):
    """Fibonacci seviyeleri analizi."""
    price = indicators.get("price", 0)
    fib = indicators.get("fibonacci", {})

    if not fib:
        return {"indicator": "fibonacci", "score": 0, "weight": SIGNAL_WEIGHTS["fibonacci"],
                "weighted_score": 0, "comment": "Fibonacci verisi yok.", "aksiyon": "BEKLE"}

    fib_0 = fib.get("0", price)     # Tepe
    fib_382 = fib.get("0.382", price)
    fib_50 = fib.get("0.5", price)
    fib_618 = fib.get("0.618", price)
    fib_1 = fib.get("1.0", price)   # Dip

    # Fiyat hangi Fibonacci bölgesinde?
    if price >= fib_0:
        score = -40
        comment = f"Fiyat Fibonacci tepesinin (₺{fib_0}) üzerinde. Yeni zirvelere doğru gidiyor ama aşırı alım riski var."
        aksiyon = "DİKKAT — Fiyat Fibonacci dirençlerini aştı."
    elif price >= fib_382:
        score = -20
        comment = f"Fiyat %38.2 Fibonacci seviyesinin (₺{fib_382:.2f}) üzerinde. Güçlü pozisyonda ama direnç bölgesinde."
        aksiyon = "BEKLE — Fibonacci direnci yakın."
    elif price >= fib_50:
        score = 0
        comment = f"Fiyat %50 Fibonacci seviyesinde (₺{fib_50:.2f}). Kritik karar noktası. Buradan dönüş ya da kırılış olabilir."
        aksiyon = "BEKLE — %50 seviyesi, karar noktası."
    elif price >= fib_618:
        score = 40
        comment = f"Fiyat %61.8 Fibonacci desteğine (₺{fib_618:.2f}) yakın! Bu seviye 'altın oran' olarak bilinir ve sıklıkla güçlü destek sağlar."
        aksiyon = "AL — Fibonacci altın oran desteği. Tarihsel olarak güçlü dönüş noktası."
    else:
        score = 60
        comment = f"Fiyat derin Fibonacci düzeltme bölgesinde (₺{fib_1} dip seviyesine yakın). Güçlü alım fırsatı olabilir."
        aksiyon = "GÜÇLÜ AL — Derin Fibonacci desteği, dipten toparlanma bekleniyor."

    return {"indicator": "fibonacci", "score": score, "weight": SIGNAL_WEIGHTS["fibonacci"],
            "weighted_score": score * SIGNAL_WEIGHTS["fibonacci"],
            "comment": comment, "aksiyon": aksiyon}


def generate_detailed_explanation(signal_text, score, confidence, indicators, details, period_name="daily"):
    """Kullanıcı için detaylı Türkçe açıklama üretir."""
    price = indicators.get("price", 0)
    period_labels = {"daily": "Günlük", "weekly": "Haftalık", "monthly": "Aylık"}
    period_label = period_labels.get(period_name, "Günlük")

    # Neden al/sat?
    buy_reasons = [d for d in details if d["score"] > 20]
    sell_reasons = [d for d in details if d["score"] < -20]
    neutral_reasons = [d for d in details if -20 <= d["score"] <= 20]

    if score > 20:
        neden = f"🟢 {period_label} bazda ALIŞ sinyali veriyoruz. "
        if buy_reasons:
            neden += "Alım sebepleri: "
            neden += " | ".join([f"{r['aksiyon']}" for r in buy_reasons[:3]])
            neden += ". "
        if sell_reasons:
            neden += f"⚠️ Dikkat: {len(sell_reasons)} gösterge olumsuz sinyal veriyor. "
    elif score < -20:
        neden = f"🔴 {period_label} bazda SATIŞ sinyali veriyoruz. "
        if sell_reasons:
            neden += "Satış sebepleri: "
            neden += " | ".join([f"{r['aksiyon']}" for r in sell_reasons[:3]])
            neden += ". "
        if buy_reasons:
            neden += f"💡 Olumlu: {len(buy_reasons)} gösterge pozitif sinyal veriyor. "
    else:
        neden = f"🟡 {period_label} bazda BEKLEME sinyali veriyoruz. Göstergeler karışık sinyal üretiyor. "

    # Hedef fiyatlar
    targets = indicators.get("_targets", {})
    sr = indicators.get("support_resistance", {})

    hedef = ""
    if targets and score > 20:
        hedef = (
            f"\n\n🎯 HEDEF FİYATLAR ({period_label}):\n"
            f"  • 1. Hedef: ₺{targets.get('target_1', 0):.2f}\n"
            f"  • 2. Hedef: ₺{targets.get('target_2', 0):.2f}\n"
            f"  • 3. Hedef (iddialı): ₺{targets.get('target_3', 0):.2f}\n"
            f"  • 🛑 Zarar Kes (Stop-Loss): ₺{targets.get('stop_loss', 0):.2f}\n"
            f"  • ➕ Ekleme Seviyesi: ₺{targets.get('add_level', 0):.2f} — bu seviyeye düşerse ekleme yapılabilir"
        )
    elif targets and score < -20:
        hedef = (
            f"\n\n⬇️ DÜŞÜŞ HEDEFLERİ ({period_label}):\n"
            f"  • 1. Destek: ₺{targets.get('target_1', 0):.2f}\n"
            f"  • 2. Destek: ₺{targets.get('target_2', 0):.2f}\n"
            f"  • Kritik Destek: ₺{targets.get('target_3', 0):.2f}\n"
            f"  • 🛑 Eğer ₺{targets.get('stop_loss', 0):.2f} üzerine çıkarsa short kapatın"
        )

    # Destek/Direnç
    destek = ""
    if sr:
        destek = (
            f"\n\n📊 DESTEK & DİRENÇ SEVİYELERİ:\n"
            f"  • Direnç 3: ₺{sr.get('r3', 0):.2f}\n"
            f"  • Direnç 2: ₺{sr.get('r2', 0):.2f}\n"
            f"  • Direnç 1: ₺{sr.get('r1', 0):.2f}\n"
            f"  • Pivot: ₺{sr.get('pivot', 0):.2f}\n"
            f"  • Destek 1: ₺{sr.get('s1', 0):.2f}\n"
            f"  • Destek 2: ₺{sr.get('s2', 0):.2f}\n"
            f"  • Destek 3: ₺{sr.get('s3', 0):.2f}"
        )

    # Strateji
    strateji = ""
    if score >= 50:
        strateji = (
            f"\n\n💡 STRATEJİ ÖNERİSİ:\n"
            f"  Bu hisse güçlü AL sinyali veriyor. Sermayenizin %5-10'u ile pozisyon açabilirsiniz. "
            f"Stop-loss seviyenizi ₺{targets.get('stop_loss', 0):.2f} olarak belirleyin. "
            f"₺{targets.get('add_level', 0):.2f} seviyesine düşerse ekleme yapabilirsiniz. "
            f"1. hedefe ulaşınca %50, 2. hedefe ulaşınca kalan %50'yi satın."
        )
    elif score >= 20:
        strateji = (
            f"\n\n💡 STRATEJİ ÖNERİSİ:\n"
            f"  Hafif AL sinyali. Küçük bir pozisyon açabilir (sermayenin %3-5), "
            f"daha düşük seviyelerden ekleme yapabilirsiniz. Risk yönetimi önemli."
        )
    elif score <= -50:
        strateji = (
            f"\n\n💡 STRATEJİ ÖNERİSİ:\n"
            f"  Güçlü SAT sinyali. Elinizde bu hisse varsa satış düşünün. "
            f"Yeni pozisyon açmayın. Destek seviyesi: ₺{sr.get('s1', 0):.2f}."
        )
    elif score <= -20:
        strateji = (
            f"\n\n💡 STRATEJİ ÖNERİSİ:\n"
            f"  Hafif SAT sinyali. Mevcut pozisyonun bir kısmı satılabilir. "
            f"Stop-loss'unuzu sıkılaştırın."
        )
    else:
        strateji = (
            f"\n\n💡 STRATEJİ ÖNERİSİ:\n"
            f"  Şu an beklemede kalın. Gözlem yapın. Trende katılın ama başlatmayın. "
            f"Net sinyal gelene kadar pozisyon açmak riskli."
        )

    return neden + hedef + destek + strateji


def generate_recommendation(indicators, period_name="daily"):
    details = [
        analyze_rsi(indicators),
        analyze_macd(indicators),
        analyze_sma_trend(indicators),
        analyze_sma_cross(indicators),
        analyze_bollinger(indicators),
        analyze_volume(indicators),
        analyze_stochastic(indicators),
        analyze_adx(indicators),
        analyze_fibonacci(indicators),
    ]

    raw_total_score = sum(d["weighted_score"] for d in details)
    regime_key = classify_market_regime(indicators)
    profile = REGIME_PROFILES.get(regime_key, REGIME_PROFILES["neutral"])
    score_factor = profile["score_factor"]
    total_score = raw_total_score * score_factor

    max_possible = sum(abs(d["score"]) * d["weight"] for d in details)
    confidence = (abs(total_score) / max_possible * 100) if max_possible > 0 else 0
    confidence = max(0, min(100, confidence))

    signal, signal_en, color = classify_signal(total_score, profile["thresholds"])

    from technical_analysis import calculate_targets
    indicators["_score"] = total_score
    targets = calculate_targets(indicators, period_name)
    indicators["_targets"] = targets

    regime_note = f"\n\n🧭 PİYASA REJİMİ: {profile['label']} (katsayı: {score_factor:.2f})."
    explanation = generate_detailed_explanation(signal, total_score, confidence, indicators, details, period_name) + regime_note

    return {
        "signal": signal,
        "signal_en": signal_en,
        "score": round(total_score, 1),
        "confidence": round(confidence, 1),
        "color": color,
        "details": details,
        "targets": targets,
        "support_resistance": indicators.get("support_resistance", {}),
        "fibonacci": indicators.get("fibonacci", {}),
        "explanation": explanation,
        "regime": profile["label"],
        "regime_key": regime_key,
        "raw_score": round(raw_total_score, 1),
    }
