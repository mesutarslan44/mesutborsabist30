# -*- coding: utf-8 -*-
"""
BIST 30 Hisse Listesi ve Konfigürasyon
"""

# BIST 30 Hisseleri (Yahoo Finance formatı: .IS = Istanbul Stock Exchange)
BIST30_TICKERS = {
    "AKBNK.IS": {"name": "Akbank", "sector": "Bankacılık"},
    "ARCLK.IS": {"name": "Arçelik", "sector": "Dayanıklı Tüketim"},
    "ASELS.IS": {"name": "Aselsan", "sector": "Savunma"},
    "BIMAS.IS": {"name": "BİM", "sector": "Perakende"},
    "EKGYO.IS": {"name": "Emlak Konut GYO", "sector": "GYO"},
    "ENKAI.IS": {"name": "Enka İnşaat", "sector": "İnşaat"},
    "EREGL.IS": {"name": "Ereğli Demir Çelik", "sector": "Metal"},
    "FROTO.IS": {"name": "Ford Otosan", "sector": "Otomotiv"},
    "GARAN.IS": {"name": "Garanti BBVA", "sector": "Bankacılık"},
    "GUBRF.IS": {"name": "Gübre Fabrikaları", "sector": "Kimya"},
    "HEKTS.IS": {"name": "Hektaş", "sector": "Kimya"},
    "ISCTR.IS": {"name": "İş Bankası C", "sector": "Bankacılık"},
    "KCHOL.IS": {"name": "Koç Holding", "sector": "Holding"},
    "KOZAA.IS": {"name": "Koza Altın", "sector": "Madencilik"},
    "KOZAL.IS": {"name": "Koza Anadolu Metal", "sector": "Madencilik"},
    "KRDMD.IS": {"name": "Kardemir D", "sector": "Metal"},
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

# Sinyal Ağırlıkları
SIGNAL_WEIGHTS = {
    "rsi": 0.20,
    "macd": 0.25,
    "sma_trend": 0.15,
    "sma_cross": 0.15,
    "bollinger": 0.15,
    "volume": 0.10,
}

# Veri Çekme Periyotları
DATA_PERIODS = {
    "daily": {"period": "1y", "interval": "1d"},
    "weekly": {"period": "2y", "interval": "1wk"},
    "monthly": {"period": "5y", "interval": "1mo"},
}
