/**
 * BIST 30 Analiz - Hisse Detay Sayfası Orchestrator
 * Veri yükleme, gösterge kartları, sinyal analizi detayları
 */

(function () {
    'use strict';

    // ── Globals ──
    let stockData = null;
    let currentPeriod = 'daily';

    // ── URL Parameter ──
    function getTickerFromUrl() {
        const params = new URLSearchParams(window.location.search);
        return params.get('ticker') || '';
    }

    // ── Format Helpers ──
    function formatPrice(val) {
        if (val == null || isNaN(val)) return '--';
        return '₺' + val.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function formatPercent(val) {
        if (val == null || isNaN(val)) return '--%';
        const sign = val >= 0 ? '+' : '';
        return sign + val.toFixed(2) + '%';
    }

    function formatVolume(val) {
        if (val == null || isNaN(val)) return '--';
        if (val >= 1e9) return (val / 1e9).toFixed(1) + 'B';
        if (val >= 1e6) return (val / 1e6).toFixed(1) + 'M';
        if (val >= 1e3) return (val / 1e3).toFixed(0) + 'K';
        return val.toLocaleString('tr-TR');
    }

    function getChangeClass(val) {
        if (val > 0) return 'positive';
        if (val < 0) return 'negative';
        return 'neutral';
    }

    function getSignalClass(signalEn) {
        const map = {
            'STRONG_BUY': 'strong-buy',
            'BUY': 'buy',
            'WEAK_BUY': 'weak-buy',
            'HOLD': 'hold',
            'WEAK_SELL': 'weak-sell',
            'SELL': 'sell',
            'STRONG_SELL': 'strong-sell'
        };
        return map[signalEn] || 'hold';
    }

    // ── Render Stock Header ──
    function renderHeader(data, periodData) {
        const indicators = periodData.indicators || {};
        const rec = periodData.recommendation || {};

        document.getElementById('headerTicker').textContent = data.ticker;
        document.getElementById('headerName').textContent = data.name;
        document.getElementById('headerSector').textContent = data.sector;

        const priceEl = document.getElementById('headerPrice');
        priceEl.textContent = formatPrice(indicators.price);

        const changeEl = document.getElementById('headerChange');
        const changePct = indicators.change_pct || 0;
        changeEl.textContent = formatPercent(changePct);
        changeEl.className = 'stock-header-change stock-change ' + getChangeClass(changePct);

        // Signal badge
        const badgeContainer = document.getElementById('headerSignalBadge');
        if (badgeContainer && rec.signal) {
            badgeContainer.innerHTML = `
                <span class="signal-badge ${getSignalClass(rec.signal_en)}" style="font-size:14px;padding:8px 20px;">
                    <span class="dot"></span>
                    ${rec.signal}
                </span>
            `;
        }

        // Page title
        document.title = `${data.ticker} - ${data.name} | BIST 30 Analiz`;
    }

    // ── Render Recommendation Card ──
    function renderRecommendation(rec) {
        const card = document.getElementById('recCard');
        if (!card || !rec) return;

        // Determine card class
        const score = rec.score || 0;
        card.className = 'rec-card';
        if (score > 10) card.classList.add('buy');
        else if (score < -10) card.classList.add('sell');

        document.getElementById('recSignal').textContent = rec.signal || '--';
        document.getElementById('recSignal').style.color = rec.color || 'var(--text-primary)';

        const scoreEl = document.getElementById('recScore');
        scoreEl.textContent = (score > 0 ? '+' : '') + score.toFixed(1);
        scoreEl.style.color = rec.color || 'var(--text-primary)';

        const confidenceEl = document.getElementById('recConfidence');
        confidenceEl.textContent = `Güven: %${rec.confidence ? rec.confidence.toFixed(0) : 0}`;

        const fillEl = document.getElementById('recConfidenceFill');
        if (fillEl) {
            setTimeout(() => {
                fillEl.style.width = (rec.confidence || 0) + '%';
            }, 300);
        }
    }

    // ── Render Indicator Cards ──
    function renderIndicators(indicators) {
        const grid = document.getElementById('indicatorsGrid');
        if (!grid) return;

        const cards = [
            {
                name: 'RSI (14)',
                value: indicators.rsi != null ? indicators.rsi.toFixed(1) : '--',
                color: indicators.rsi >= 70 ? 'var(--bear-red)' : indicators.rsi <= 30 ? 'var(--bull-green)' : 'var(--accent-blue)',
                comment: indicators.rsi >= 70 ? 'Aşırı alım bölgesi' : indicators.rsi <= 30 ? 'Aşırı satım bölgesi' : 'Nötr bölge',
                barValue: indicators.rsi || 50,
                barMax: 100,
                barColor: indicators.rsi >= 70 ? 'var(--gradient-bear)' : indicators.rsi <= 30 ? 'var(--gradient-bull)' : 'var(--gradient-1)',
            },
            {
                name: 'MACD',
                value: indicators.macd != null ? indicators.macd.toFixed(4) : '--',
                color: indicators.macd > indicators.macd_signal ? 'var(--bull-green)' : 'var(--bear-red)',
                comment: indicators.macd > indicators.macd_signal ? 'MACD sinyal üstünde (yükseliş)' : 'MACD sinyal altında (düşüş)',
            },
            {
                name: 'SMA 20',
                value: formatPrice(indicators.sma_20),
                color: indicators.price > indicators.sma_20 ? 'var(--bull-green)' : 'var(--bear-red)',
                comment: indicators.price > indicators.sma_20 ? 'Fiyat SMA20 üstünde ✓' : 'Fiyat SMA20 altında ✗',
            },
            {
                name: 'SMA 50',
                value: formatPrice(indicators.sma_50),
                color: indicators.price > indicators.sma_50 ? 'var(--bull-green)' : 'var(--bear-red)',
                comment: indicators.price > indicators.sma_50 ? 'Fiyat SMA50 üstünde ✓' : 'Fiyat SMA50 altında ✗',
            },
            {
                name: 'Bollinger Üst',
                value: formatPrice(indicators.bb_upper),
                color: 'var(--accent-purple)',
                comment: `Orta: ${formatPrice(indicators.bb_middle)}`,
            },
            {
                name: 'Bollinger Alt',
                value: formatPrice(indicators.bb_lower),
                color: 'var(--accent-purple)',
                comment: indicators.price <= indicators.bb_lower ? 'Fiyat alt banda temas!' : '',
            },
            {
                name: 'Hacim Oranı',
                value: indicators.volume_ratio ? indicators.volume_ratio.toFixed(1) + 'x' : '--',
                color: indicators.volume_ratio > 1.5 ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                comment: indicators.volume_ratio > 2 ? 'Yüksek hacim!' : indicators.volume_ratio > 1.5 ? 'Ortalamanın üstünde' : 'Normal hacim',
            },
            {
                name: 'EMA 12/26',
                value: indicators.ema_12 ? `${indicators.ema_12.toFixed(2)}` : '--',
                color: indicators.ema_12 > indicators.ema_26 ? 'var(--bull-green)' : 'var(--bear-red)',
                comment: indicators.ema_12 > indicators.ema_26 ? 'EMA12 > EMA26 (yükseliş)' : 'EMA12 < EMA26 (düşüş)',
            },
        ];

        grid.innerHTML = cards.map(card => `
            <div class="indicator-card">
                <div class="indicator-name">${card.name}</div>
                <div class="indicator-value" style="color: ${card.color}">${card.value}</div>
                <div class="indicator-comment">${card.comment || ''}</div>
                ${card.barValue != null ? `
                    <div class="indicator-bar">
                        <div class="indicator-bar-fill" style="width: ${(card.barValue / (card.barMax || 100)) * 100}%; background: ${card.barColor || 'var(--gradient-1)'}"></div>
                    </div>
                ` : ''}
            </div>
        `).join('');
    }

    // ── Render Price Info Grid ──
    function renderPriceInfo(indicators) {
        const grid = document.getElementById('priceInfoGrid');
        if (!grid) return;

        const items = [
            { name: 'Açılış', value: formatPrice(indicators.open) },
            { name: 'Yüksek', value: formatPrice(indicators.high), color: 'var(--bull-green)' },
            { name: 'Düşük', value: formatPrice(indicators.low), color: 'var(--bear-red)' },
            { name: 'Kapanış', value: formatPrice(indicators.price) },
            { name: 'Hacim', value: formatVolume(indicators.volume) },
            { name: 'Ort. Hacim (20)', value: formatVolume(indicators.volume_avg) },
            { name: '5 Günlük Değişim', value: formatPercent(indicators.change_5d), color: indicators.change_5d >= 0 ? 'var(--bull-green)' : 'var(--bear-red)' },
            { name: '20 Günlük Değişim', value: formatPercent(indicators.change_20d), color: indicators.change_20d >= 0 ? 'var(--bull-green)' : 'var(--bear-red)' },
            { name: 'SMA 200', value: formatPrice(indicators.sma_200), color: indicators.price > indicators.sma_200 ? 'var(--bull-green)' : 'var(--bear-red)' },
        ];

        grid.innerHTML = items.map(item => `
            <div class="indicator-card">
                <div class="indicator-name">${item.name}</div>
                <div class="indicator-value" style="color: ${item.color || 'var(--text-primary)'}; font-size: 20px;">${item.value}</div>
            </div>
        `).join('');
    }

    // ── Render Analysis Details ──
    function renderAnalysisDetails(rec) {
        const container = document.getElementById('analysisDetails');
        if (!container || !rec || !rec.details) return;

        const indicatorLabels = {
            'rsi': { name: 'RSI', icon: '📊' },
            'macd': { name: 'MACD', icon: '📈' },
            'sma_trend': { name: 'SMA Trend', icon: '📉' },
            'sma_cross': { name: 'SMA Kesişim', icon: '✂️' },
            'bollinger': { name: 'Bollinger', icon: '🔔' },
            'volume': { name: 'Hacim', icon: '📊' },
        };

        container.innerHTML = rec.details.map(detail => {
            const info = indicatorLabels[detail.indicator] || { name: detail.indicator, icon: '📌' };
            const scoreClass = detail.score > 0 ? 'positive' : detail.score < 0 ? 'negative' : 'neutral';
            const scoreSign = detail.score > 0 ? '+' : '';
            const weightPct = (detail.weight * 100).toFixed(0);

            return `
                <div class="analysis-item">
                    <div class="analysis-left">
                        <span style="font-size:18px;">${info.icon}</span>
                        <div>
                            <div class="analysis-indicator-name">${info.name} <span style="color:var(--text-muted);font-weight:400;font-size:12px;">(ağırlık: %${weightPct})</span></div>
                            <div class="analysis-comment">${detail.comment}</div>
                        </div>
                    </div>
                    <div style="display:flex;align-items:center;gap:12px;">
                        <span class="analysis-score ${scoreClass}">${scoreSign}${detail.score}</span>
                        <span class="analysis-score ${scoreClass}" style="font-size:11px;opacity:0.8;">→ ${scoreSign}${detail.weighted_score.toFixed(1)}</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    // ── Switch Period ──
    function switchPeriod(period) {
        if (!stockData || !stockData.periods || !stockData.periods[period]) {
            console.warn('Bu periyot için veri yok:', period);
            return;
        }

        currentPeriod = period;
        const periodData = stockData.periods[period];

        // Update tabs
        document.querySelectorAll('.period-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.period === period);
        });

        // Re-render everything with new period data
        renderHeader(stockData, periodData);
        renderRecommendation(periodData.recommendation);
        renderIndicators(periodData.indicators);
        renderPriceInfo(periodData.indicators);
        renderAnalysisDetails(periodData.recommendation);

        // Re-render charts
        if (window.BistCharts) {
            window.BistCharts.renderAllCharts(periodData);
        }
    }

    // ── Error Display ──
    function showError(message) {
        const container = document.querySelector('.container');
        if (container) {
            container.innerHTML = `
                <a href="index.html" class="back-link">← Dashboard'a Dön</a>
                <div style="text-align:center;padding:80px 20px;">
                    <div style="font-size:64px;margin-bottom:24px;">😕</div>
                    <h2 style="margin-bottom:12px;">Hisse Bulunamadı</h2>
                    <p style="color:var(--text-muted);max-width:400px;margin:0 auto;">
                        ${message}<br><br>
                        <a href="index.html" style="color:var(--accent-blue);">Dashboard'a dön →</a>
                    </p>
                </div>
            `;
        }
    }

    // ── Period Label Mapping ──
    function getPeriodLabel(period) {
        const labels = { daily: 'Günlük', weekly: 'Haftalık', monthly: 'Aylık' };
        return labels[period] || period;
    }

    // ── Setup Period Tabs ──
    function setupPeriodTabs() {
        document.querySelectorAll('.period-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                switchPeriod(tab.dataset.period);
            });
        });
    }

    // ── Initialize ──
    async function init() {
        const ticker = getTickerFromUrl();
        if (!ticker) {
            showError('URL\'de hisse kodu bulunamadı. Dashboard\'dan bir hisse seçin.');
            return;
        }

        // Load data
        if (!window.BistCharts) {
            showError('Grafik modülü yüklenemedi.');
            return;
        }

        stockData = await window.BistCharts.loadStockData(ticker);
        if (!stockData) {
            showError(`"${ticker}" hissesi için veri bulunamadı. Python scripti çalıştırılmış mı?`);
            return;
        }

        window.BistCharts.setStockData(stockData);

        // Update badge
        const updateTime = document.getElementById('updateTime');
        if (updateTime && stockData.updated_at) {
            updateTime.textContent = 'Son: ' + stockData.updated_at;
        }

        // Setup tabs
        setupPeriodTabs();

        // Determine best available period
        const availablePeriods = Object.keys(stockData.periods || {});
        if (availablePeriods.length === 0) {
            showError(`"${ticker}" için periyot verisi bulunamadı.`);
            return;
        }

        const startPeriod = availablePeriods.includes('daily') ? 'daily' : availablePeriods[0];

        // Hide unavailable tabs
        document.querySelectorAll('.period-tab').forEach(tab => {
            if (!availablePeriods.includes(tab.dataset.period)) {
                tab.style.opacity = '0.3';
                tab.style.pointerEvents = 'none';
            }
        });

        // Initial render
        switchPeriod(startPeriod);
    }

    // Run
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
