# -*- coding: utf-8 -*-
"""
BIST 30 Veri Üretici - Ana Script
Tüm verileri çeker, analiz eder ve JSON dosyaları üretir.
"""

import json
import os
import sys
from datetime import datetime
import pandas as pd
import numpy as np

from config import BIST30_TICKERS, DATA_PERIODS
from data_fetcher import fetch_stock_data, fetch_all_stocks, get_market_info
from technical_analysis import calculate_all_indicators, get_latest_indicators
from recommendation_engine import generate_recommendation


def safe_float(val):
    """NaN-safe float dönüştürücü."""
    if val is None or (isinstance(val, float) and np.isnan(val)):
        return None
    return round(float(val), 2)


def df_to_chart_data(df, max_points=250):
    """DataFrame'i chart.js uyumlu JSON verisine çevirir."""
    if df is None or len(df) == 0:
        return []
    
    # Son max_points kadar veri al
    df = df.tail(max_points)
    
    chart_data = []
    for idx, row in df.iterrows():
        entry = {
            "date": str(idx.date()) if hasattr(idx, 'date') else str(idx),
            "open": safe_float(row.get("open")),
            "high": safe_float(row.get("high")),
            "low": safe_float(row.get("low")),
            "close": safe_float(row.get("close")),
            "volume": int(row["volume"]) if not pd.isna(row.get("volume", 0)) else 0,
        }
        
        # Teknik göstergeler varsa ekle
        for col in ["rsi", "macd", "macd_signal", "macd_histogram",
                     "sma_20", "sma_50", "sma_200", "ema_12", "ema_26",
                     "bb_upper", "bb_middle", "bb_lower", "volume_avg"]:
            if col in row.index:
                entry[col] = safe_float(row[col])
        
        chart_data.append(entry)
    
    return chart_data


def generate_stock_json(ticker, info, all_period_data):
    """Tek bir hisse için detaylı JSON dosyası üretir."""
    stock_data = {
        "ticker": ticker.replace(".IS", ""),
        "name": info["name"],
        "sector": info["sector"],
        "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M"),
        "periods": {},
    }
    
    for period_name in ["daily", "weekly", "monthly"]:
        period_data = all_period_data.get(period_name, {})
        df = period_data.get(ticker)
        
        if df is not None and len(df) > 0:
            # Teknik analiz hesapla
            analyzed_df = calculate_all_indicators(df)
            
            # En son gösterge değerleri
            indicators = get_latest_indicators(df)
            
            # Tavsiye üret
            recommendation = generate_recommendation(indicators)
            
            # Chart verileri
            chart_data = df_to_chart_data(analyzed_df)
            
            stock_data["periods"][period_name] = {
                "indicators": indicators,
                "recommendation": recommendation,
                "chart_data": chart_data,
                "data_points": len(chart_data),
            }
    
    return stock_data


def generate_summary_json(all_period_data):
    """Tüm hisselerin özet bilgilerini JSON olarak üretir."""
    summary = {
        "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M"),
        "stocks": [],
        "stats": {
            "strong_buy": 0,
            "buy": 0,
            "weak_buy": 0,
            "hold": 0,
            "weak_sell": 0,
            "sell": 0,
            "strong_sell": 0,
        }
    }
    
    daily_data = all_period_data.get("daily", {})
    
    for ticker, info in BIST30_TICKERS.items():
        df = daily_data.get(ticker)
        if df is None or len(df) < 2:
            continue
        
        indicators = get_latest_indicators(df)
        recommendation = generate_recommendation(indicators)
        
        prev_close = float(df["close"].iloc[-2]) if len(df) > 1 else indicators["price"]
        
        stock_summary = {
            "ticker": ticker.replace(".IS", ""),
            "name": info["name"],
            "sector": info["sector"],
            "price": indicators["price"],
            "change_pct": indicators["change_pct"],
            "prev_close": round(prev_close, 2),
            "volume": indicators["volume"],
            "volume_ratio": indicators["volume_ratio"],
            "rsi": indicators["rsi"],
            "signal": recommendation["signal"],
            "signal_en": recommendation["signal_en"],
            "score": recommendation["score"],
            "confidence": recommendation["confidence"],
            "color": recommendation["color"],
        }
        
        summary["stocks"].append(stock_summary)
        
        # İstatistik güncelle
        signal_key = recommendation["signal_en"].lower()
        if signal_key in summary["stats"]:
            summary["stats"][signal_key] += 1
    
    # Skora göre sırala (en güçlü AL en üstte)
    summary["stocks"].sort(key=lambda x: x["score"], reverse=True)
    
    return summary


def main():
    """Ana çalıştırma fonksiyonu."""
    print("\n" + "█" * 60)
    print("  BIST 30 ANALİZ MOTORU")
    print(f"  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("█" * 60)
    
    # Çıktı dizini
    output_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "site", "data")
    os.makedirs(output_dir, exist_ok=True)
    
    # 1. Piyasa Genel Bilgisi
    print("\n📊 Piyasa bilgisi alınıyor...")
    market_info = get_market_info()
    
    # 2. Tüm periyotlar için veri çek
    print("\n📈 Hisse verileri çekiliyor...")
    all_period_data = {}
    
    for period_name, params in DATA_PERIODS.items():
        print(f"\n{'━'*50}")
        print(f"  {period_name.upper()} veriler ({params['period']}, {params['interval']})")
        print(f"{'━'*50}")
        all_period_data[period_name] = fetch_all_stocks(
            period=params["period"],
            interval=params["interval"]
        )
    
    # 3. Özet JSON
    print("\n📋 Özet rapor oluşturuluyor...")
    summary = generate_summary_json(all_period_data)
    summary["market"] = market_info
    
    summary_path = os.path.join(output_dir, "summary.json")
    with open(summary_path, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)
    print(f"  ✓ {summary_path}")
    
    # 4. Her hisse için detaylı JSON
    print("\n📄 Hisse detay dosyaları oluşturuluyor...")
    for ticker, info in BIST30_TICKERS.items():
        has_data = any(
            ticker in all_period_data.get(p, {})
            for p in DATA_PERIODS
        )
        if not has_data:
            continue
        
        stock_json = generate_stock_json(ticker, info, all_period_data)
        ticker_clean = ticker.replace(".IS", "")
        file_path = os.path.join(output_dir, f"{ticker_clean}.json")
        
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(stock_json, f, ensure_ascii=False, indent=2)
        print(f"  ✓ {ticker_clean}.json")
    
    # 5. Piyasa genel durum dosyası
    market_overview = {
        "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M"),
        "market": market_info,
        "top_buys": [s for s in summary["stocks"] if s["score"] > 20][:5],
        "top_sells": [s for s in summary["stocks"] if s["score"] < -20][-5:][::-1],
        "stats": summary["stats"],
    }
    
    market_path = os.path.join(output_dir, "market_overview.json")
    with open(market_path, "w", encoding="utf-8") as f:
        json.dump(market_overview, f, ensure_ascii=False, indent=2)
    print(f"  ✓ {market_path}")
    
    # Sonuç özeti
    print("\n" + "█" * 60)
    print("  TAMAMLANDI!")
    print(f"  Toplam hisse: {len(summary['stocks'])}")
    print(f"  Güçlü AL: {summary['stats']['strong_buy']}")
    print(f"  AL: {summary['stats']['buy']}")
    print(f"  Hafif AL: {summary['stats']['weak_buy']}")
    print(f"  BEKLE: {summary['stats']['hold']}")
    print(f"  Hafif SAT: {summary['stats']['weak_sell']}")
    print(f"  SAT: {summary['stats']['sell']}")
    print(f"  Güçlü SAT: {summary['stats']['strong_sell']}")
    print("█" * 60 + "\n")


if __name__ == "__main__":
    main()
