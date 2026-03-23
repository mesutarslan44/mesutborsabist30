# -*- coding: utf-8 -*-
"""
Yahoo Finance'den BIST 30 hisse verilerini çekme modülü
"""

import yfinance as yf
import pandas as pd
import time
import pytz
from datetime import datetime, timedelta
from config import BIST30_TICKERS, DATA_PERIODS


def fetch_stock_data(ticker, period="1y", interval="1d", retries=1):
    """Tek bir hisse için veri çeker. Hata durumunda tekrar dener."""
    for attempt in range(retries + 1):
        try:
            stock = yf.Ticker(ticker)
            df = stock.history(period=period, interval=interval)
            if df.empty:
                if attempt < retries:
                    time.sleep(1)
                    continue
                print(f"  ⚠ {ticker}: Veri bulunamadı")
                return None
            df.dropna(subset=['Close'], inplace=True)
            if df.empty:
                return None
            # Sütun isimlerini standartlaştır
            df = df.rename(columns={
                "Open": "open",
                "High": "high",
                "Low": "low",
                "Close": "close",
                "Volume": "volume",
            })
            df.index = df.index.tz_localize(None)
            df = df[["open", "high", "low", "close", "volume"]]
            return df
        except Exception as e:
            if attempt < retries:
                time.sleep(1)
                continue
            print(f"  ✗ {ticker}: Hata - {e}")
            return None


def fetch_all_stocks(period="1y", interval="1d"):
    """Tüm BIST 30 hisseleri için veri çeker."""
    all_data = {}
    total = len(BIST30_TICKERS)
    
    print(f"\n{'='*50}")
    print(f"  BIST 30 Verileri Çekiliyor ({period}, {interval})")
    print(f"{'='*50}\n")
    
    for i, (ticker, info) in enumerate(BIST30_TICKERS.items(), 1):
        print(f"  [{i}/{total}] {info['name']} ({ticker})...", end=" ")
        df = fetch_stock_data(ticker, period, interval)
        if df is not None and len(df) > 0:
            all_data[ticker] = df
            last_price = df["close"].iloc[-1]
            print(f"✓ {len(df)} kayıt - Son: ₺{last_price:.2f}")
        else:
            print("✗ Atlandı")
        
        # Rate limiting için kısa bir bekleme (Yahoo Finance banlamasını önler)
        time.sleep(0.5)
    
    print(f"\n  Toplam: {len(all_data)}/{total} hisse başarıyla çekildi\n")
    return all_data


def fetch_all_periods():
    """Tüm periyotlar için veri çeker (günlük, haftalık, aylık)."""
    all_period_data = {}
    
    for period_name, params in DATA_PERIODS.items():
        print(f"\n{'#'*60}")
        print(f"  {period_name.upper()} veriler çekiliyor...")
        print(f"{'#'*60}")
        all_period_data[period_name] = fetch_all_stocks(
            period=params["period"],
            interval=params["interval"]
        )
    
    return all_period_data


def get_market_info():
    """XU030 (BIST 30 Endeksi) bilgisini çeker."""
    try:
        xu030 = yf.Ticker("XU030.IS")
        df = xu030.history(period="1y", interval="1d")
        if not df.empty:
            df.index = df.index.tz_localize(None)
            last = df.iloc[-1]
            prev = df.iloc[-2] if len(df) > 1 else df.iloc[-1]
            change = ((last["Close"] - prev["Close"]) / prev["Close"]) * 100
            return {
                "index_value": round(float(last["Close"]), 2),
                "change_percent": round(float(change), 2),
                "volume": int(last["Volume"]),
                "high": round(float(last["High"]), 2),
                "low": round(float(last["Low"]), 2),
                "date": str(df.index[-1].date()),
            }
    except Exception as e:
        print(f"  ✗ XU030 endeks bilgisi alınamadı: {e}")
    
    tz_istanbul = pytz.timezone('Europe/Istanbul')
    return {
        "index_value": 0,
        "change_percent": 0,
        "volume": 0,
        "high": 0,
        "low": 0,
        "date": str(datetime.now(tz_istanbul).date()),
    }
