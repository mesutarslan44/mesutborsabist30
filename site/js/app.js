/**
 * BIST 30 Analiz - Dashboard JavaScript
 * Ana sayfa veri yükleme, tablo render, filtreleme ve sıralama
 */

(function () {
    'use strict';

    // ── Globals ──
    let stocksData = [];
    let currentFilter = 'all';
    let currentSort = { key: 'score', dir: 'desc' };

    // ── Data Loading ──
    async function loadSummaryData() {
        try {
            const response = await fetch('data/summary.json');
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            return data;
        } catch (err) {
            console.error('Veri yüklenirken hata:', err);
            showError('Veriler yüklenemedi. Python scripti çalıştırılmış mı?');
            return null;
        }
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

    function getRsiClass(val) {
        if (val >= 70) return 'overbought';
        if (val <= 30) return 'oversold';
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

    function getSignalIcon(signalEn) {
        if (signalEn.includes('BUY')) return '▲';
        if (signalEn.includes('SELL')) return '▼';
        return '●';
    }

    // ── Market Bar ──
    function renderMarketBar(market) {
        if (!market) return;

        const indexVal = document.getElementById('indexValue');
        const indexChange = document.getElementById('indexChange');
        const indexVolume = document.getElementById('indexVolume');
        const indexHigh = document.getElementById('indexHigh');
        const indexLow = document.getElementById('indexLow');

        if (indexVal) indexVal.textContent = market.index_value ? market.index_value.toLocaleString('tr-TR') : '--';
        if (indexChange) {
            indexChange.textContent = formatPercent(market.change_percent);
            indexChange.className = 'market-item-change ' + getChangeClass(market.change_percent);
        }
        if (indexVolume) indexVolume.textContent = formatVolume(market.volume);
        if (indexHigh) indexHigh.textContent = market.high ? market.high.toLocaleString('tr-TR') : '--';
        if (indexLow) indexLow.textContent = market.low ? market.low.toLocaleString('tr-TR') : '--';
    }

    // ── Signal Summary ──
    function renderSignalSummary(stats, totalStocks) {
        const totalEl = document.getElementById('totalStocks');
        const buyEl = document.getElementById('totalBuy');
        const holdEl = document.getElementById('totalHold');
        const sellEl = document.getElementById('totalSell');

        if (totalEl) animateNumber(totalEl, totalStocks);
        if (buyEl) animateNumber(buyEl, (stats.strong_buy || 0) + (stats.buy || 0) + (stats.weak_buy || 0));
        if (holdEl) animateNumber(holdEl, stats.hold || 0);
        if (sellEl) animateNumber(sellEl, (stats.strong_sell || 0) + (stats.sell || 0) + (stats.weak_sell || 0));
    }

    function animateNumber(el, target) {
        let current = 0;
        const step = Math.max(1, Math.floor(target / 15));
        const timer = setInterval(() => {
            current += step;
            if (current >= target) {
                current = target;
                clearInterval(timer);
            }
            el.textContent = current;
        }, 40);
    }

    // ── Top Signals ──
    function renderTopSignals(stocks) {
        const buys = stocks.filter(s => s.score > 0).slice(0, 5);
        const sells = stocks.filter(s => s.score < 0).reverse().slice(0, 5);

        const topBuysEl = document.getElementById('topBuys');
        const topSellsEl = document.getElementById('topSells');

        if (topBuysEl) {
            if (buys.length === 0) {
                topBuysEl.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);">Henüz AL sinyali yok</div>';
            } else {
                topBuysEl.innerHTML = buys.map(s => `
                    <div class="top-signal-item" onclick="window.location='hisse.html?ticker=${s.ticker}'">
                        <div>
                            <span class="top-signal-ticker">${s.ticker}</span>
                            <span style="color:var(--text-muted);font-size:12px;margin-left:8px;">${s.name}</span>
                        </div>
                        <div style="display:flex;align-items:center;gap:10px;">
                            <span class="stock-change ${getChangeClass(s.change_pct)}">${formatPercent(s.change_pct)}</span>
                            <span class="top-signal-score" style="color:var(--bull-green);background:var(--bull-green-soft);">+${s.score.toFixed(1)}</span>
                        </div>
                    </div>
                `).join('');
            }
        }

        if (topSellsEl) {
            if (sells.length === 0) {
                topSellsEl.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);">Henüz SAT sinyali yok</div>';
            } else {
                topSellsEl.innerHTML = sells.map(s => `
                    <div class="top-signal-item" onclick="window.location='hisse.html?ticker=${s.ticker}'">
                        <div>
                            <span class="top-signal-ticker">${s.ticker}</span>
                            <span style="color:var(--text-muted);font-size:12px;margin-left:8px;">${s.name}</span>
                        </div>
                        <div style="display:flex;align-items:center;gap:10px;">
                            <span class="stock-change ${getChangeClass(s.change_pct)}">${formatPercent(s.change_pct)}</span>
                            <span class="top-signal-score" style="color:var(--bear-red);background:var(--bear-red-soft);">${s.score.toFixed(1)}</span>
                        </div>
                    </div>
                `).join('');
            }
        }
    }

    // ── Stock Table ──
    function renderStockTable(stocks) {
        const tbody = document.getElementById('stockTableBody');
        if (!tbody) return;

        // Apply filter
        let filtered = stocks;
        if (currentFilter === 'buy') {
            filtered = stocks.filter(s => s.score > 0);
        } else if (currentFilter === 'sell') {
            filtered = stocks.filter(s => s.score < 0);
        } else if (currentFilter === 'hold') {
            filtered = stocks.filter(s => s.score >= -10 && s.score <= 10);
        }

        // Apply search
        const searchInput = document.getElementById('searchInput');
        if (searchInput && searchInput.value.trim()) {
            const query = searchInput.value.trim().toLowerCase();
            filtered = filtered.filter(s =>
                s.ticker.toLowerCase().includes(query) ||
                s.name.toLowerCase().includes(query) ||
                s.sector.toLowerCase().includes(query)
            );
        }

        // Apply sort
        filtered.sort((a, b) => {
            let aVal = a[currentSort.key];
            let bVal = b[currentSort.key];
            if (typeof aVal === 'string') aVal = aVal.toLowerCase();
            if (typeof bVal === 'string') bVal = bVal.toLowerCase();
            if (aVal < bVal) return currentSort.dir === 'asc' ? -1 : 1;
            if (aVal > bVal) return currentSort.dir === 'asc' ? 1 : -1;
            return 0;
        });

        if (filtered.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align:center;padding:40px;color:var(--text-muted);">
                        Kriterlere uygun hisse bulunamadı
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = filtered.map((s, i) => `
            <tr onclick="window.location='hisse.html?ticker=${s.ticker}'" class="fade-in" style="animation-delay:${i * 0.03}s">
                <td>
                    <div class="stock-name">
                        <span class="stock-ticker">${s.ticker}</span>
                        <span class="stock-fullname">${s.name} · ${s.sector}</span>
                    </div>
                </td>
                <td>
                    <span class="stock-price">${formatPrice(s.price)}</span>
                </td>
                <td>
                    <span class="stock-change ${getChangeClass(s.change_pct)}">${formatPercent(s.change_pct)}</span>
                </td>
                <td>
                    <span class="rsi-value ${getRsiClass(s.rsi)}">${s.rsi != null ? s.rsi.toFixed(1) : '--'}</span>
                </td>
                <td>
                    <span style="font-family:'JetBrains Mono',monospace;font-size:13px;color:${s.volume_ratio > 1.5 ? 'var(--accent-cyan)' : 'var(--text-secondary)'};">
                        ${s.volume_ratio ? s.volume_ratio.toFixed(1) + 'x' : '--'}
                    </span>
                </td>
                <td>
                    <span class="signal-badge ${getSignalClass(s.signal_en)}">
                        <span class="dot"></span>
                        ${s.signal}
                    </span>
                </td>
                <td>
                    <div>
                        <div class="score-bar">
                            <div class="score-bar-fill" style="
                                width: ${Math.min(100, Math.abs(s.score))}%;
                                background: ${s.score > 0 ? 'var(--gradient-bull)' : s.score < 0 ? 'var(--gradient-bear)' : 'var(--gradient-hold)'};
                            "></div>
                        </div>
                        <span class="score-value" style="color: ${s.score > 0 ? 'var(--bull-green)' : s.score < 0 ? 'var(--bear-red)' : 'var(--hold-yellow)'}">
                            ${s.score > 0 ? '+' : ''}${s.score.toFixed(1)}
                        </span>
                    </div>
                </td>
            </tr>
        `).join('');
    }

    // ── Error Display ──
    function showError(message) {
        const tbody = document.getElementById('stockTableBody');
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align:center;padding:60px 20px;">
                        <div style="font-size:48px;margin-bottom:16px;">⚠️</div>
                        <div style="font-size:16px;color:var(--text-primary);margin-bottom:8px;">Veri Yüklenemedi</div>
                        <div style="font-size:13px;color:var(--text-muted);max-width:400px;margin:0 auto;">
                            ${message}<br><br>
                            <code style="background:var(--bg-secondary);padding:8px 12px;border-radius:6px;font-size:12px;display:inline-block;margin-top:8px;">
                                cd python && pip install -r requirements.txt && python generate_data.py
                            </code>
                        </div>
                    </td>
                </tr>
            `;
        }

        // Also clear top signals
        const topBuys = document.getElementById('topBuys');
        const topSells = document.getElementById('topSells');
        if (topBuys) topBuys.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);">Veri yok</div>';
        if (topSells) topSells.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);">Veri yok</div>';
    }

    // ── Event Listeners ──
    function setupEventListeners() {
        // Search
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                renderStockTable(stocksData);
            });
        }

        // Filter buttons
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentFilter = btn.dataset.filter;
                renderStockTable(stocksData);
            });
        });

        // Sort headers
        document.querySelectorAll('.stock-table thead th[data-sort]').forEach(th => {
            th.addEventListener('click', () => {
                const key = th.dataset.sort;
                if (currentSort.key === key) {
                    currentSort.dir = currentSort.dir === 'asc' ? 'desc' : 'asc';
                } else {
                    currentSort.key = key;
                    currentSort.dir = key === 'ticker' ? 'asc' : 'desc';
                }

                // Visual feedback
                document.querySelectorAll('.stock-table thead th').forEach(t => {
                    t.style.color = '';
                });
                th.style.color = 'var(--accent-blue)';

                renderStockTable(stocksData);
            });
        });
    }

    // ── Initialization ──
    async function init() {
        setupEventListeners();

        const data = await loadSummaryData();
        if (!data) return;

        stocksData = data.stocks || [];

        // Update time
        const updateTime = document.getElementById('updateTime');
        if (updateTime && data.updated_at) {
            updateTime.textContent = 'Son: ' + data.updated_at;
        }

        // Market bar
        renderMarketBar(data.market);

        // Signal summary
        renderSignalSummary(data.stats || {}, stocksData.length);

        // Top signals
        renderTopSignals(stocksData);

        // Stock table
        renderStockTable(stocksData);
    }

    // Run
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
