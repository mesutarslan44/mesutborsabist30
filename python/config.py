# -*- coding: utf-8 -*-
"""
BIST 30 Hisse Listesi ve Konfigürasyon
Genişletilmiş versiyon: Stochastic, ADX, Fibonacci, Hedef Fiyatlar
"""

# BIST 30 Hisseleri (Yahoo Finance formatı: .IS = Istanbul Stock Exchange)
BIST30_TICKERS = {
    "AKBNK.IS": {"name": "Akbank", "sector": "Bankacılık"},
    "ARCLK.IS": {"name": "Arçelik", "sector": "Dayanıklı Tüketim"},
    "ASELS.IS": {"name": "Aselsan", "sector": "Savunma"},
    "ASTOR.IS": {"name": "Astor Enerji", "sector": "Enerji"},
    "BIMAS.IS": {"name": "BİM", "sector": "Perakende"},
    "EKGYO.IS": {"name": "Emlak Konut GYO", "sector": "GYO"},
    "ENJSA.IS": {"name": "Enerjisa", "sector": "Enerji"},
    "ENKAI.IS": {"name": "Enka İnşaat", "sector": "İnşaat"},
    "EREGL.IS": {"name": "Ereğli Demir Çelik", "sector": "Metal"},
    "FROTO.IS": {"name": "Ford Otosan", "sector": "Otomotiv"},
    "GARAN.IS": {"name": "Garanti BBVA", "sector": "Bankacılık"},
    "GUBRF.IS": {"name": "Gübre Fabrikaları", "sector": "Kimya"},
    "HEKTS.IS": {"name": "Hektaş", "sector": "Kimya"},
    "ISCTR.IS": {"name": "İş Bankası C", "sector": "Bankacılık"},
    "KCHOL.IS": {"name": "Koç Holding", "sector": "Holding"},
    "KRDMD.IS": {"name": "Kardemir D", "sector": "Metal"},
    "MAVI.IS": {"name": "Mavi Giyim", "sector": "Perakende"},
    "MGROS.IS": {"name": "Migros", "sector": "Perakende"},
    "ODAS.IS": {"name": "Odaş Elektrik", "sector": "Enerji"},
    "PETKM.IS": {"name": "Petkim", "sector": "Kimya"},
    "PGSUS.IS": {"name": "Pegasus", "sector": "Havacılık"},
    "SAHOL.IS": {"name": "Sabancı Holding", "sector": "Holding"},
    "SASA.IS": {"name": "SASA Polyester", "sector": "Kimya"},
    "SISE.IS": {"name": "Şişecam", "sector": "Cam"},
    "TAVHL.IS": {"name": "TAV Havalimanları", "sector": "Havacılık"},
    "TCELL.IS": {"name": "Turkcell", "sector": "Telekomünikasyon"},
    "THYAO.IS": {"name": "Türk Hava Yolları", "sector": "Havacılık"},
    "TKFEN.IS": {"name": "Tekfen Holding", "sector": "Holding"},
    "TOASO.IS": {"name": "Tofaş", "sector": "Otomotiv"},
    "TUPRS.IS": {"name": "Tüpraş", "sector": "Enerji"},
    "YKBNK.IS": {"name": "Yapı Kredi", "sector": "Bankacılık"},
}

# A-G-B-E (Altın, Gümüş, Bitcoin, Ethereum) Kodları
AGBE_TICKERS = {
    "GC=F": {"name": "Altın (Ons)", "sector": "Emtia"},
    "SI=F": {"name": "Gümüş (Ons)", "sector": "Emtia"},
    "BTC-USD": {"name": "Bitcoin", "sector": "Kripto"},
    "ETH-USD": {"name": "Ethereum", "sector": "Kripto"}
}

# Endeksler
MARKET_INDICES = {
    "XU030.IS": {"name": "BIST 30", "description": "Borsa İstanbul en büyük 30 şirket"},
    "XU100.IS": {"name": "BIST 100", "description": "Borsa İstanbul en büyük 100 şirket"},
}

# Teknik Analiz Parametreleri
RSI_PERIOD = 14
RSI_OVERBOUGHT = 70
RSI_OVERSOLD = 30

MACD_FAST = 12
MACD_SLOW = 26
MACD_SIGNAL = 9

SMA_SHORT = 20
SMA_MEDIUM = 50
SMA_LONG = 200

EMA_SHORT = 12
EMA_LONG = 26

BOLLINGER_PERIOD = 20
BOLLINGER_STD = 2

VOLUME_AVG_PERIOD = 20

# Stochastic Oscillator
STOCH_K_PERIOD = 14
STOCH_D_PERIOD = 3
STOCH_OVERBOUGHT = 80
STOCH_OVERSOLD = 20

# ADX (Average Directional Index)
ADX_PERIOD = 14
ADX_STRONG_TREND = 25
ADX_VERY_STRONG_TREND = 50

# Fibonacci Seviyeleri
FIBONACCI_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0]

# Sinyal Ağırlıkları (genişletilmiş)
SIGNAL_WEIGHTS = {
    "rsi": 0.15,
    "macd": 0.20,
    "sma_trend": 0.10,
    "sma_cross": 0.10,
    "bollinger": 0.10,
    "volume": 0.08,
    "stochastic": 0.12,
    "adx": 0.08,
    "fibonacci": 0.07,
}

# Veri Çekme Periyotları
DATA_PERIODS = {
    "daily": {"period": "1y", "interval": "1d"},
    "weekly": {"period": "2y", "interval": "1wk"},
    "monthly": {"period": "5y", "interval": "1mo"},
}

# Hedef Fiyat Çarpanları
TARGET_MULTIPLIERS = {
    "daily": {"target_pct": 0.03, "stop_pct": 0.02},      # %3 hedef, %2 stop
    "weekly": {"target_pct": 0.08, "stop_pct": 0.05},      # %8 hedef, %5 stop
    "monthly": {"target_pct": 0.20, "stop_pct": 0.10},     # %20 hedef, %10 stop
}
