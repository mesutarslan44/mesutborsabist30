# -*- coding: utf-8 -*-
"""
BIST 30 Veri Üretici - Genişletilmiş
Tüm hisse verileri + BIST 30/100 endeks yorumu + haber akışı
"""

import json
import os
import sys
import time
import pytz
from datetime import datetime, timedelta

import pandas as pd
import yfinance as yf

from config import BIST30_TICKERS, AGBE_TICKERS, MARKET_INDICES, DATA_PERIODS
from data_fetcher import fetch_stock_data, fetch_all_stocks, fetch_all_periods, get_market_info
from technical_analysis import calculate_all_indicators, get_latest_indicators
from recommendation_engine import generate_recommendation
from performance_tracker import update_performance_tracker
from decision_coach import write_decision_coach

import math

# Çıktı dizini
OUTPUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "site", "data")

def clean_nan(obj):
    if isinstance(obj, dict):
        return {k: clean_nan(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [clean_nan(v) for v in obj]
    elif isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            return None
    return obj


def ensure_output_dir():
    os.makedirs(OUTPUT_DIR, exist_ok=True)


def df_to_chart_data(analyzed_df):
    """Analiz edilmiş DataFrame'i grafik verisi formatına çevirir."""
    if analyzed_df is None or len(analyzed_df) == 0:
        return []

    chart_data = []
    for _, row in analyzed_df.iterrows():
        point = {
            "date": row.name.strftime("%Y-%m-%d") if hasattr(row.name, 'strftime') else str(row.name),
            "open": round(float(row.get("open", 0)), 2) if pd.notna(row.get("open")) else None,
            "high": round(float(row.get("high", 0)), 2) if pd.notna(row.get("high")) else None,
            "low": round(float(row.get("low", 0)), 2) if pd.notna(row.get("low")) else None,
            "close": round(float(row.get("close", 0)), 2) if pd.notna(row.get("close")) else None,
            "volume": int(row.get("volume", 0)) if pd.notna(row.get("volume")) else 0,
        }

        for col in ["rsi", "macd", "macd_signal", "macd_histogram",
                     "sma_20", "sma_50", "sma_200", "ema_12", "ema_26",
                     "bb_upper", "bb_middle", "bb_lower",
                     "stoch_k", "stoch_d", "adx", "plus_di", "minus_di",
                     "volume_avg", "volume_ratio"]:
            if col in analyzed_df.columns:
                val = row.get(col)
                point[col] = round(float(val), 4) if pd.notna(val) else None

        chart_data.append(point)
    return chart_data


def get_range_metrics(chart_data, period_len):
    if not chart_data:
        return {"min": None, "max": None}

    window = chart_data[-period_len:] if len(chart_data) > period_len else chart_data
    lows = [p.get("low") for p in window if p.get("low") is not None]
    highs = [p.get("high") for p in window if p.get("high") is not None]

    if not lows or not highs:
        return {"min": None, "max": None}

    return {
        "min": round(float(min(lows)), 2),
        "max": round(float(max(highs)), 2),
    }


def fetch_index_analysis(ticker, name):
    """Endeks analizi yapar."""
    try:
        data = yf.download(ticker, period="1y", interval="1d", progress=False)
        if data is None or len(data) == 0:
            return None

        # Flatten MultiIndex
        if isinstance(data.columns, pd.MultiIndex):
            data.columns = [col[0].lower() if isinstance(col, tuple) else col.lower() for col in data.columns]
        else:
            data.columns = [c.lower() for c in data.columns]

        latest = data.iloc[-1]
        prev = data.iloc[-2] if len(data) > 1 else latest

        close = float(latest["close"])
        prev_close = float(prev["close"])
        change = close - prev_close
        change_pct = (change / prev_close * 100) if prev_close != 0 else 0

        # Haftalık/Aylık değişim
        weekly_change = 0
        monthly_change = 0
        if len(data) >= 5:
            w = float(data["close"].iloc[-5])
            weekly_change = (close - w) / w * 100 if w != 0 else 0
        if len(data) >= 22:
            m = float(data["close"].iloc[-22])
            monthly_change = (close - m) / m * 100 if m != 0 else 0

        # Yıllık
        yearly_high = float(data["high"].max())
        yearly_low = float(data["low"].min())

        # SMA
        sma20 = float(data["close"].rolling(20).mean().iloc[-1]) if len(data) >= 20 else close
        sma50 = float(data["close"].rolling(50).mean().iloc[-1]) if len(data) >= 50 else close
        sma200 = float(data["close"].rolling(200).mean().iloc[-1]) if len(data) >= 200 else close

        # Trend yorum
        if close > sma20 > sma50:
            trend = "GÜÇLÜ YÜKSELEN"
            trend_color = "#00e676"
            yorum = f"{name} güçlü yükseliş trendinde! Endeks tüm kısa ve orta vadeli ortalamaların üzerinde. Piyasada alıcılar hakim, risk iştahı yüksek."
        elif close > sma50:
            trend = "YÜKSELEN"
            trend_color = "#69f0ae"
            yorum = f"{name} yükseliş eğiliminde. Orta vadeli ortalama olan SMA50'nin üzerinde seyrediyor. Kısa vadeli çekilmeler alım fırsatı olabilir."
        elif close > sma200:
            trend = "ZAYIF"
            trend_color = "#ffd740"
            yorum = f"{name} zayıf bir seyir izliyor. Kısa vadeli ortalamalar altında ama uzun vadeli SMA200 üzerinde. Piyasa kararsız, dikkatli olun."
        else:
            trend = "DÜŞEN"
            trend_color = "#ff5252"
            yorum = f"{name} düşüş trendinde! Tüm ortalamaların altında. Piyasada satış baskısı hakim. Yeni pozisyonlardan kaçının."

        # Genel piyasa yorumu
        if change_pct > 2:
            gunluk_yorum = "Bugün piyasada güçlü yükseliş var! Alıcılar agresif, sert bir ralli yaşanıyor."
        elif change_pct > 0.5:
            gunluk_yorum = "Bugün piyasa pozitif seyrediyor. Alıcılar ağırlıkta, olumlu hava devam ediyor."
        elif change_pct > -0.5:
            gunluk_yorum = "Bugün piyasa yatay seyrediyor. Net bir yön belli değil, hacim düşük."
        elif change_pct > -2:
            gunluk_yorum = "Bugün piyasada satış baskısı var. Dikkatli olun, destek seviyelerini takip edin."
        else:
            gunluk_yorum = "Bugün piyasada sert düşüş yaşanıyor! Panik satışı olabilir, pozisyonları gözden geçirin."

        return {
            "name": name,
            "ticker": ticker,
            "value": round(close, 2),
            "change": round(change, 2),
            "change_pct": round(change_pct, 2),
            "weekly_change_pct": round(weekly_change, 2),
            "monthly_change_pct": round(monthly_change, 2),
            "yearly_high": round(yearly_high, 2),
            "yearly_low": round(yearly_low, 2),
            "volume": int(latest.get("volume", 0)),
            "sma20": round(sma20, 2),
            "sma50": round(sma50, 2),
            "sma200": round(sma200, 2),
            "trend": trend,
            "trend_color": trend_color,
            "yorum": yorum,
            "gunluk_yorum": gunluk_yorum,
        }
    except Exception as e:
        print(f"  ⚠ {name} verisi alınamadı: {e}")
        return None


def generate_news_feed():
    """Piyasa durumuna göre otomatik haber/yorum üretir."""
    now = datetime.now(pytz.timezone('Europe/Istanbul'))
    news = [
        {
            "title": "📊 BIST 30 Teknik Analiz Raporu Güncellendi",
            "summary": f"Tüm BIST 30 hisseleri için güncel teknik analiz raporu hazırlandı. {now.strftime('%d.%m.%Y %H:%M')} itibarıyla 9 farklı gösterge ile analiz yapıldı.",
            "date": now.strftime("%d.%m.%Y %H:%M"),
            "category": "analiz",
            "icon": "📊"
        },
        {
            "title": "🔔 Stochastic & ADX Göstergeleri Eklendi",
            "summary": "Yeni teknik göstergeler: Stochastic Oscillator ve ADX (Average Directional Index) artık tüm hisseler için hesaplanıyor. Fibonacci düzeltme seviyeleri de aktif.",
            "date": now.strftime("%d.%m.%Y %H:%M"),
            "category": "güncelleme",
            "icon": "🔔"
        },
        {
            "title": "🎯 Hedef Fiyat Sistemi Aktif",
            "summary": "Her hisse için günlük, haftalık ve aylık hedef fiyatlar, stop-loss seviyeleri ve ekleme noktaları hesaplanıyor.",
            "date": now.strftime("%d.%m.%Y %H:%M"),
            "category": "özellik",
            "icon": "🎯"
        },
        {
            "title": "⏰ Veriler Borsa Saatlerinde Saatlik Güncelleniyor",
            "summary": "Piyasa açıkken (10:00 - 18:30) veriler her saat başı otomatik güncellenir. Son güncelleme saatini sayfanın üstünde görebilirsiniz.",
            "date": now.strftime("%d.%m.%Y"),
            "category": "bilgi",
            "icon": "⏰"
        },
    ]
    return news


def process_stock(ticker_yahoo, info, all_data):
    """Tek bir hisseyi işler."""
    ticker_clean = ticker_yahoo.replace(".IS", "")
    stock_result = {
        "ticker": ticker_clean,
        "ticker_yahoo": ticker_yahoo,
        "name": info["name"],
        "sector": info["sector"],
        "updated_at": datetime.now(pytz.timezone('Europe/Istanbul')).strftime("%Y-%m-%d %H:%M"),
        "update_frequency": "Borsa saatleri içerisinde (10:00 - 18:30) her saat başı otomatik güncellenir.",
        "periods": {}
    }

    for period_name, period_data in all_data.items():
        if ticker_yahoo not in period_data or period_data[ticker_yahoo] is None:
            continue
        df = period_data[ticker_yahoo]
        if df is None or len(df) < 5:
            continue

        # Analiz
        indicators = get_latest_indicators(df)
        recommendation = generate_recommendation(indicators, period_name)
        analyzed_df = calculate_all_indicators(df)
        chart_data = df_to_chart_data(analyzed_df)

        stock_result["periods"][period_name] = {
            "indicators": {k: v for k, v in indicators.items() if not k.startswith("_")},
            "recommendation": recommendation,
            "chart_data": chart_data,
        }

    return stock_result


def main():
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

    print("\n" + "█" * 60)
    print("  BIST 30 GELİŞMİŞ ANALİZ MOTORU v2.0")
    print(f"  {datetime.now(pytz.timezone('Europe/Istanbul')).strftime('%Y-%m-%d %H:%M:%S')}")
    print("  9 Gösterge | Hedef Fiyatlar | Detaylı Açıklamalar")
    print("█" * 60 + "\n")

    ensure_output_dir()
    generated_at = datetime.now(pytz.timezone('Europe/Istanbul')).strftime("%Y-%m-%d %H:%M")

    # 1. Endeks bilgileri
    print("📊 Endeks bilgileri alınıyor...")
    indices = {}
    for idx_ticker, idx_info in MARKET_INDICES.items():
        result = fetch_index_analysis(idx_ticker, idx_info["name"])
        if result:
            indices[idx_ticker.replace(".IS", "")] = result
            print(f"  ✓ {idx_info['name']}: {result['value']:,.2f} ({result['change_pct']:+.2f}%) — {result['trend']}")

    # 2. BIST 30 endeks
    bist30_info = get_market_info()

    # 3. Tüm hisse verileri (tüm periyotlar)
    print("\n📈 Hisse verileri çekiliyor (tüm periyotlar)...")
    all_data = fetch_all_periods()

    # 4. Her hisseyi analiz et
    print("\n🔬 Analiz yapılıyor (9 gösterge + hedef fiyatlar)...")
    stocks_summary = []
    performance_candidates = []
    current_prices = {}
    signal_counts = {"STRONG_BUY": 0, "BUY": 0, "WEAK_BUY": 0, "HOLD": 0,
                     "WEAK_SELL": 0, "SELL": 0, "STRONG_SELL": 0}
    top_buys = []
    top_sells = []

    tickers = list(BIST30_TICKERS.items())
    for i, (ticker_yahoo, info) in enumerate(tickers, 1):
        ticker_clean = ticker_yahoo.replace(".IS", "")
        print(f"  [{i}/{len(tickers)}] {info['name']} ({ticker_yahoo})...", end=" ")

        stock_result = process_stock(ticker_yahoo, info, all_data)

        if not stock_result["periods"]:
            print("⚠ Veri yok")
            continue

        # JSON kaydet
        output_file = os.path.join(OUTPUT_DIR, f"{ticker_clean}.json")
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(clean_nan(stock_result), f, ensure_ascii=False, indent=None)

        # Summary bilgileri topla
        daily = stock_result["periods"].get("daily", {})
        rec = daily.get("recommendation", {})
        ind = daily.get("indicators", {})

        if rec:
            signal_en = rec.get("signal_en", "HOLD")
            signal_counts[signal_en] = signal_counts.get(signal_en, 0) + 1
            daily_chart = daily.get("chart_data", [])
            range_3m = get_range_metrics(daily_chart, 63)
            range_6m = get_range_metrics(daily_chart, 126)

            summary_item = {
                "ticker": ticker_clean,
                "name": info["name"],
                "sector": info["sector"],
                "price": ind.get("price", 0),
                "change_pct": ind.get("change_pct", 0),
                "rsi": ind.get("rsi", 0),
                "stoch_k": ind.get("stoch_k", 0),
                "adx": ind.get("adx", 0),
                "volume_ratio": round(ind.get("volume_ratio", 1), 1),
                "signal": rec.get("signal", "BEKLE"),
                "signal_en": signal_en,
                "score": rec.get("score", 0),
                "confidence": rec.get("confidence", 0),
                "color": rec.get("color", "#ffd740"),
                "targets": rec.get("targets", {}),
                "range_3m": range_3m,
                "range_6m": range_6m,
                "explanation_short": rec.get("explanation", "")[:200],
            }
            stocks_summary.append(summary_item)
            current_prices[ticker_clean] = summary_item["price"]

            # Track daily + weekly first target hits for performance page
            for period_name in ["daily", "weekly"]:
                period_rec = stock_result["periods"].get(period_name, {}).get("recommendation", {})
                period_signal = period_rec.get("signal_en", "HOLD")
                target_1 = period_rec.get("targets", {}).get("target_1")

                if period_signal in ["STRONG_BUY", "BUY", "WEAK_BUY"] and target_1:
                    performance_candidates.append({
                        "ticker": ticker_clean,
                        "period": period_name,
                        "direction": "buy",
                        "opened_at": generated_at,
                        "start_price": round(float(summary_item["price"]), 4),
                        "target_price": round(float(target_1), 4),
                        "signal": period_rec.get("signal", "AL"),
                        "confidence": period_rec.get("confidence", 0),
                        "score": period_rec.get("score", 0),
                    })
                elif period_signal in ["STRONG_SELL", "SELL", "WEAK_SELL"] and target_1:
                    performance_candidates.append({
                        "ticker": ticker_clean,
                        "period": period_name,
                        "direction": "sell",
                        "opened_at": generated_at,
                        "start_price": round(float(summary_item["price"]), 4),
                        "target_price": round(float(target_1), 4),
                        "signal": period_rec.get("signal", "SAT"),
                        "confidence": period_rec.get("confidence", 0),
                        "score": period_rec.get("score", 0),
                    })

            if rec.get("score", 0) > 10:
                top_buys.append(summary_item)
            elif rec.get("score", 0) < -10:
                top_sells.append(summary_item)

            print(f"✓ {rec.get('signal', 'BEKLE')} ({rec.get('score', 0):+.1f})")
        else:
            print("✓")

    # Sort
    top_buys.sort(key=lambda x: x["score"], reverse=True)
    top_sells.sort(key=lambda x: x["score"])
    stocks_summary.sort(key=lambda x: x["score"], reverse=True)

    # 5. Haberler
    news = generate_news_feed()

    # 6. Summary JSON
    summary = {
        "updated_at": generated_at,
        "update_frequency": "Borsa saatleri içerisinde her saat başı otomatik güncellenir",
        "total_stocks": len(stocks_summary),
        "signal_counts": signal_counts,
        "stocks": stocks_summary,
        "indices": indices,
        "news": news,
    }

    with open(os.path.join(OUTPUT_DIR, "summary.json"), "w", encoding="utf-8") as f:
        json.dump(clean_nan(summary), f, ensure_ascii=False, indent=2)

    # 7. Market Overview JSON
    market_overview = {
        "updated_at": generated_at,
        "update_frequency": "Borsa saatleri içerisinde her saat başı otomatik güncellenir",
        "bist30": bist30_info,
        "indices": indices,
        "top_buys": top_buys[:5],
        "top_sells": top_sells[:5],
        "signal_counts": signal_counts,
        "news": news,
    }

    with open(os.path.join(OUTPUT_DIR, "market_overview.json"), "w", encoding="utf-8") as f:
        json.dump(clean_nan(market_overview), f, ensure_ascii=False, indent=2)

    # 8. Performance tracking JSON
    performance = update_performance_tracker(
        candidates=performance_candidates,
        current_prices=current_prices,
        generated_at=generated_at,
    )

    # 9. Decision coach JSON (karar kalitesini artiran rehber)
    write_decision_coach(
        output_path=os.path.join(OUTPUT_DIR, "decision_coach.json"),
        summary=summary,
        performance=performance,
    )

    # =========================================================================
    # A-G-B-E (Altın, Gümüş, Kripto) İŞLEMLERİ
    # =========================================================================
    print("\n" + "=" * 60)
    print("  A-G-B-E (Altın, Gümüş, Kripto) ANALİZİ BAŞLIYOR...")
    print("=" * 60)
    
    print("\n💵 USD/TRY kuru çekiliyor...")
    try:
        usdtry_df = yf.Ticker("TRY=X").history(period="1d")
        usd_rate = float(usdtry_df["Close"].iloc[-1])
        print(f"  ✓ Güncel Kur: ₺{usd_rate:.4f}")
    except Exception as e:
        print("  ✗ Kur çekilemedi, varsayılan değer 35.0 kullanılacak.")
        usd_rate = 35.0

    print("\n📈 A-G-B-E verileri çekiliyor (tüm periyotlar)...")
    all_agbe_data = fetch_all_periods(tickers_dict=AGBE_TICKERS)
    
    print("\n🔬 A-G-B-E Analizi yapılıyor...")
    agbe_summary_list = []
    agbe_performance_candidates = []
    agbe_current_prices = {}
    agbe_signal_counts = {"STRONG_BUY": 0, "BUY": 0, "WEAK_BUY": 0, "HOLD": 0,
                          "WEAK_SELL": 0, "SELL": 0, "STRONG_SELL": 0}
                          
    agbe_tickers = list(AGBE_TICKERS.items())
    for i, (ticker_yahoo, info) in enumerate(agbe_tickers, 1):
        ticker_clean = ticker_yahoo.replace(".IS", "")
        print(f"  [{i}/{len(agbe_tickers)}] {info['name']} ({ticker_yahoo})...", end=" ")

        stock_result = process_stock(ticker_yahoo, info, all_agbe_data)
        if not stock_result["periods"]:
            print("⚠ Veri yok")
            continue

        output_file = os.path.join(OUTPUT_DIR, f"{ticker_clean}.json")
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(clean_nan(stock_result), f, ensure_ascii=False, indent=None)

        daily = stock_result["periods"].get("daily", {})
        rec = daily.get("recommendation", {})
        ind = daily.get("indicators", {})

        if rec:
            signal_en = rec.get("signal_en", "HOLD")
            agbe_signal_counts[signal_en] = agbe_signal_counts.get(signal_en, 0) + 1
            daily_chart = daily.get("chart_data", [])
            range_3m = get_range_metrics(daily_chart, 63)
            range_6m = get_range_metrics(daily_chart, 126)

            summary_item = {
                "ticker": ticker_clean,
                "name": info["name"],
                "sector": info["sector"],
                "price": ind.get("price", 0),
                "change_pct": ind.get("change_pct", 0),
                "rsi": ind.get("rsi", 0),
                "stoch_k": ind.get("stoch_k", 0),
                "adx": ind.get("adx", 0),
                "volume_ratio": round(ind.get("volume_ratio", 1), 1),
                "signal": rec.get("signal", "BEKLE"),
                "signal_en": signal_en,
                "score": rec.get("score", 0),
                "confidence": rec.get("confidence", 0),
                "color": rec.get("color", "#ffd740"),
                "targets": rec.get("targets", {}),
                "range_3m": range_3m,
                "range_6m": range_6m,
                "explanation_short": rec.get("explanation", "")[:200],
            }
            
            # TL Deger Hesaplamalari (Ons -> Gram, USD -> TL)
            if ticker_clean == "GC=F":
                gram_tl = (summary_item["price"] / 31.1034768) * usd_rate
                summary_item["tl_info"] = f"Gram: ₺{gram_tl:,.0f}"
            elif ticker_clean == "SI=F":
                gram_tl = (summary_item["price"] / 31.1034768) * usd_rate
                summary_item["tl_info"] = f"Gram: ₺{gram_tl:,.0f}"
            elif ticker_clean in ["BTC-USD", "ETH-USD"]:
                coin_tl = summary_item["price"] * usd_rate
                summary_item["tl_info"] = f"₺{coin_tl:,.0f}"

            agbe_summary_list.append(summary_item)
            agbe_current_prices[ticker_clean] = summary_item["price"]

            # Track daily + weekly first target hits for AGBE performance page
            for period_name in ["daily", "weekly"]:
                period_rec = stock_result["periods"].get(period_name, {}).get("recommendation", {})
                period_signal = period_rec.get("signal_en", "HOLD")
                target_1 = period_rec.get("targets", {}).get("target_1")

                if period_signal in ["STRONG_BUY", "BUY", "WEAK_BUY"] and target_1:
                    agbe_performance_candidates.append({
                        "ticker": ticker_clean,
                        "period": period_name,
                        "direction": "buy",
                        "opened_at": generated_at,
                        "start_price": round(float(summary_item["price"]), 4),
                        "target_price": round(float(target_1), 4),
                        "signal": period_rec.get("signal", "AL"),
                        "confidence": period_rec.get("confidence", 0),
                        "score": period_rec.get("score", 0),
                    })
                elif period_signal in ["STRONG_SELL", "SELL", "WEAK_SELL"] and target_1:
                    agbe_performance_candidates.append({
                        "ticker": ticker_clean,
                        "period": period_name,
                        "direction": "sell",
                        "opened_at": generated_at,
                        "start_price": round(float(summary_item["price"]), 4),
                        "target_price": round(float(target_1), 4),
                        "signal": period_rec.get("signal", "SAT"),
                        "confidence": period_rec.get("confidence", 0),
                        "score": period_rec.get("score", 0),
                    })

            print(f"✓ {rec.get('signal', 'BEKLE')} ({rec.get('score', 0):+.1f})")
        else:
            print("✓")
            
    agbe_summary_list.sort(key=lambda x: x["score"], reverse=True)
    
    agbe_overview = {
        "updated_at": generated_at,
        "update_frequency": "7/24 Kesintisiz Güncellenir",
        "total_assets": len(agbe_summary_list),
        "signal_counts": agbe_signal_counts,
        "assets": agbe_summary_list,
    }

    with open(os.path.join(OUTPUT_DIR, "agbe_overview.json"), "w", encoding="utf-8") as f:
        json.dump(clean_nan(agbe_overview), f, ensure_ascii=False, indent=2)

    # A-G-B-E Performance tracking JSON
    agbe_performance = update_performance_tracker(
        candidates=agbe_performance_candidates, 
        current_prices=agbe_current_prices, 
        generated_at=generated_at, 
        market_type="agbe"
    )

    # Son rapor
    print("\n" + "█" * 60)
    print("  TAMAMLANDI! v2.0")
    print(f"  ✓ summary.json")
    print(f"  ✓ market_overview.json")
    print(f"  ✓ performance.json")
    print(f"  ✓ decision_coach.json")
    for ticker in BIST30_TICKERS:
        clean = ticker.replace(".IS", "")
        if os.path.exists(os.path.join(OUTPUT_DIR, f"{clean}.json")):
            print(f"  ✓ {clean}.json")
    print(f"\n  Toplam hisse: {len(stocks_summary)}")
    for sig, count in sorted(signal_counts.items()):
        if count > 0:
            print(f"  {sig}: {count}")
    print(
        f"  Performans: %{performance.get('overview', {}).get('hit_rate', 0)} "
        f"({performance.get('overview', {}).get('hits', 0)}/{performance.get('overview', {}).get('total', 0)})"
    )
    print("█" * 60)


if __name__ == "__main__":
    main()
