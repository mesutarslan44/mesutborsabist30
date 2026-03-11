/**
 * BIST 30 Analiz - Dashboard v2.0
 * Endeks yorumları, haberler, genişletilmiş tablo, veri güncellik bilgisi
 */

(function () {
    'use strict';

    let summaryData = null;
    let marketData = null;
    let currentFilter = 'all';
    let currentSort = { key: 'score', dir: 'desc' };

    // ── Helpers ──
    function formatPrice(val) {
        if (val == null || isNaN(val)) return '--';
        return '₺' + val.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function formatPercent(val) {
        if (val == null || isNaN(val)) return '--%';
        var sign = val >= 0 ? '+' : '';
        return sign + val.toFixed(2) + '%';
    }

    function getChangeClass(val) {
        if (val > 0) return 'positive';
        if (val < 0) return 'negative';
        return 'neutral';
    }

    function getSignalClass(signalEn) {
        var map = {
            'STRONG_BUY': 'strong-buy', 'BUY': 'buy', 'WEAK_BUY': 'weak-buy',
            'HOLD': 'hold',
            'WEAK_SELL': 'weak-sell', 'SELL': 'sell', 'STRONG_SELL': 'strong-sell'
        };
        return map[signalEn] || 'hold';
    }

    function getFilterGroup(signalEn) {
        if (['STRONG_BUY', 'BUY', 'WEAK_BUY'].indexOf(signalEn) >= 0) return 'buy';
        if (['STRONG_SELL', 'SELL', 'WEAK_SELL'].indexOf(signalEn) >= 0) return 'sell';
        return 'hold';
    }

    // ── Load Data ──
    async function loadData() {
        try {
            var res1 = await fetch('data/summary.json');
            var res2 = await fetch('data/market_overview.json');
            if (!res1.ok || !res2.ok) throw new Error('Veri yüklenemedi');
            summaryData = await res1.json();
            marketData = await res2.json();
            render();
        } catch (err) {
            console.error('Veri hatası:', err);
            document.getElementById('stockTableBody').innerHTML =
                '<tr><td colspan="9" style="text-align:center;padding:40px;color:var(--bear-red);">⚠️ Veriler yüklenemedi. Lütfen sayfayı yenileyin.</td></tr>';
        }
    }

    // ── Render All ──
    function render() {
        renderUpdateBadge();
        renderMarketBar();
        renderIndexCommentary();
        renderSignalSummary();
        renderTopSignals();
        renderNews();
        renderTable();
        renderDataFreshness();
    }

    // ── Update Badge ──
    function renderUpdateBadge() {
        var el = document.getElementById('updateTime');
        if (el && summaryData && summaryData.updated_at) {
            el.textContent = 'Son: ' + summaryData.updated_at;
        }
    }

    // ── Market Bar (BIST 30 + BIST 100) ──
    function renderMarketBar() {
        var indices = (summaryData && summaryData.indices) || {};

        var bist30 = indices.XU030;
        if (bist30) {
            document.getElementById('bist30Value').textContent = bist30.value ? bist30.value.toLocaleString('tr-TR', { minimumFractionDigits: 2 }) : '--';
            var ch30 = document.getElementById('bist30Change');
            ch30.textContent = formatPercent(bist30.change_pct);
            ch30.className = 'market-change ' + getChangeClass(bist30.change_pct);
        }

        var bist100 = indices.XU100;
        if (bist100) {
            document.getElementById('bist100Value').textContent = bist100.value ? bist100.value.toLocaleString('tr-TR', { minimumFractionDigits: 2 }) : '--';
            var ch100 = document.getElementById('bist100Change');
            ch100.textContent = formatPercent(bist100.change_pct);
            ch100.className = 'market-change ' + getChangeClass(bist100.change_pct);
        }
    }

    // ── Index Commentary ──
    function renderIndexCommentary() {
        var container = document.getElementById('indexCommentary');
        if (!container) return;

        var indices = (summaryData && summaryData.indices) || {};
        var html = '';

        var indexList = [indices.XU030, indices.XU100];
        for (var i = 0; i < indexList.length; i++) {
            var idx = indexList[i];
            if (!idx) continue;

            html += '<div class="index-card">';
            html += '<div class="index-card-header">';
            html += '<div>';
            html += '<div class="index-name">' + idx.name + '</div>';
            html += '<div class="index-value">' + (idx.value ? idx.value.toLocaleString('tr-TR', { minimumFractionDigits: 2 }) : '--') + '</div>';
            html += '</div>';
            html += '<div style="text-align:right;">';
            html += '<div class="stock-change ' + getChangeClass(idx.change_pct) + '" style="font-size:18px;font-weight:700;">' + formatPercent(idx.change_pct) + '</div>';
            html += '<div style="font-size:11px;color:var(--text-muted);">';
            html += 'Hafta: <span class="' + getChangeClass(idx.weekly_change_pct) + '">' + formatPercent(idx.weekly_change_pct) + '</span> | ';
            html += 'Ay: <span class="' + getChangeClass(idx.monthly_change_pct) + '">' + formatPercent(idx.monthly_change_pct) + '</span>';
            html += '</div>';
            html += '</div>';
            html += '</div>';
            html += '<div class="index-trend" style="color:' + idx.trend_color + ';">';
            html += '<strong>Trend: ' + idx.trend + '</strong>';
            html += '</div>';
            html += '<div class="index-comment">' + idx.yorum + '</div>';
            html += '<div class="index-daily-comment" style="margin-top:8px;padding:8px 12px;background:rgba(99,102,241,0.06);border-radius:8px;font-size:13px;">';
            html += '📌 ' + idx.gunluk_yorum;
            html += '</div>';
            html += '<div style="margin-top:8px;font-size:11px;color:var(--text-muted);">';
            html += '52 Hafta: ₺' + (idx.yearly_low ? idx.yearly_low.toLocaleString('tr-TR') : '--') + ' — ₺' + (idx.yearly_high ? idx.yearly_high.toLocaleString('tr-TR') : '--');
            html += '</div>';
            html += '</div>';
        }

        container.innerHTML = html;
    }

    // ── Signal Summary ──
    function renderSignalSummary() {
        if (!summaryData) return;
        var counts = summaryData.signal_counts || {};

        animateCounter('totalCount', summaryData.total_stocks || 0);
        animateCounter('buyCount', (counts.STRONG_BUY || 0) + (counts.BUY || 0) + (counts.WEAK_BUY || 0));
        animateCounter('holdCount', counts.HOLD || 0);
        animateCounter('sellCount', (counts.STRONG_SELL || 0) + (counts.SELL || 0) + (counts.WEAK_SELL || 0));
    }

    function animateCounter(elementId, target) {
        var el = document.getElementById(elementId);
        if (!el) return;
        var start = 0;
        var duration = 800;
        var startTime = null;

        function step(timestamp) {
            if (!startTime) startTime = timestamp;
            var progress = Math.min((timestamp - startTime) / duration, 1);
            el.textContent = Math.floor(progress * target);
            if (progress < 1) requestAnimationFrame(step);
            else el.textContent = target;
        }
        requestAnimationFrame(step);
    }

    // ── Top Signals ──
    function renderTopSignals() {
        if (!marketData) return;

        var buysHtml = '';
        var buys = marketData.top_buys || [];
        for (var i = 0; i < buys.length; i++) {
            var s = buys[i];
            buysHtml += '<a href="hisse.html?ticker=' + s.ticker + '" class="top-signal-item buy">';
            buysHtml += '<div class="top-signal-left">';
            buysHtml += '<strong>' + s.ticker + '</strong> <span style="opacity:0.6">' + s.name + '</span>';
            buysHtml += '</div>';
            buysHtml += '<div class="top-signal-right">';
            buysHtml += '<span class="stock-change ' + getChangeClass(s.change_pct) + '">' + formatPercent(s.change_pct) + '</span>';
            buysHtml += '<span class="signal-badge ' + getSignalClass(s.signal_en) + '"><span class="dot"></span>' + s.signal + '</span>';
            buysHtml += '<span class="score-value" style="color:' + s.color + '">+' + s.score.toFixed(1) + '</span>';
            buysHtml += '</div></a>';
        }
        document.getElementById('topBuys').innerHTML = buysHtml || '<div style="padding:16px;color:var(--text-muted);">Güçlü AL sinyali yok</div>';

        var sellsHtml = '';
        var sells = marketData.top_sells || [];
        for (var j = 0; j < sells.length; j++) {
            var t = sells[j];
            sellsHtml += '<a href="hisse.html?ticker=' + t.ticker + '" class="top-signal-item sell">';
            sellsHtml += '<div class="top-signal-left">';
            sellsHtml += '<strong>' + t.ticker + '</strong> <span style="opacity:0.6">' + t.name + '</span>';
            sellsHtml += '</div>';
            sellsHtml += '<div class="top-signal-right">';
            sellsHtml += '<span class="stock-change ' + getChangeClass(t.change_pct) + '">' + formatPercent(t.change_pct) + '</span>';
            sellsHtml += '<span class="signal-badge ' + getSignalClass(t.signal_en) + '"><span class="dot"></span>' + t.signal + '</span>';
            sellsHtml += '<span class="score-value" style="color:' + t.color + '">' + t.score.toFixed(1) + '</span>';
            sellsHtml += '</div></a>';
        }
        document.getElementById('topSells').innerHTML = sellsHtml || '<div style="padding:16px;color:var(--text-muted);">Güçlü SAT sinyali yok</div>';
    }

    // ── News ──
    function renderNews() {
        var container = document.getElementById('newsContainer');
        if (!container || !summaryData || !summaryData.news) return;

        var html = '';
        var news = summaryData.news;
        for (var i = 0; i < news.length; i++) {
            var n = news[i];
            html += '<div class="news-card">';
            html += '<div class="news-icon">' + n.icon + '</div>';
            html += '<div class="news-content">';
            html += '<div class="news-title">' + n.title + '</div>';
            html += '<div class="news-summary">' + n.summary + '</div>';
            html += '<div class="news-meta">' + n.date + ' | ' + n.category + '</div>';
            html += '</div></div>';
        }
        container.innerHTML = html;
    }

    // ── Table ──
    function renderTable() {
        if (!summaryData || !summaryData.stocks) return;
        var tbody = document.getElementById('stockTableBody');
        var search = (document.getElementById('searchInput').value || '').toUpperCase();

        var stocks = summaryData.stocks.slice();

        // Filter
        if (currentFilter !== 'all') {
            stocks = stocks.filter(function (s) { return getFilterGroup(s.signal_en) === currentFilter; });
        }

        // Search
        if (search) {
            stocks = stocks.filter(function (s) {
                return s.ticker.toUpperCase().indexOf(search) >= 0 || s.name.toUpperCase().indexOf(search) >= 0;
            });
        }

        // Sort
        stocks.sort(function (a, b) {
            var aVal = a[currentSort.key] || 0;
            var bVal = b[currentSort.key] || 0;
            if (typeof aVal === 'string') aVal = aVal.toLowerCase();
            if (typeof bVal === 'string') bVal = bVal.toLowerCase();
            if (currentSort.dir === 'asc') return aVal > bVal ? 1 : -1;
            return aVal < bVal ? 1 : -1;
        });

        var html = '';
        for (var i = 0; i < stocks.length; i++) {
            var s = stocks[i];
            var scoreBarWidth = Math.min(Math.abs(s.score || 0), 100);
            var scoreColor = (s.score || 0) >= 0 ? 'var(--bull-green)' : 'var(--bear-red)';

            html += '<tr class="stock-row" onclick="window.location.href=\'hisse.html?ticker=' + s.ticker + '\'" style="animation-delay:' + (i * 30) + 'ms">';
            html += '<td><div class="stock-cell-name">';
            html += '<strong>' + s.ticker + '</strong>';
            html += '<span class="stock-sector">' + s.name + ' · ' + s.sector + '</span>';
            html += '</div></td>';
            html += '<td class="price-cell">' + formatPrice(s.price) + '</td>';
            html += '<td><span class="stock-change ' + getChangeClass(s.change_pct) + '">' + formatPercent(s.change_pct) + '</span></td>';
            html += '<td>' + (s.rsi ? s.rsi.toFixed(1) : '--') + '</td>';
            html += '<td>' + (s.stoch_k ? s.stoch_k.toFixed(1) : '--') + '</td>';
            html += '<td>' + (s.adx ? s.adx.toFixed(1) : '--') + '</td>';
            html += '<td>' + (s.volume_ratio || '--') + 'x</td>';
            html += '<td><span class="signal-badge ' + getSignalClass(s.signal_en) + '"><span class="dot"></span>' + s.signal + '</span></td>';
            html += '<td><div class="score-cell">';
            html += '<span class="score-value" style="color:' + scoreColor + '">' + (s.score >= 0 ? '+' : '') + (s.score || 0).toFixed(1) + '</span>';
            html += '<div class="score-bar"><div class="score-bar-fill" style="width:' + scoreBarWidth + '%;background:' + scoreColor + ';"></div></div>';
            html += '</div></td>';
            html += '</tr>';
        }

        tbody.innerHTML = html || '<tr><td colspan="9" style="text-align:center;padding:40px;">Sonuç bulunamadı</td></tr>';
    }

    // ── Data Freshness ──
    function renderDataFreshness() {
        var lastUpdateEl = document.getElementById('lastUpdateText');
        if (lastUpdateEl && summaryData) {
            lastUpdateEl.textContent = 'Son güncelleme: ' + (summaryData.updated_at || 'Bilinmiyor') +
                ' | ' + (summaryData.update_frequency || '');
        }
    }

    // ── Events ──
    function setupEvents() {
        // Search
        var searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('input', function () { renderTable(); });
        }

        // Filter tabs
        var filterTabs = document.querySelectorAll('.filter-tab');
        for (var i = 0; i < filterTabs.length; i++) {
            filterTabs[i].addEventListener('click', function () {
                for (var j = 0; j < filterTabs.length; j++) filterTabs[j].classList.remove('active');
                this.classList.add('active');
                currentFilter = this.dataset.filter;
                renderTable();
            });
        }

        // Sort
        var sortHeaders = document.querySelectorAll('th[data-sort]');
        for (var k = 0; k < sortHeaders.length; k++) {
            sortHeaders[k].addEventListener('click', function () {
                var key = this.dataset.sort;
                if (currentSort.key === key) {
                    currentSort.dir = currentSort.dir === 'asc' ? 'desc' : 'asc';
                } else {
                    currentSort.key = key;
                    currentSort.dir = 'desc';
                }
                renderTable();
            });
        }
    }

    // ── Init ──
    function init() {
        setupEvents();
        loadData();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
