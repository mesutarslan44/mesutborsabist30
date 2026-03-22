/**
 * BIST 30 Analiz - Dashboard v2.0
 * Endeks yorumları, haberler, genişletilmiş tablo, veri güncellik bilgisi
 */

(function () {
    'use strict';

    let summaryData = null;
    let marketData = null;
    let performanceData = null;
    let currentFilter = 'all';
    let currentSort = { key: 'score', dir: 'desc' };
    let refreshTimer = null;

    function applySimpleModeState(enabled) {
        document.body.classList.toggle('simple-mode', !!enabled);
        var btn = document.getElementById('simpleModeToggle');
        if (btn) btn.textContent = enabled ? 'Basit Mod: Acik' : 'Basit Mod: Kapali';
    }

    function setupSimpleModeToggle() {
        var btn = document.getElementById('simpleModeToggle');
        if (!btn) return;

        var enabled = localStorage.getItem('simpleMode') === '1';
        applySimpleModeState(enabled);

        btn.addEventListener('click', function () {
            enabled = !enabled;
            localStorage.setItem('simpleMode', enabled ? '1' : '0');
            applySimpleModeState(enabled);
        });
    }

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

    function toDateFromTRString(raw) {
        if (!raw || typeof raw !== 'string') return null;
        // expected: YYYY-MM-DD HH:MM
        var normalized = raw.replace(' ', 'T') + ':00';
        var dt = new Date(normalized);
        if (isNaN(dt.getTime())) return null;
        return dt;
    }

    function formatDateTime(dt) {
        if (!dt || isNaN(dt.getTime())) return '--';
        return dt.toLocaleString('tr-TR', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    }

    function calcAgeText(dataDt, nowDt) {
        if (!dataDt || !nowDt) return '--';
        var diffMs = nowDt - dataDt;
        if (diffMs < 0) return 'Saat senkronu kontrol edilmeli';
        var totalMin = Math.floor(diffMs / 60000);
        var hours = Math.floor(totalMin / 60);
        var mins = totalMin % 60;
        return hours > 0 ? (hours + ' saat ' + mins + ' dk') : (mins + ' dk');
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
            var res3 = await fetch('data/performance.json');
            if (!res1.ok || !res2.ok) throw new Error('Veri yüklenemedi');

            summaryData = await res1.json();
            marketData = await res2.json();
            if (res3.ok) {
                performanceData = await res3.json();
            }
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
        renderCommandCenter();
        renderTopSignals();
        renderPerformance();
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

    function renderCommandCenter() {
        if (!summaryData) return;

        var counts = summaryData.signal_counts || {};
        var buyCount = (counts.STRONG_BUY || 0) + (counts.BUY || 0) + (counts.WEAK_BUY || 0);
        var holdCount = counts.HOLD || 0;
        var sellCount = (counts.STRONG_SELL || 0) + (counts.SELL || 0) + (counts.WEAK_SELL || 0);
        var total = summaryData.total_stocks || 1;

        var buyRatio = (buyCount / total) * 100;
        var sellRatio = (sellCount / total) * 100;

        var pulseText = 'Dengeli';
        var pulseMeta = 'Alici ve satici gucu benzer';
        if (buyRatio - sellRatio > 20) {
            pulseText = 'Pozitif Egilim';
            pulseMeta = 'AL sinyalleri SAT sinyallerinden belirgin yuksek';
        } else if (sellRatio - buyRatio > 20) {
            pulseText = 'Temkinli Bolge';
            pulseMeta = 'SAT tarafi gucleniyor, koruma planina oncelik ver';
        }

        var dayPlanText = 'Secici ilerle';
        var dayPlanMeta = 'En yuksek puanli 3 hisseyi takip listene ekle';
        if (buyRatio > 45) {
            dayPlanText = 'Kademeli AL penceresi';
            dayPlanMeta = 'Teyitli hisselerde parcali giris + net stop kullan';
        } else if (sellRatio > 45) {
            dayPlanText = 'Risk azaltma gunu';
            dayPlanMeta = 'Yeni islemde acele etme, mevcutlarda stop disiplini uygula';
        } else if (holdCount / total > 0.4) {
            dayPlanText = 'Sabir odakli gun';
            dayPlanMeta = 'Net sinyal az, teyit gelene kadar nakit agirligi korunabilir';
        }

        var riskScore = Math.min(100, Math.max(10, Math.round(sellRatio * 1.3 + holdCount / total * 20)));
        var riskLabel = 'Dusuk';
        if (riskScore > 70) riskLabel = 'Yuksek';
        else if (riskScore > 40) riskLabel = 'Orta';

        var pulseEl = document.getElementById('marketPulseText');
        var pulseMetaEl = document.getElementById('marketPulseMeta');
        var planEl = document.getElementById('dayPlanText');
        var planMetaEl = document.getElementById('dayPlanMeta');
        var riskFillEl = document.getElementById('riskMeterFill');
        var riskTextEl = document.getElementById('riskMeterText');

        if (pulseEl) pulseEl.textContent = pulseText;
        if (pulseMetaEl) pulseMetaEl.textContent = pulseMeta;
        if (planEl) planEl.textContent = dayPlanText;
        if (planMetaEl) planMetaEl.textContent = dayPlanMeta;
        if (riskFillEl) riskFillEl.style.width = riskScore + '%';
        if (riskTextEl) riskTextEl.textContent = 'Risk Seviyesi: ' + riskLabel + ' (%' + riskScore + ')';

        var watch = summaryData.stocks ? summaryData.stocks.slice().sort(function (a, b) {
            return (b.score || 0) - (a.score || 0);
        }).slice(0, 3) : [];

        var watchEl = document.getElementById('watchlistChips');
        if (watchEl) {
            var html = '';
            for (var i = 0; i < watch.length; i++) {
                var w = watch[i];
                html += '<a class="watch-chip" href="hisse.html?ticker=' + w.ticker + '">' + w.ticker + ' · ' + (w.score >= 0 ? '+' : '') + (w.score || 0).toFixed(1) + '</a>';
            }
            watchEl.innerHTML = html || '<span class="watch-chip">Takip listesi olusmadi</span>';
        }

        startRefreshCountdown(summaryData.updated_at);
    }

    function startRefreshCountdown(updatedAtRaw) {
        var valueEl = document.getElementById('nextRefreshText');
        var metaEl = document.getElementById('nextRefreshMeta');
        if (!valueEl) return;

        function tick() {
            var updatedAt = toDateFromTRString(updatedAtRaw);
            if (!updatedAt) {
                valueEl.textContent = '--:--:--';
                if (metaEl) metaEl.textContent = 'Saat bilgisi okunamadi';
                return;
            }

            var next = new Date(updatedAt.getTime());
            next.setMinutes(0);
            next.setSeconds(0);
            next.setMilliseconds(0);
            next.setHours(next.getHours() + 1);

            var diff = next.getTime() - Date.now();
            if (diff < 0) diff = 0;

            var totalSec = Math.floor(diff / 1000);
            var h = String(Math.floor(totalSec / 3600)).padStart(2, '0');
            var m = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
            var s = String(totalSec % 60).padStart(2, '0');
            valueEl.textContent = h + ':' + m + ':' + s;
            if (metaEl) metaEl.textContent = 'Bir sonraki saatlik veri paketine kalan sure';
        }

        tick();
        if (refreshTimer) clearInterval(refreshTimer);
        refreshTimer = setInterval(tick, 1000);
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

    // ── Performance Tracker ──
    function renderPerformance() {
        var tableBody = document.getElementById('performanceTableBody');
        if (!tableBody) return;

        if (!performanceData) {
            tableBody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--text-muted);">Performans verisi henuz olusmadi.</td></tr>';
            return;
        }

        var overall = performanceData.overview || {};
        var daily = performanceData.daily || {};
        var weekly = performanceData.weekly || {};

        document.getElementById('overallHitRate').textContent = (overall.hit_rate || 0).toFixed(1) + '%';
        document.getElementById('overallHitCount').textContent = (overall.hits || 0) + '/' + (overall.total || 0) + ' hedef';

        document.getElementById('dailyHitRate').textContent = (daily.hit_rate || 0).toFixed(1) + '%';
        document.getElementById('dailyHitMeta').textContent = (daily.hits || 0) + '/' + (daily.total || 0) + ' hedef | Ort: ' + (daily.avg_days_to_hit || 0) + ' gun';

        document.getElementById('weeklyHitRate').textContent = (weekly.hit_rate || 0).toFixed(1) + '%';
        document.getElementById('weeklyHitMeta').textContent = (weekly.hits || 0) + '/' + (weekly.total || 0) + ' hedef | Ort: ' + (weekly.avg_days_to_hit || 0) + ' gun';

        var rows = '';
        var hits = performanceData.recent_hits || [];

        for (var i = 0; i < hits.length && i < 20; i++) {
            var h = hits[i];
            var direction = h.direction === 'buy' ? 'AL' : 'SAT';
            var period = h.period === 'weekly' ? 'Haftalik' : 'Gunluk';
            rows += '<tr>';
            rows += '<td><strong>' + h.ticker + '</strong></td>';
            rows += '<td>' + period + '</td>';
            rows += '<td>' + direction + '</td>';
            rows += '<td>' + formatPrice(h.start_price) + '</td>';
            rows += '<td>' + formatPrice(h.target_price) + '</td>';
            rows += '<td>' + (h.days_to_result || 0) + '</td>';
            rows += '<td><span class="signal-badge buy"><span class="dot"></span>Tutturuldu</span></td>';
            rows += '</tr>';
        }

        tableBody.innerHTML = rows || '<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--text-muted);">Henuz tutan hedef kaydi yok.</td></tr>';
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

        var generatedAt = summaryData ? summaryData.updated_at : null;
        var marketUpdatedAt = marketData ? marketData.updated_at : null;
        var perfUpdatedAt = performanceData ? performanceData.generated_at : null;

        var generatedAtEl = document.getElementById('generatedAtValue');
        var marketUpdatedAtEl = document.getElementById('marketUpdatedAtValue');
        var perfUpdatedAtEl = document.getElementById('performanceUpdatedAtValue');
        var pageLoadedAtEl = document.getElementById('pageLoadedAtValue');
        var dataAgeEl = document.getElementById('dataAgeValue');

        var now = new Date();
        var dataDt = toDateFromTRString(generatedAt) || toDateFromTRString(marketUpdatedAt) || toDateFromTRString(perfUpdatedAt);

        if (generatedAtEl) generatedAtEl.textContent = generatedAt || '--';
        if (marketUpdatedAtEl) marketUpdatedAtEl.textContent = marketUpdatedAt || '--';
        if (perfUpdatedAtEl) perfUpdatedAtEl.textContent = perfUpdatedAt || '--';
        if (pageLoadedAtEl) pageLoadedAtEl.textContent = formatDateTime(now);
        if (dataAgeEl) dataAgeEl.textContent = calcAgeText(dataDt, now);
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
        setupSimpleModeToggle();
        setupEvents();
        loadData();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
